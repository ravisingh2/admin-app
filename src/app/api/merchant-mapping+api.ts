function upstreamCookie(request: Request) {
  const match = (request.headers.get('cookie') || '').match(/(?:^|;\s*)accrabasket_admin=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function forward(request: Request, action: string, body = '') {
  const endpoints: Record<string, string> = {
    merchants: 'merchantList', mappings: 'productMerchantMappings', map: 'mapMerchant',
  };
  const endpoint = endpoints[action];
  const cookie = upstreamCookie(request);
  if (!endpoint) return Response.json({ status: 'error', msg: 'Invalid mapping action.' }, { status: 400 });
  if (!cookie) return Response.json({ status: 'error', msg: 'Admin session required.' }, { status: 401 });
  try {
    const response = await fetch(`https://crtup.in/accrabasket/admin/product/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie }, body,
    });
    return new Response(await response.text(), { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ status: 'error', msg: 'Unable to connect to merchant mapping.' }, { status: 502 });
  }
}

export async function GET(request: Request) {
  return forward(request, new URL(request.url).searchParams.get('action') || '');
}

export async function POST(request: Request) {
  const action = new URL(request.url).searchParams.get('action') || '';
  const data = await request.json() as { productId?: number; merchantIds?: number[] };
  const fields: Array<[string, string]> = [['product_id', String(data.productId || '')]];
  (data.merchantIds || []).forEach((id) => fields.push(['merchant_ids[]', String(id)]));
  return forward(request, action, new URLSearchParams(fields).toString());
}
