import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { assertProductCreated, buildProductForm, NewProduct, resolveProductFormOptions, ProductFormOptions, validateNewProduct } from './product-form';
import type { ProductPhoto } from './product-form';
import { orderEndpoints } from './order-endpoints';

const API_URL = 'https://crtup.in/api';

export type LoginResponse = {
  status?: boolean | string;
  message?: string;
  msg?: string;
  data?: Array<{
    id?: number;
    first_name?: string;
    username?: string;
    email?: string;
    phone_number?: string;
    role_id?: number | string;
    roleid?: number | string;
    roleId?: number | string;
    user_role_id?: number | string;
    role?: number | string;
  }>;
  userRoleList?: Record<string, Array<number | string>>;
  [key: string]: unknown;
};

let authenticatedRoleId = 0;
let authenticatedUserId = 0;
let authenticatedUserName = '';
let authenticated = false;
let merchantPortalCookie = '';
let portalSecurityKey = '';

// Browser cookies are HttpOnly; native sessions are restored from SecureStore.
async function sessionFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (Platform.OS !== 'web') {
    if (!merchantPortalCookie) throw new Error('Your portal session has expired. Please sign in again.');
    headers.set('Cookie', merchantPortalCookie);
    if (!portalSecurityKey) throw new Error('Please sign in again with your portal security key.');
    headers.set('X-Accrabasket-App-Key', portalSecurityKey);
  }
  return fetch(url, { ...init, headers, credentials: 'include' });
}

const authListeners = new Set<() => void>();
export function subscribeAuthentication(listener: () => void) {
  authListeners.add(listener);
  return () => { authListeners.delete(listener); };
}
function notifyAuthentication() { authListeners.forEach((listener) => listener()); }

const SESSION_KEY = 'accrabasket_session_v1';

export async function restoreAuthentication(): Promise<void> {
  const saved = Platform.OS === 'web'
    ? localStorage.getItem(SESSION_KEY)
    : await SecureStore.getItemAsync(SESSION_KEY);
  if (!saved) {
    if (Platform.OS === 'web' && sessionStorage.getItem('accrabasket_authenticated') === '1') {
      authenticatedRoleId = Number(sessionStorage.getItem('accrabasket_role_id'));
      authenticatedUserId = Number(sessionStorage.getItem('accrabasket_user_id'));
      if (authenticatedRoleId > 0 && authenticatedUserId > 0) await setAuthenticated(true);
    }
    return;
  }
  const session = JSON.parse(saved);
  if (session.authenticated === true && Number(session.userId) > 0 && Number(session.roleId) > 0) {
    authenticated = true;
    authenticatedRoleId = Number(session.roleId);
    authenticatedUserId = Number(session.userId);
    authenticatedUserName = typeof session.userName === 'string' ? session.userName : '';
    merchantPortalCookie = Platform.OS === 'web' ? '' : String(session.portalCookie || '');
    portalSecurityKey = Platform.OS === 'web' ? '' : String(session.portalSecurityKey || '');
    notifyAuthentication();
  }
}

export async function setAuthenticated(value: boolean): Promise<void> {
  if (value) {
    const session = JSON.stringify({ authenticated: true, roleId: authenticatedRoleId, userId: authenticatedUserId, userName: authenticatedUserName,
      ...(Platform.OS === 'web' ? {} : { portalCookie: merchantPortalCookie, portalSecurityKey }) });
    if (Platform.OS === 'web') localStorage.setItem(SESSION_KEY, session);
    else await SecureStore.setItemAsync(SESSION_KEY, session);
    authenticated = true;
  } else {
    if (Platform.OS === 'web') {
      localStorage.removeItem(SESSION_KEY);
      for (const key of ['accrabasket_authenticated', 'accrabasket_role_id', 'accrabasket_user_id', 'accrabasket_product_filters', 'accrabasket_product_scroll']) sessionStorage.removeItem(key);
      await sessionFetch('/api/admin-session', { method: 'DELETE', credentials: 'include' }).catch(() => undefined);
    } else await SecureStore.deleteItemAsync(SESSION_KEY);
    authenticated = false;
    authenticatedRoleId = 0;
    authenticatedUserId = 0;
    authenticatedUserName = '';
    merchantPortalCookie = '';
    portalSecurityKey = '';
    selectedProduct = null;
    productListFilters = { productName: '', categoryId: null };
    productListScrollOffset = 0;
  }
  notifyAuthentication();
}

