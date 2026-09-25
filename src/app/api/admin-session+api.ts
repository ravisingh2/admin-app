import { portalFetch } from '../../services/portal-fetch.server';
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
    const setCookie = upstream.headers.get('set-cookie');
    const upstreamCookie = setCookie?.split(';')[0];
    const location = upstream.headers.get('location') || '';
    if (!upstreamCookie || upstream.status < 300 || upstream.status >= 400 || !location || location.includes('/login')) {
      return Response.json({ message: 'Product portal login failed.' }, { status: 401 });
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
