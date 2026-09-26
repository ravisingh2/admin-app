import { portalFetch } from '../../services/portal-fetch.server';

function portalSessionCookies(setCookie: string | null) {
  // Keep every cookie set by the portal login. Some deployments pair PHPSESSID
  // with an additional authentication cookie; sending only PHPSESSID lets the
  // form render but can redirect saveproduct back to login.
  const cookies = (setCookie || '').split(/,(?=\s*[^;,\s]+=)/)
    .map((value) => value.split(';', 1)[0].trim())
    .filter((value) => /^[^=;\s]+=[^;\s]+$/.test(value));
  return cookies.some((value) => /^PHPSESSID=/i.test(value)) ? cookies.join('; ') : '';
}

async function confirmAdminProductAccess(cookie: string) {
  const response = await portalFetch('https://crtup.in/accrabasket/admin/product/addproduct', {
    headers: { Cookie: cookie },
    redirect: 'manual',
  });
  if (!response.ok) return false;
  // Do not treat a successful-looking login page as permission to create
  // products. The product form always posts to saveproduct.
  return /<form\b[^>]*\baction\s*=\s*(?:"[^"]*saveproduct[^"]*"|'[^']*saveproduct[^']*'|[^\s>]*saveproduct[^\s>]*)/i.test(await response.text());
}

export async function POST(request: Request) {
  try {
    const { username, password, roleId } = await request.json() as { username?: string; password?: string; roleId?: number };
    if (!username || !password) return Response.json({ message: 'Credentials required.' }, { status: 400 });

    // The shared portal login establishes the session and routes by user role.
    const loginUrl = 'https://crtup.in/accrabasket/admin/index';
    const upstream = await portalFetch(loginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password }).toString(),
      redirect: 'manual',
    });
    const upstreamCookie = portalSessionCookies(upstream.headers.get('set-cookie'));
    const location = upstream.headers.get('location') || '';
    if (!upstreamCookie || upstream.status < 300 || upstream.status >= 400 || !location || /\/login(?:[/?#]|$)/i.test(location)) {
      return Response.json({ message: 'Product portal login failed.' }, { status: 401 });
    }
    if (Number(roleId) === 1 && !(await confirmAdminProductAccess(upstreamCookie))) {
      return Response.json({ message: 'This account is not allowed to add products in the product portal.' }, { status: 403 });
    }

    return Response.json({ status: 'success' }, {
      headers: {
        'Set-Cookie': `accrabasket_admin=${encodeURIComponent(upstreamCookie)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800`,
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json({ message: 'Unable to connect to the admin service.' }, { status: 502 });
  }
}

export async function DELETE() {
  return Response.json({ status: 'success' }, { headers: {
    'Set-Cookie': 'accrabasket_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0',
    'Cache-Control': 'no-store',
  } });
}
