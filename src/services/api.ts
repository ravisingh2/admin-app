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
};

type ProductImage = { type?: string; image_name?: string };

type ProductListResponse = {
  status?: string;
  data?: Record<string, Product>;
  productImageData?: Record<string, ProductImage | ProductImage[]>;
  imageRootPath?: string;
  message?: string;
};

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

export async function getAllProducts(filters: { productName?: string; categoryId?: number | null } = {}): Promise<Product[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const isWeb = Platform.OS === 'web';
    const params = new URLSearchParams({ product_name: filters.productName?.trim() || '' });
    if (filters.categoryId != null) params.set('category_id', String(filters.categoryId));
    const response = await fetch(isWeb ? `/api/products?${params}` : 'https://crtup.in/productlist', {
      method: isWeb ? 'GET' : 'POST',
      headers: isWeb ? undefined : { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: isWeb ? undefined : params.toString(),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The server returned an error (${response.status}).`);

    const result = await response.json() as ProductListResponse;
    if (result.status?.toLowerCase() !== 'success' || !result.data) {
      throw new Error(result.message || 'Products could not be loaded.');
    }
    return Object.values(result.data).map((product) => {
      const imageValue = result.productImageData?.[String(product.product_id)];
      const image = Array.isArray(imageValue) ? imageValue[0] : imageValue;
      const imageUrl = result.imageRootPath && image?.image_name
        ? `${result.imageRootPath}/${image.type || 'product'}/${product.product_id}/${image.image_name}`
        : undefined;
      return { ...product, image_url: imageUrl };
    });
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