export function isAuthenticated() { return authenticated; }
export function setAuthenticatedRoleId(roleId: number) { authenticatedRoleId = roleId; }
export function getAuthenticatedRoleId() { return authenticatedRoleId; }
export function setAuthenticatedUserId(userId: number) { authenticatedUserId = userId; }
export function getAuthenticatedUserId() { return authenticatedUserId; }
export function setAuthenticatedUserName(name: string) { authenticatedUserName = name.trim(); }
export function getAuthenticatedUserName() { return authenticatedUserName; }

function requireProductAdmin() {
  if (!authenticated || authenticatedRoleId !== 1) throw new Error('Only signed-in administrators can add products.');
}

export async function getNewProductOptions(): Promise<ProductFormOptions> {
  requireProductAdmin();
  const web = Platform.OS === 'web';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await sessionFetch(web ? '/api/product-create' : 'https://crtup.in/accrabasket/admin/product/addproduct', {
      credentials: 'include', signal: controller.signal,
      headers: !web && merchantPortalCookie ? { Cookie: merchantPortalCookie } : undefined,
    });
    if (web) {
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Product options could not be loaded.');
      const data = result.data;
      if (!data || !['categories', 'promotions', 'taxes'].every((key) => Array.isArray(data[key]) && data[key].every((option: { value?: unknown; label?: unknown }) => option && typeof option.value === 'string' && typeof option.label === 'string'))) {
        throw new Error('The product service returned an incomplete form. Please try again.');
      }
      if (!data.categories.length) throw new Error('No categories could be loaded. Please try again.');
      return data;
    }
    if (!response.ok) throw new Error('Your admin product session has expired or is unavailable. Please reconnect products.');
    return await resolveProductFormOptions(await response.text(), getCategories);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Loading the product form took too long. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function createProduct(product: NewProduct, options: ProductFormOptions): Promise<void> {
  requireProductAdmin();
  const error = validateNewProduct(product, options);
  if (error) throw new Error(error);
  const web = Platform.OS === 'web';
  const form = buildProductForm(product, (body, key, photo) => {
    if (web) {
      if (!photo.file) throw new Error('Please choose the photo again before saving.');
      body.append(key, photo.file, photo.name);
    } else {
      body.append(key, { uri: photo.uri, name: photo.name, type: photo.mimeType } as unknown as Blob);
    }
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await sessionFetch(web ? '/api/product-create' : 'https://crtup.in/accrabasket/admin/product/saveproduct', {
      method: 'POST', body: form, credentials: 'include', redirect: 'manual', signal: controller.signal,
      headers: !web && merchantPortalCookie ? { Cookie: merchantPortalCookie } : undefined,
    });
    await assertProductCreated(response);
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Saving the product took too long. Check the product list before retrying to avoid creating a duplicate.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export type ProductVariant = {
  id: number;
  attribute_id?: number;
  store_id?: number;
  merchant_product_code?: string;
  attribute_name: string;
  price: number;
  stock: number;
  unit: string;
  quantity: number;
  actual_price?: string;
  status?: number;
  commission_type?: string;
  commission_value?: string;
  discount_type?: string;
  discount_value?: string;
};

export type MerchantStore = { id: number; store_name: string };
export type MerchantOption = { id: number; name: string };

async function callBasketApi(controller: 'index' | 'product' | 'customer', parameters: Record<string, unknown>) {
  if (!authenticated || authenticatedRoleId !== 2) throw new Error('A merchant session is required for this operation.');
  const endpoints: Record<string, string> = {
    'customer:orderlist': 'getOrderList',
    'customer:updateOrderstatus': 'changestatus',
    'index:storeList': 'storelist',
    'index:addEditInventry': 'saveinventory',
  };
  const action = endpoints[controller + ':' + parameters.method];
  if (!action) throw new Error('Unsupported portal operation.');
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (key === 'method' || key === 'merchant_id') continue;
    if (Array.isArray(value)) value.forEach(item => body.append(key + '[]', String(item)));
    else if (value != null) body.set(key, String(value));
  }
  const response = await sessionFetch(Platform.OS === 'web'
    ? '/api/merchant?action=' + action
    : 'https://crtup.in/accrabasket/merchant/product/' + action, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString(),
  });
  if (response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400)) {
    throw new Error('Your portal session has expired or access was denied. Please sign in again.');
  }
  if (!response.ok) throw new Error('The portal request failed.');
  return response.json() as Promise<{ status?: string; data?: unknown; msg?: string }>;
}

export type MerchantOrder = {
  storeId: number;
  orderId: string; userName: string; shippingAddress: string; commissionAmount: string;
  amount: string; status: string; deliveryDate: string; createdDate: string; timeSlot: string;
};

export type MerchantOrderItem = {
  id: number; productName: string; orderedQuantity: number; packQuantity: number | string;
  unit: string; unitPrice: number; amount: number; imageUrl?: string;
};

export type MerchantOrderDetails = MerchantOrder & { userId: number; items: MerchantOrderItem[] };

async function callAdminOrders(action: keyof typeof orderEndpoints, fields: Record<string, string>) {
  if (!authenticated || authenticatedRoleId !== 1) throw new Error('Only signed-in administrators can manage rider assignments.');
  const web = Platform.OS === 'web';
  const response = await sessionFetch(web ? `/api/orders?action=${action}` : `https://crtup.in/accrabasket/admin/${orderEndpoints[action]}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(!web && merchantPortalCookie ? { Cookie: merchantPortalCookie } : {}) },
    body: new URLSearchParams(fields).toString(),
  });
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Your order session is unavailable. Please sign out and sign in again.'); }
  if (!response.ok) throw new Error(result.msg || result.message || 'The order service is unavailable.');
  return result;
}

async function fetchOrders(fields: Record<string, string>) {
  if (getAuthenticatedRoleId() === 1) return callAdminOrders('list', fields);
  if (!authenticated || getAuthenticatedRoleId() !== 2) throw new Error('Please sign in as an administrator or merchant to view orders.');
  return callBasketApi('customer', { method: 'orderlist', merchant_id: getAuthenticatedUserId(), pagination: 1, ...fields });
}

export type OrderRider = { id: string; name: string };
export async function getOrderRiders(storeId: number): Promise<OrderRider[]> {
  if (!Number.isFinite(storeId) || storeId <= 0) throw new Error('This order has no valid store for rider assignment.');
  const result = await callAdminOrders('riders', { store_id: String(storeId) });
  if (result.status !== 'success') {
    if (/^no record found\s*$/i.test(result.msg || '')) return [];
    throw new Error(result.msg || 'Riders could not be loaded.');
  }
  return Object.entries(result.data || {}).map(([id, value]) => {
    const rider = value as Record<string, unknown>;
    return { id: String(rider.id || id), name: String(rider.name || rider.first_name || rider.username || `Rider ${id}`) };
  });
}

export async function assignOrderRider(orderId: string, riderId: string): Promise<void> {
  if (!orderId.trim() || !riderId.trim()) throw new Error('Please select an order and rider.');
  const result = await callAdminOrders('assign', { order_id: orderId, rider_id: riderId });
  if (result.status !== 'success') throw new Error(result.msg || 'The rider could not be assigned.');
}

export async function getMerchantOrderDetails(orderId: string): Promise<MerchantOrderDetails> {
  const result = await fetchOrders({
    order_id: orderId,
  }) as { status?: string; data?: Record<string, { order_details: Record<string, unknown>; orderitem?: Record<string, Record<string, unknown>> }>; shipping_address_list?: Record<string, Record<string, unknown>>; user_details?: Record<string, Record<string, unknown>>; time_slot_list?: Record<string, Record<string, unknown>>; imageRootPath?: string; msg?: string };
  const record = result.data?.[orderId] || Object.values(result.data || {})[0];
  if (result.status !== 'success' || !record) throw new Error(result.msg || 'Order details could not be loaded.');
  const order = record.order_details;
  const user = result.user_details?.[String(order.user_id)] || {};
  const address = result.shipping_address_list?.[String(order.shipping_address_id)] || {};
  const slot = result.time_slot_list?.[String(order.time_slot_id)] || {};
  const items = Object.values(record.orderitem || {}).map((item) => {
    const dump = (item.product_dump || {}) as Record<string, unknown>;
    const product = (dump.product_details || {}) as Record<string, unknown>;
    const rawImages = dump.product_image_data;
    const imageCandidates = Array.isArray(rawImages) ? rawImages : rawImages && typeof rawImages === 'object' ? Object.values(rawImages as Record<string, unknown>).flatMap((value) => Array.isArray(value) ? value : [value]) : [];
    const image = imageCandidates.find((value) => value && typeof value === 'object' && 'image_name' in value) as Record<string, unknown> | undefined;
    const imageUrl = image?.image_url ? String(image.image_url) : image?.image_name && result.imageRootPath
      ? `${result.imageRootPath}/${String(image.type || 'product')}/${String(image.image_id || product.product_id || '')}/${String(image.image_name)}`
      : undefined;
    const orderedQuantity = Number(item.number_of_item || 0);
    const amount = Number(item.amount || 0);
    return {
      id: Number(item.id || item.merchant_product_id || 0), productName: String(product.product_name || 'Product'),
      orderedQuantity, packQuantity: (product.quantity as number | string) ?? '', unit: String(product.unit || ''),
      unitPrice: orderedQuantity ? amount / orderedQuantity : Number(product.price || amount), amount, imageUrl,
    };
  });
  return {
    storeId: Number(order.store_id || 0),
    userId: Number(order.user_id || 0),
    orderId: String(order.order_id || orderId), userName: String(user.name || address.contact_name || '—'),
    shippingAddress: String(address.city_name || address.address_nickname || '—'), commissionAmount: String(order.commission_amount || '0.00'),
    amount: String(order.amount || order.payable_amount || '0.00'), status: String(order.order_status || ''),
    deliveryDate: String(order.delivery_date || '—'), createdDate: String(order.created_date || '—'),
    timeSlot: slot.start_time_slot ? `${slot.start_time_slot}-${slot.end_time_slot || ''}` : '—', items,
  };
}

export async function updateMerchantOrderStatus(orderId: string, userId: number, status: 'ready_to_dispatch'): Promise<void> {
  const result = await callBasketApi('customer', {
    method: 'updateOrderstatus',
    user_id: userId,
    ...(getAuthenticatedRoleId() === 2 ? { merchant_id: getAuthenticatedUserId() } : {}),
    order_id: orderId,
    order_status: status,
  });
  if (result.status !== 'success') throw new Error(result.msg || 'Order status could not be updated.');
}

export async function getMerchantOrderPage(filters: { page?: number; status?: string; orderId?: string } = {}): Promise<{ orders: MerchantOrder[]; total: number }> {
  const result = await fetchOrders({
    page: String(filters.page || 1),
    ...(filters.orderId?.trim() ? { order_id: filters.orderId.trim() } : { order_status: filters.status || 'current_order' }),
  }) as { status?: string; data?: Record<string, { order_details: Record<string, unknown> }>; shipping_address_list?: Record<string, Record<string, unknown>>; user_details?: Record<string, Record<string, unknown>>; time_slot_list?: Record<string, Record<string, unknown>>; totalNumberOfOrder?: number; msg?: string };
  if (result.status !== 'success') {
    if (/^no record found\s*$/i.test(result.msg || '')) return { orders: [], total: 0 };
    throw new Error(result.msg || 'Orders could not be loaded.');
  }
  if (!result.data) return { orders: [], total: 0 };
  const orders = Object.values(result.data).map(({ order_details: order }) => {
    const user = result.user_details?.[String(order.user_id)] || {};
    const address = result.shipping_address_list?.[String(order.shipping_address_id)] || {};
    const slot = result.time_slot_list?.[String(order.time_slot_id)] || {};
    return {
      storeId: Number(order.store_id || 0),
      orderId: String(order.order_id || ''), userName: String(user.name || address.contact_name || '—'),
      shippingAddress: String(address.city_name || address.address_nickname || '—'),
      commissionAmount: String(order.commission_amount || '0.00'), amount: String(order.amount || order.payable_amount || '0.00'),
      status: String(order.order_status || ''), deliveryDate: String(order.delivery_date || '—'), createdDate: String(order.created_date || '—'),
      timeSlot: slot.start_time_slot ? `${slot.start_time_slot}-${slot.end_time_slot || ''}` : '—',
    };
  });
  return { orders, total: Number(result.totalNumberOfOrder || orders.length) };
}

export async function getMerchantStores(): Promise<MerchantStore[]> {
  const result = await callBasketApi('index', {
    method: 'storeList',
    merchant_id: getAuthenticatedUserId(),
  });
  if (result.status !== 'success' || !result.data) throw new Error(result.msg || 'Stores could not be loaded.');
  return Object.values(result.data as Record<string, MerchantStore>).map((store) => ({ ...store, id: Number(store.id) }));
}

export async function saveMerchantInventory(input: { productId: number; storeId: number; variants: Array<{ id: number; attribute_id?: number; price: number | string; stock: number | string; merchant_product_code?: string }> }): Promise<void> {
  const result = await callBasketApi('index', {
    method: 'addEditInventry',
    merchant_id: getAuthenticatedUserId(),
    product_id: input.productId,
    store_id: [input.storeId],
    attribute_id: input.variants.map((variant) => Number(variant.attribute_id || variant.id)),
    price: input.variants.map((variant) => variant.price === '' ? '00' : variant.price),
    stock: input.variants.map((variant) => variant.stock === '' || Number(variant.stock) === 0 ? '00' : variant.stock),
    merchant_product_code: input.variants.map((variant) => variant.merchant_product_code || ''),
  });
  if (result.status !== 'success') throw new Error(result.msg || 'Inventory could not be saved.');
}

export type Category = {
  id: number;
  category_name: string;
  category_des?: string;
  parent_category_id?: number;
  status?: number;
};

export type Product = {
  product_id: number;
  product_name: string;
  product_desc?: string;
  brand_name?: string;
  category_id?: number;
  price: number;
  attribute?: Record<string, ProductVariant>;
  image_url?: string;
  status?: number;
  id?: number;
  item_code?: string;
  nutrition?: string;
  hotdeals?: number;
  offers?: number;
  new_arrival?: number;
  promotion_id?: number;
  tax_id?: number;
  discount_type?: string;
  discount_value?: string;
};

let selectedProduct: Product | null = null;
let productListFilters: { productName: string; categoryId: number | null } = {
  productName: '',
  categoryId: null,
};
const PRODUCT_FILTERS_KEY = 'accrabasket_product_filters';
let productListScrollOffset = 0;

export function setProductListScrollOffset(offset: number) {
  productListScrollOffset = Math.max(0, offset);
  if (Platform.OS === 'web') {
    try { sessionStorage.setItem('accrabasket_product_scroll', String(productListScrollOffset)); } catch { /* unavailable */ }
  }
}

export function getProductListScrollOffset() {
  if (Platform.OS === 'web') {
    try {
      const stored = Number(sessionStorage.getItem('accrabasket_product_scroll'));
      if (Number.isFinite(stored)) productListScrollOffset = Math.max(0, stored);
    } catch { /* unavailable */ }
  }
  return productListScrollOffset;
}

export function selectProductForEdit(product: Product) {
  selectedProduct = product;
}

export function getSelectedProduct() {
  return selectedProduct;
}

export function getProductListFilters() {
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(PRODUCT_FILTERS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { productName?: unknown; categoryId?: unknown };
        const categoryId = parsed.categoryId === null ? null : Number(parsed.categoryId);
        productListFilters = {
          productName: typeof parsed.productName === 'string' ? parsed.productName : '',
          categoryId: categoryId === null || Number.isFinite(categoryId) ? categoryId : null,
        };
      }
    } catch {
      // Continue with the in-memory value if browser storage is unavailable.
    }
  }
  return productListFilters;
}

export function setProductListFilters(filters: { productName: string; categoryId: number | null }) {
  productListFilters = { ...filters };
  if (Platform.OS === 'web' && typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(PRODUCT_FILTERS_KEY, JSON.stringify(productListFilters));
    } catch {
      // In-memory persistence still works when browser storage is unavailable.
    }
  }
}

export type EditableProduct = {
  id: number;
  product_name: string;
  category_id: number;
  item_code: string;
  product_desc: string;
  nutrition: string;
  brand_name: string;
  status: number;
  hotdeals: number;
  offers: number;
  new_arrival: number;
  promotion_id?: number;
  tax_id?: number;
  discount_type?: string;
  discount_value?: string;
  attributes: Array<{ id?: number; name: string; quantity: string; unit: string; status?: number; commission_type?: string; commission_value?: string; discount_type?: string; discount_value?: string }>;
};

type ProductImage = { type?: string; image_name?: string };

type ProductListResponse = {
  status?: string;
  data?: Record<string, Product>;
  productImageData?: Record<string, ProductImage | ProductImage[]>;
  imageRootPath?: string;
  totalNumberOFRecord?: number | string;
  totalRecord?: number | string;
  productimage?: Record<string, ProductImage | ProductImage[]>;
  inventry_detail?: Record<string, Record<string, Partial<ProductVariant>>>;
  message?: string;
  msg?: string;
};

export async function createAdminSession(username: string, password: string, roleId = 0, securityKey = ''): Promise<void> {
  const isWeb = Platform.OS === 'web';
  const nativeKey = securityKey.trim();
  if (!isWeb && !/^[a-f0-9]{64}$/.test(nativeKey)) throw new Error('Enter your 64-character portal security key.');
  const nativeLoginUrl = 'https://crtup.in/accrabasket/admin/index';
  // Establish a cookie explicitly because Android may hide redirect cookies.
  let portalCookie = '';
  if (!isWeb) {
    const initial = await fetch('https://crtup.in/accrabasket/admin/index/login', { credentials: 'omit', headers: { 'X-Accrabasket-App-Key': nativeKey }, redirect: 'manual' });
    portalCookie = (initial.headers.get('set-cookie') || '').split(';')[0];
  }
  const response = await fetch(isWeb ? '/api/admin-session' : nativeLoginUrl, {
    method: 'POST',
    headers: isWeb ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Accrabasket-App-Key': nativeKey, ...(portalCookie ? { Cookie: portalCookie } : {}) },
    body: isWeb ? JSON.stringify({ username, password, roleId }) : new URLSearchParams({ username, password }).toString(),
    credentials: 'include',
    redirect: isWeb ? 'follow' : 'manual',
  });
  if (!isWeb) {
    portalCookie = (response.headers.get('set-cookie') || '').split(';')[0] || portalCookie;
    if (response.status >= 400 || !portalCookie) throw new Error('Unable to open the product portal session.');
    // React Native can follow a 302 even when manual redirects are requested.
    // Verify actual access instead of rejecting a successful final 200 response.
    const check = await fetch(roleId === 2
      ? 'https://crtup.in/accrabasket/merchant/product/getproductlist'
      : 'https://crtup.in/accrabasket/admin/product/getProductList', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Accrabasket-App-Key': nativeKey, Cookie: portalCookie },
      body: 'page=1&limit=1',
    });
    const result = await check.json() as ProductListResponse;
    const noProducts = result.status === 'fail' && (result.msg || result.message)?.trim().toLowerCase() === 'no record found';
    if (!check.ok || (result.status !== 'success' && !noProducts)) throw new Error('Unable to open the product portal session.');
    merchantPortalCookie = portalCookie;
    portalSecurityKey = nativeKey;
    return;
  }
  if (!response.ok) throw new Error('Unable to open the product portal session.');
}

export async function loginApi(username: string, password: string): Promise<LoginResponse> {
  const params = new URLSearchParams({ username, password });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    // Browsers cannot call crtup.in directly because that server does not return
    // CORS headers. The web build uses our same-origin server route instead.
    const url = Platform.OS === 'web'
      ? `/api/login?${params}`
      : `${API_URL}/usercontroller/loginuser?${params}`;
    const response = await fetch(url, {
      method: 'GET', signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`The server returned an error (${response.status}).`);
    try {
      return JSON.parse(text) as LoginResponse;
    } catch {
      throw new Error('The server sent an unexpected response.');
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The request took too long. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getProductPage(filters: { productName?: string; categoryId?: number | null; categoryName?: string; page?: number; limit?: number } = {}): Promise<{ products: Product[]; total: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const isWeb = Platform.OS === 'web';
    const params = new URLSearchParams({ product_name: filters.productName?.trim() || '' });
    if (filters.categoryId != null) params.set('category_id', String(filters.categoryId));
    if (filters.categoryName) params.set('category_name', filters.categoryName);
    if (filters.categoryName) {
      params.set('filter_type', 'Category_name');
      params.set('value', filters.categoryName);
    } else if (filters.productName?.trim()) {
      params.set('filter_type', 'Product_name');
      params.set('value', filters.productName.trim());
    }
    params.set('page', String(filters.page || 1));
    params.set('limit', String(filters.limit || 10));
    const roleId = getAuthenticatedRoleId();
    const merchantId = roleId === 2 ? getAuthenticatedUserId() : 0;
    params.set('role_id', String(roleId));
    if (merchantId) params.set('merchant_id', String(merchantId));
    const isMerchant = roleId === 2;
    const fetchProducts = async (source: 'mapped' | 'admin') => {
      const requestParams = new URLSearchParams(params);
      requestParams.set('source', source);
      const nativeProductUrl = source === 'mapped'
        ? 'https://crtup.in/accrabasket/merchant/product/getproductlist'
        : 'https://crtup.in/accrabasket/admin/product/getProductList';
      const nativeHeaders: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
      if (merchantPortalCookie) nativeHeaders.Cookie = merchantPortalCookie;
      const response = await sessionFetch(isWeb ? `/api/products?${requestParams}` : nativeProductUrl, {
        method: isWeb ? 'GET' : 'POST',
        headers: isWeb ? undefined : nativeHeaders,
        body: isWeb ? undefined : requestParams.toString(),
        signal: controller.signal,
        credentials: 'include',
      });
      if (response.status === 401) throw new Error('Your product session has expired. Please sign out and sign in again.');
      if (!response.ok) throw new Error(`The server returned an error (${response.status}).`);
      const responseText = await response.text();
      try {
        return JSON.parse(responseText) as ProductListResponse;
      } catch {
        if (/<!doctype|<html/i.test(responseText)) {
          throw new Error('Your merchant product session has expired. Please sign out and sign in again.');
        }
        throw new Error('The product service returned an unexpected response.');
      }
    };

    // The portal already returns mapped products and their inventory together.
    // A separate inventory response must not overwrite a successful list.
    const result = await fetchProducts(isMerchant ? 'mapped' : 'admin');
    if (result.status?.toLowerCase() !== 'success' || !result.data) {
      const message = result.message || result.msg;
      if (result.status?.toLowerCase() === 'fail' && message?.trim().toLowerCase() === 'no record found') {
        return { products: [], total: 0 };
      }
      throw new Error(message || 'Products could not be loaded.');
    }
    const inventory = Object.values(result.inventry_detail || {})[0] || {};
    const products = Object.values(result.data).map((rawProduct) => {
      const raw = rawProduct as Product & { id?: number; atribute?: Array<{ id: number; name: string; quantity: number; unit: string; status?: number; commission_type?: string; commission_value?: string; discount_type?: string; discount_value?: string }> };
      const productId = Number(raw.product_id || raw.id);
      const normalizedAttributes = raw.attribute || Object.fromEntries((raw.atribute || []).map((item) => [String(item.id), {
        ...inventory[String(item.id)],
        id: Number(inventory[String(item.id)]?.id || item.id), attribute_id: Number(item.id),
        attribute_name: item.name, price: Number(inventory[String(item.id)]?.price ?? 0), stock: Number(inventory[String(item.id)]?.stock ?? 0),
        quantity: Number(item.quantity), unit: item.unit, status: Number(item.status ?? 1),
        commission_type: item.commission_type, commission_value: item.commission_value,
        discount_type: item.discount_type, discount_value: item.discount_value,
      }]));
      const imageMap = result.productImageData || result.productimage;
      const imageValue = imageMap?.[String(productId)];
      const image = Array.isArray(imageValue) ? imageValue.find((item) => item.type === 'product') || imageValue[0] : imageValue;
      const imageUrl = result.imageRootPath && image?.image_name
        ? `${result.imageRootPath}/${image.type || 'product'}/${productId}/${image.image_name}`
        : undefined;
      return { ...raw, product_id: productId, attribute: normalizedAttributes, image_url: imageUrl };
    });
    return { products, total: Number(result.totalRecord || result.totalNumberOFRecord || products.length) };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Loading products took too long. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getCategories(): Promise<Category[]> {
  const portal = getAuthenticatedRoleId() === 2 ? 'merchant' : 'admin';
  const response = await sessionFetch(Platform.OS === 'web'
    ? '/api/categories?portal=' + portal
    : 'https://crtup.in/accrabasket/' + portal + '/product/getCategoryList', { method: 'POST' });
  if (!response.ok) throw new Error('Your category session is unavailable. Please sign in again.');
  const result = await response.json() as { status?: string; data?: Record<string, Category> | Category[]; msg?: string; message?: string };
  if (result.status !== 'success' || !result.data) throw new Error(result.message || result.msg || 'Categories could not be loaded.');
  return Object.values(result.data).map(category => ({ ...category, id: Number(category.id) }));
}

export async function saveProduct(product: EditableProduct, replacementImage?: ProductPhoto): Promise<void> {
  const isWeb = Platform.OS === 'web';
  let body: string | FormData;
  let headers: Record<string, string> | undefined;

  if (isWeb) {
    if (replacementImage) {
      if (!replacementImage.file) throw new Error('Please choose the product image again before saving.');
      const form = new FormData();
      form.append('product', JSON.stringify(product));
      form.append('product_img[]', replacementImage.file, replacementImage.name);
      body = form;
    } else {
      body = JSON.stringify(product);
      headers = { 'Content-Type': 'application/json' };
    }
  } else {
    const form = new FormData();
    form.append('id', String(product.id));
    form.append('product_name', product.product_name);
    form.append('category_id', String(product.category_id));
    form.append('promotion_id', String(product.promotion_id || ''));
    form.append('item_code', product.item_code || '');
    form.append('product_desc', product.product_desc || '');
    form.append('nutrition', product.nutrition || '');
    form.append('tax_id', String(product.tax_id || ''));
    form.append('brand_name', product.brand_name || '');
    form.append('product_discount_type', product.discount_type || '');
    form.append('product_discount_value', product.discount_value || '');
    form.append('hotdeals', String(product.hotdeals || 0));
    form.append('offers', String(product.offers || 0));
    form.append('new_arrival', String(product.new_arrival || 0));
    form.append('status', String(product.status));
    form.append('index', String(product.attributes.length));
    product.attributes.forEach((attribute) => {
      form.append('attribute_id[]', String(attribute.id || ''));
      form.append('attribute_name[]', attribute.name);
      form.append('attribute_unit[]', attribute.unit);
      form.append('attribute_quantity[]', attribute.quantity);
      form.append('attribute_commission_type[]', attribute.commission_type || 'flat');
      form.append('attribute_commission_value[]', attribute.commission_value || '0.00');
      form.append('attribute_discount_type[]', attribute.discount_type || '');
      form.append('attribute_discount_value[]', attribute.discount_value || '');
    });
    if (replacementImage) form.append('product_img[]', { uri: replacementImage.uri, name: replacementImage.name, type: replacementImage.mimeType } as unknown as Blob);
    body = form;
  }

  const response = await sessionFetch(isWeb ? '/api/product-save' : 'https://crtup.in/accrabasket/admin/product/saveproduct', {
    method: 'POST', headers: !isWeb && merchantPortalCookie ? { ...headers, Cookie: merchantPortalCookie } : headers, body, credentials: 'include', redirect: 'follow',
  });
  await assertProductCreated(response);
}

async function adminMerchantMappingRequest(action: 'merchants' | 'mappings', body?: never): Promise<unknown>;
async function adminMerchantMappingRequest(action: 'map', body: { productId: number; merchantIds: number[] }): Promise<unknown>;
async function adminMerchantMappingRequest(action: 'merchants' | 'mappings' | 'map', body?: { productId: number; merchantIds: number[] }) {
  const isWeb = Platform.OS === 'web';
  const endpoint = action === 'merchants' ? 'merchantList' : action === 'mappings' ? 'productMerchantMappings' : 'mapMerchant';
  const requestBody = action === 'map' && body
    ? new URLSearchParams([['product_id', String(body.productId)], ...body.merchantIds.map((id) => ['merchant_ids[]', String(id)])]).toString()
    : '';
  const response = await sessionFetch(isWeb ? `/api/merchant-mapping?action=${action}` : `https://crtup.in/accrabasket/admin/product/${endpoint}`, {
    method: action === 'map' ? 'POST' : 'GET',
    headers: { ...(action === 'map' ? { 'Content-Type': isWeb ? 'application/json' : 'application/x-www-form-urlencoded' } : {}), ...(!isWeb && merchantPortalCookie ? { Cookie: merchantPortalCookie } : {}) },
    body: action === 'map' ? (isWeb ? JSON.stringify(body) : requestBody) : undefined,
    credentials: 'include',
  });
  const result = await response.json() as { status?: string; data?: unknown; msg?: string };
  if (!response.ok || result.status !== 'success') throw new Error(result.msg || 'Merchant mapping could not be loaded.');
  return result.data;
}

export async function getMerchantMappingData(): Promise<{ merchants: MerchantOption[]; mappings: Record<number, number[]> }> {
  const [merchantData, mappingData] = await Promise.all([
    adminMerchantMappingRequest('merchants'), adminMerchantMappingRequest('mappings'),
  ]);
  const merchants = Object.values((merchantData || {}) as Record<string, Record<string, unknown>>).map((merchant) => ({
    id: Number(merchant.id), name: String(merchant.name || merchant.merchant_name || merchant.first_name || `Merchant ${merchant.id}`),
  }));
  const mappings = Object.fromEntries(Object.entries((mappingData || {}) as Record<string, Array<Record<string, unknown>>>).map(([productId, values]) => [
    Number(productId), values.map((merchant) => Number(merchant.id)),
  ]));
  return { merchants, mappings };
}

export async function saveProductMerchantMapping(productId: number, merchantIds: number[]): Promise<void> {
  await adminMerchantMappingRequest('map', { productId, merchantIds });
}
