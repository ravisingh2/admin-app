import { assertProductCreated, resolveProductFormOptions, validateProductForm } from '../../services/product-form';
import { GET as getCategories } from './categories+api';

async function adminOptions(request: Request) {
  const match = (request.headers.get('cookie') || '').match(/(?:^|;\s*)accrabasket_admin=([^;]+)/);
  if (!match) throw new Error('Your admin product session has expired. Please reconnect products.');
  const cookie = decodeURIComponent(match[1]);
  // Let the authenticated upstream portal authorize access; never trust a posted role ID.
  const response = await fetch('https://crtup.in/accrabasket/admin/product/addproduct', {
    headers: { Cookie: cookie }, redirect: 'manual',
  });
  if (!response.ok) throw new Error('Your admin product session has expired or access was denied. Please reconnect products.');
  const options = await resolveProductFormOptions(await response.text(), async () => {
    const response = await getCategories();
    const result = await response.json();
    if (!response.ok || result.status !== 'success' || !Array.isArray(result.data)) throw new Error('Categories could not be loaded. Please try again.');
    return result.data;
  });
  return { cookie, options };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to connect to the product service.';
  return Response.json({ status: 'error', message }, { status: /session|access was denied/i.test(message) ? 401 : 502 });
}

export async function GET(request: Request) {
  try {
    const { options } = await adminOptions(request);
    return Response.json({ data: options }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const { cookie, options } = await adminOptions(request);
    const incoming = await request.formData() as unknown as FormData;
    const error = validateProductForm(incoming, options);
    if (error) return Response.json({ message: error }, { status: 400 });
    const allowed = new Set(['id', 'product_name', 'category_id', 'promotion_id', 'item_code', 'product_desc', 'nutrition', 'tax_id', 'brand_name', 'product_discount_type', 'product_discount_value', 'hotdeals', 'offers', 'new_arrival', 'status', 'index', 'attribute_id[]', 'attribute_name[]', 'attribute_quantity[]', 'attribute_unit[]', 'attribute_commission_type[]', 'attribute_commission_value[]', 'attribute_discount_type[]', 'attribute_discount_value[]', 'custom_title[]', 'custom_dis[]']);
    const form = new FormData();
    for (const [key, value] of incoming.entries()) {
      const photo = key === 'product_img[]' || key === 'nutrition_image' || /^attribute_img_\d+\[\]$/.test(key);
      if (photo && typeof value !== 'string' && value.type.startsWith('image/')) form.append(key, value, value.name);
      else if (allowed.has(key) && typeof value === 'string') form.append(key, value);
      else return Response.json({ message: 'The form contains an unsupported field or file. Choose image files only.' }, { status: 400 });
    }
    const response = await fetch('https://crtup.in/accrabasket/admin/product/saveproduct', {
      method: 'POST', headers: { Cookie: cookie }, body: form, redirect: 'manual',
    });
    await assertProductCreated(response);
    return Response.json({ status: 'success' });
  } catch (error) { return failure(error); }
}
