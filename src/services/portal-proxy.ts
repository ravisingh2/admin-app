import { portalFetch } from './portal-fetch.server';
export async function portalProxy(request: Request, endpoint: string, body = ''): Promise<Response> {
  const match = (request.headers.get('cookie') || '').match(/(?:^|;\s*)accrabasket_admin=([^;]+)/);
  if (!match) return Response.json({ message: 'Portal session required.' }, { status: 401 });
  let cookie: string;
  try { cookie = decodeURIComponent(match[1]); }
  catch { return Response.json({ message: 'Invalid portal session.' }, { status: 401 }); }
  if (!/^PHPSESSID=[A-Za-z0-9,-]+$/.test(cookie)) return Response.json({ message: 'Invalid portal session.' }, { status: 401 });
  const upstream = await portalFetch('https://crtup.in/accrabasket/' + endpoint, {
    method: 'POST', redirect: 'manual',
    headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body,
  });
  if (upstream.status === 401 || upstream.status === 403) {
    return Response.json({ message: upstream.status === 403 ? 'The portal denied access to this operation.' : 'Your portal session has expired. Please sign in again.', upstreamStatus: upstream.status }, { status: upstream.status });
  }
  if (upstream.status >= 300 && upstream.status < 400) {
    const loginRedirect = /\/index\/login(?:[/?#]|$)|\/login(?:[/?#]|$)/i.test(upstream.headers.get('location') || '');
    return Response.json({ message: loginRedirect ? 'Your portal session has expired. Please sign in again.' : 'The portal returned an unexpected redirect.', upstreamStatus: upstream.status }, { status: loginRedirect ? 401 : 502 });
  }
  if (upstream.status === 404) {
    return Response.json({ message: 'The requested portal endpoint is unavailable. Deploy the updated PHP merchant ProductController to crtup.in.', upstreamStatus: 404 }, { status: 404 });
  }
  const text = await upstream.text();
  try {
    return Response.json(JSON.parse(text), { status: upstream.status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    const loginPage = upstream.ok && /<form\b[^>]*action=["'][^"']*login|<input\b[^>]*type=["']password["']/i.test(text);
    const denied = upstream.ok && /You are not allowed to access module/i.test(text);
    return Response.json({
      message: loginPage ? 'Your portal session has expired. Please sign in again.'
        : denied ? 'The portal denied access to this operation.'
        : 'The portal returned an unexpected response. Check the PHP deployment and server logs.',
      upstreamStatus: upstream.status,
    }, { status: loginPage ? 401 : denied ? 403 : upstream.status >= 400 ? upstream.status : 502 });
  }
}
