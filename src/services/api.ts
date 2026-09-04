import { Platform } from 'react-native';

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
  }>;
  [key: string]: unknown;
};

export type ProductVariant = {
  id: number;
  attribute_name: string;
  price: number;
  stock: number;
  unit: string;
  quantity: number;
  actual_price?: string;
  status?: number;
};

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
  message?: string;
};

export async function createAdminSession(username: string, password: string): Promise<void> {
  const isWeb = Platform.OS === 'web';
  const response = await fetch(isWeb ? '/api/admin-session' : 'https://crtup.in/accrabasket/admin/index', {
    method: 'POST',
    headers: isWeb ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: isWeb ? JSON.stringify({ username, password }) : new URLSearchParams({ username, password }).toString(),
    credentials: 'include',
  });
  if (!response.ok) throw new Error('Unable to open the admin product session.');
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
    const response = await fetch(isWeb ? `/api/products?${params}` : 'https://crtup.in/accrabasket/admin/product/getProductList', {
      method: isWeb ? 'GET' : 'POST',
      headers: isWeb ? undefined : { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: isWeb ? undefined : params.toString(),
      signal: controller.signal,
      credentials: 'include',
    });
    if (!response.ok) throw new Error(`The server returned an error (${response.status}).`);

    const result = await response.json() as ProductListResponse;
    if (result.status?.toLowerCase() !== 'success' || !result.data) {
      throw new Error(result.message || 'Products could not be loaded.');
    }
    const products = Object.values(result.data).map((rawProduct) => {
      const raw = rawProduct as Product & { id?: number; atribute?: Array<{ id: number; name: string; quantity: number; unit: string; status?: number }> };
      const productId = Number(raw.product_id || raw.id);
      const normalizedAttributes = raw.attribute || Object.fromEntries((raw.atribute || []).map((item) => [String(item.id), {
        id: Number(item.id), attribute_name: item.name, price: 0, stock: 0,
        quantity: Number(item.quantity), unit: item.unit, status: Number(item.status ?? 1),
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
  const response = await fetch(Platform.OS === 'web' ? '/api/categories' : 'https://crtup.in');
  if (!response.ok) throw new Error('Categories could not be loaded.');

  if (Platform.OS === 'web') {
    const result = await response.json() as { status?: string; data?: Category[]; message?: string };
    if (result.status?.toLowerCase() !== 'success' || !Array.isArray(result.data)) {
      throw new Error(result.message || 'Categories could not be loaded.');
    }
    return result.data.map((category) => ({ ...category, id: Number(category.id) }));
  }

  const html = await response.text();
  const match = html.match(/var\s+categoryList\s*=\s*(\{[\s\S]*?\});/);
  if (!match?.[1]) throw new Error('The category list was not found.');
  return Object.values(JSON.parse(match[1]) as Record<string, Category>);
}
