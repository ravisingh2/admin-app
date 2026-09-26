import { portalFetch } from '../../services/portal-fetch.server';
import { assertProductCreated, resolveProductFormOptions, validateProductForm } from '../../services/product-form';
import { GET as getCategories } from './categories+api';

function refreshedPortalCookies(existing: string, setCookie: string | null) {
  const updates = (setCookie || '').split(/,(?=\s*[^;,\s]+=)/)
    .map((value) => value.split(';', 1)[0].trim())
    .filter((value) => /^[^=;\s]+=[^;\s]+$/.test(value));
  if (!updates.length) return '';
  // A rotation can set just PHPSESSID while an older companion auth cookie is
  // still required. Merge replacements by name instead of dropping it.
  const cookies = new Map(existing.split(/;\s*/).filter(Boolean).map((value) => [value.split('=', 1)[0].toLowerCase(), value]));
  updates.forEach((value) => cookies.set(value.split('=', 1)[0].toLowerCase(), value));
  return [...cookies.values()].join('; ');
}

function sessionCookieHeader(cookie: string) {
  return `accrabasket_admin=${encodeURIComponent(cookie)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`;
}

function adminCookie(request: Request) {
  const match = (request.headers.get('cookie') || '').match(/(?:^|;\s*)accrabasket_admin=([^;]+)/);
  if (!match) throw new Error('Your admin product session has expired. Please reconnect products.');
  try { return decodeURIComponent(match[1]); }
  catch { throw new Error('Your admin product session has expired. Please reconnect products.'); }
}

function hiddenProductFormFields(html: string): Array<[string, string]> {
  const attribute = (tag: string, name: string) => {
    const match = tag.match(new RegExp(`(?:\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
    return match?.[1] ?? match?.[2] ?? match?.[3] ?? '';
  };
  return Array.from(html.matchAll(/<input\b[^>]*>/gi)).flatMap(([tag]) => {
    if ((attribute(tag, 'type') || '').toLowerCase() !== 'hidden') return [];
    const name = attribute(tag, 'name');
    // Only preserve ordinary scalar hidden inputs supplied by the upstream form.
    return name && /^[A-Za-z0-9_[\].-]+$/.test(name) ? [[name, attribute(tag, 'value')]] : [];
  });
}

async function adminOptions(request: Request) {
  let cookie = adminCookie(request);
  // Let the authenticated upstream portal authorize access; never trust a posted role ID.
  const response = await portalFetch('https://crtup.in/accrabasket/admin/product/addproduct', {
    headers: { Cookie: cookie }, redirect: 'manual',
  });
  if (!response.ok) throw new Error('Your admin product session has expired or access was denied. Please reconnect products.');
  // The portal can rotate PHPSESSID when it renders the form. Persist the new
  // session and use it immediately for saveproduct instead of sending a stale
  // cookie that the portal redirects to its login page.
  const refreshedCookie = refreshedPortalCookies(cookie, response.headers.get('set-cookie'));
  if (refreshedCookie) cookie = refreshedCookie;
  const html = await response.text();
  const options = await resolveProductFormOptions(html, async () => {
    const response = await getCategories(request);
    const result = await response.json();
    if (!response.ok || result.status !== 'success' || !Array.isArray(result.data)) throw new Error('Categories could not be loaded. Please try again.');
    return result.data;
  });
  return { cookie, options, hiddenFields: hiddenProductFormFields(html), refreshed: Boolean(refreshedCookie) };
}

function failure(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unable to connect to the product service.';
  return Response.json({ status: 'error', message }, { status: /session|access was denied/i.test(message) ? 401 : 502 });
}

export async function GET(request: Request) {
  try {
    const { cookie, options, refreshed } = await adminOptions(request);
    return Response.json({ data: options }, { headers: {
      'Cache-Control': 'no-store',
      ...(refreshed ? { 'Set-Cookie': sessionCookieHeader(cookie) } : {}),
    } });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    // Match the known-good edit-product path: post the already-validated form
    // straight to saveproduct. Reopening addproduct here can rotate the legacy
    // portal session between rendering and saving.
    const cookie = adminCookie(request);
    const incoming = await request.formData() as unknown as FormData;
    const error = validateProductForm(incoming);
    if (error) return Response.json({ message: error }, { status: 400 });
    const allowed = new Set(['id', 'product_name', 'category_id', 'promotion_id', 'item_code', 'product_desc', 'nutrition', 'tax_id', 'brand_name', 'product_discount_type', 'product_discount_value', 'hotdeals', 'offers', 'new_arrival', 'status', 'index', 'attribute_id[]', 'attribute_name[]', 'attribute_quantity[]', 'attribute_unit[]', 'attribute_commission_type[]', 'attribute_commission_value[]', 'attribute_discount_type[]', 'attribute_discount_value[]', 'custom_title[]', 'custom_dis[]']);
    const form = new FormData();
    for (const [key, value] of incoming.entries()) {
      const photo = key === 'product_img[]' || key === 'nutrition_image' || /^attribute_img_\d+\[\]$/.test(key);
      if (photo && typeof value !== 'string' && value.type.startsWith('image/')) form.append(key, value, value.name);
      else if (allowed.has(key) && typeof value === 'string') form.append(key, value);
      else return Response.json({ message: 'The form contains an unsupported field or file. Choose image files only.' }, { status: 400 });
    }
    const response = await portalFetch('https://crtup.in/accrabasket/admin/product/saveproduct', {
      method: 'POST', headers: { Cookie: cookie }, body: form, redirect: 'manual',
    });
    await assertProductCreated(response);
    return Response.json({ status: 'success' });
  } catch (error) { return failure(error); }
}
