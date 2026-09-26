export type ProductOption = { value: string; label: string };
export type ProductFormOptions = { categories: ProductOption[]; promotions: ProductOption[]; taxes: ProductOption[] };
export type ProductPhoto = { uri: string; name: string; mimeType: string; file?: Blob };
export type NewProductAttribute = {
  name: string; quantity: string; unit: string; commission_type: string; commission_value: string;
  discount_type: string; discount_value: string; images: ProductPhoto[];
};
export type NewProduct = {
  product_name: string; category_id: string; promotion_id: string; item_code: string;
  product_desc: string; nutrition: string; tax_id: string; brand_name: string;
  product_discount_type: string; product_discount_value: string;
  hotdeals: boolean; offers: boolean; new_arrival: boolean; status: string;
  images: ProductPhoto[]; nutritionImage: ProductPhoto | null;
  attributes: NewProductAttribute[]; customFields: Array<{ title: string; description: string }>;
};

export const PRODUCT_UNITS: ProductOption[] = [
  { value: 'grams', label: 'Grams' }, { value: 'liter', label: 'Liter' }, { value: 'kg', label: 'Kg' },
  { value: 'ml', label: 'ML' }, { value: 'sticks', label: 'Sticks' }, { value: 'Piece', label: 'Piece' },
  { value: 'Full', label: 'Full' }, { value: 'Half', label: 'Half' },
];
export const blankAttribute = (): NewProductAttribute => ({ name: '', quantity: '', unit: '', commission_type: 'flat', commission_value: '0.00', discount_type: '', discount_value: '', images: [] });
export const blankProduct = (): NewProduct => ({
  product_name: '', category_id: '', promotion_id: '', item_code: '', product_desc: '', nutrition: '', tax_id: '', brand_name: '',
  product_discount_type: '', product_discount_value: '', hotdeals: false, offers: false, new_arrival: false,
  status: '0', images: [], nutritionImage: null, attributes: [blankAttribute()], customFields: [],
});

function decodeHtml(value: string) {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    if (entity[0] !== '#') return entities[entity.toLowerCase()] || match;
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code <= 0x10ffff ? String.fromCodePoint(code) : match;
  }).trim();
}

class ProductCategoriesUnavailable extends Error {
  constructor() { super('No categories could be loaded. Please try again.'); }
}

