import { portalFetch } from '../../services/portal-fetch.server';
import { orderEndpoints } from '../../services/order-endpoints';

export async function POST(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get('action') as keyof typeof orderEndpoints;
    if (!Object.hasOwn(orderEndpoints, action)) return Response.json({ msg: 'Invalid order action.' }, { status: 400 });
    const match = (request.headers.get('cookie') || '').match(/(?:^|;\s*)accrabasket_admin=([^;]+)/);
    if (!match) return Response.json({ msg: 'Please sign out and sign in again to reconnect orders.' }, { status: 401 });
    const input = new URLSearchParams(await request.text());
    const fields = action === 'list' ? ['page', 'order_status', 'order_id'] : action === 'riders' ? ['store_id'] : ['order_id', 'rider_id'];
    const body = new URLSearchParams();
    for (const field of fields) if (input.has(field)) body.set(field, input.get(field)!);
    if (action !== 'list' && fields.some(field => !body.get(field)?.trim())) return Response.json({ msg: 'Required order fields are missing.' }, { status: 400 });
    const upstream = await portalFetch(`https://crtup.in/accrabasket/admin/${orderEndpoints[action]}`, {
      method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: decodeURIComponent(match[1]) }, body: body.toString(),
    });
    if (upstream.status === 401 || (upstream.status >= 300 && upstream.status < 400)) return Response.json({ msg: 'Your order session has expired. Please sign out and sign in again.' }, { status: 401 });
    return new Response(await upstream.text(), { status: upstream.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ msg: 'Unable to connect to the order service.' }, { status: 502 });
  }
}