// Read the live portal's choices so category, promotion and tax IDs never go stale.
export function parseProductFormOptions(html: string, fallbackCategories: ProductOption[] = []): ProductFormOptions {
  const attribute = (tag: string, name: string): string | undefined => {
    const match = tag.match(new RegExp(`(?:\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    const value = match && (match[1] ?? match[2] ?? match[3]);
    return value == null ? undefined : decodeHtml(value);
  };
  const form = Array.from(html.matchAll(/<form\b[^>]*>/gi)).find(([tag]) => /(?:^|\/)saveproduct\/?(?:[?#].*)?$/i.test(attribute(tag, 'action') || ''));
  if (!form) {
    throw new Error('Your admin product session has expired or access was denied. Please reconnect products.');
  }
  const readSelect = (name: string) => {
    const select = Array.from(html.matchAll(/(<select\b[^>]*>)([\s\S]*?)<\/select\s*>/gi)).find((match) => attribute(match[1], 'name') === name);
    if (!select) {
      if (name === 'category_id') {
        if (fallbackCategories.length) return fallbackCategories;
        throw new ProductCategoriesUnavailable();
      }
      throw new Error('The product form could not be loaded. Please try again.');
    }
    // Legacy PHP templates can emit unquoted IDs and omit optional </option> tags.
    const options = Array.from(select[2].matchAll(/(<option\b[^>]*>)([\s\S]*?)(?=<\/option\s*>|<option\b|<\/optgroup\s*>|$)/gi))
      .map((match) => ({ value: attribute(match[1], 'value') ?? '', label: decodeHtml(match[2]) }))
      .filter((option) => Number(option.value) > 0 && option.label);
    if (name === 'category_id' && !options.length) {
      if (fallbackCategories.length) return fallbackCategories;
      throw new ProductCategoriesUnavailable();
    }
    return options;
  };
  return { categories: readSelect('category_id'), promotions: readSelect('promotion_id'), taxes: readSelect('tax_id') };
}

export async function resolveProductFormOptions(html: string, loadCategories: () => Promise<Array<{ id: number; category_name: string }>>): Promise<ProductFormOptions> {
  try { return parseProductFormOptions(html); }
  catch (error) {
    // Only a missing category list uses the catalogue fallback. Never bypass portal authorization.
    if (!(error instanceof ProductCategoriesUnavailable)) throw error;
    const categories = (await loadCategories())
      .filter((category) => Number(category.id) > 0 && typeof category.category_name === 'string' && category.category_name.trim())
      .map((category) => ({ value: String(category.id), label: category.category_name.trim() }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (!categories.length) throw error;
    return parseProductFormOptions(html, categories);
  }
}

export function validateProductForm(form: { get: (key: string) => unknown; getAll: (key: string) => unknown[] }, options?: ProductFormOptions): string | null {
  const value = (key: string) => String(form.get(key) ?? '').trim();
  if (value('id')) return 'This form can only create a new product.';
  if (!value('product_name') || !value('category_id')) return 'Enter a product name and choose a category.';
  if (!value('item_code')) return 'Enter an item code. It is required when creating a product.';
  if (!['0', '1'].includes(value('status'))) return 'Choose a valid product status.';
  if (options) {
    for (const [key, choices] of [['category_id', options.categories], ['promotion_id', options.promotions], ['tax_id', options.taxes]] as const) {
      if (value(key) && !choices.some((option) => option.value === value(key))) return 'A selected category, promotion or tax is no longer available. Reload the form and choose again.';
    }
  }
  const validAmount = (type: string, amount: string, label: string) => {
    if (!['', 'flat', 'percent'].includes(type)) return `Choose a valid ${label} type.`;
    if (!type) return amount ? `Choose a ${label} type or clear its value.` : null;
    const number = Number(amount);
    return !amount.trim() || !Number.isFinite(number) || number < 0 || (type === 'percent' && number > 100)
      ? `Enter a valid ${label} value${type === 'percent' ? ' between 0 and 100' : ''}.` : null;
  };
  const discountError = validAmount(value('product_discount_type'), value('product_discount_value'), 'discount');
  if (discountError) return discountError;
  const names = form.getAll('attribute_name[]');
  const columns = ['attribute_id[]', 'attribute_quantity[]', 'attribute_unit[]', 'attribute_commission_type[]', 'attribute_commission_value[]', 'attribute_discount_type[]', 'attribute_discount_value[]'];
  if (!names.length || Number(value('index')) !== names.length || columns.some((key) => form.getAll(key).length !== names.length)) return 'Add and complete at least one variant.';
  for (let index = 0; index < names.length; index++) {
    const cell = (key: string) => String(form.getAll(key)[index] ?? '').trim();
    if (cell('attribute_id[]')) return 'New variants cannot have an existing ID.';
    if (!String(names[index]).trim() || !Number.isFinite(Number(cell('attribute_quantity[]'))) || Number(cell('attribute_quantity[]')) <= 0 || !PRODUCT_UNITS.some((unit) => unit.value === cell('attribute_unit[]'))) return `Complete the name, positive quantity and unit for variant ${index + 1}.`;
    for (const kind of ['commission', 'discount']) {
      const error = validAmount(cell(`attribute_${kind}_type[]`), cell(`attribute_${kind}_value[]`), `variant ${index + 1} ${kind}`);
      if (error) return error;
    }
  }
  const titles = form.getAll('custom_title[]');
  const descriptions = form.getAll('custom_dis[]');
  if (titles.length !== descriptions.length || titles.some((title, i) => !String(title).trim() || !String(descriptions[i]).trim())) return 'Complete the title and description for every custom field, or remove the empty field.';
  return null;
}

function productFields(product: NewProduct): Array<[string, string]> {
  const fields: Array<[string, string]> = [['id', '']];
  for (const key of ['product_name', 'category_id', 'promotion_id', 'item_code', 'product_desc', 'nutrition', 'tax_id', 'brand_name', 'product_discount_type', 'product_discount_value', 'status'] as const) fields.push([key, product[key].trim()]);
  for (const key of ['hotdeals', 'offers', 'new_arrival'] as const) fields.push([key, product[key] ? '1' : '0']);
  fields.push(['index', String(product.attributes.length)]);
  product.attributes.forEach((attribute) => {
    fields.push(['attribute_id[]', ''], ['attribute_name[]', attribute.name.trim()]);
    for (const key of ['quantity', 'unit', 'commission_type', 'commission_value', 'discount_type', 'discount_value'] as const) fields.push([`attribute_${key}[]`, attribute[key].trim()]);
  });
  product.customFields.forEach((field) => fields.push(['custom_title[]', field.title.trim()], ['custom_dis[]', field.description.trim()]));
  return fields;
}

export function validateNewProduct(product: NewProduct, options?: ProductFormOptions) {
  const fields = productFields(product);
  // React Native FormData provides append/getParts, but not the browser's get/getAll.
  return validateProductForm({
    get: (key) => fields.find(([name]) => name === key)?.[1],
    getAll: (key) => fields.filter(([name]) => name === key).map(([, value]) => value),
  }, options);
}

export function buildProductForm(product: NewProduct, appendPhoto: (form: FormData, key: string, photo: ProductPhoto) => void): FormData {
  const form = new FormData();
  productFields(product).forEach(([key, value]) => form.append(key, value));
  product.images.forEach((photo) => appendPhoto(form, 'product_img[]', photo));
  if (product.nutritionImage) appendPhoto(form, 'nutrition_image', product.nutritionImage);
  product.attributes.forEach((attribute, i) => attribute.images.forEach((photo) => appendPhoto(form, `attribute_img_${i + 1}[]`, photo)));
  return form;
}

export async function assertProductCreated(response: Response): Promise<void> {
  if (response.status === 401 || /\/login(?:[/?#]|$)/i.test(response.url)) throw new Error('Your admin product session has expired. Please reconnect products.');
  if (response.status === 403) throw new Error('The product portal denied permission to save this product.');
  if (response.status >= 300 && response.status < 400) {
    const target = new URL(response.headers.get('location') || '/', 'https://crtup.in');
    if (/\/login(?:\/|$)/i.test(target.pathname)) throw new Error('Your admin product session has expired. Please reconnect products.');
    if (target.origin === 'https://crtup.in' && /^\/accrabasket\/admin\/product(?:\/index)?\/?$/.test(target.pathname)) return;
    if (target.pathname === '/accrabasket/admin/product/addproduct') throw new Error('The product service rejected the product details and returned to the add form. Your login is still valid.');
    throw new Error('The product service returned an unexpected redirect. Saving was not confirmed.');
  }
  const text = await response.text();
  if ((response.headers.get('content-type') || '').includes('application/json')) {
    const result = JSON.parse(text);
    if (response.ok && (result.status === 'success' || result.status === true)) return;
    throw new Error(result.message || result.msg || 'The product could not be saved.');
  }
  if (!response.ok) throw new Error('The product service could not save this product. Please try again.');
  // Native fetch can follow redirects despite redirect: manual. Require the final list page.
  if (/^https:\/\/crtup\.in\/accrabasket\/admin\/product(?:\/index)?\/?(?:[?#].*)?$/.test(response.url) && !/name\s*=\s*["']password["']/i.test(text)) return;
  throw new Error('The product service did not confirm the save. Check the product list before trying again.');
}
