export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const params = new URLSearchParams({
      product_name: requestUrl.searchParams.get('product_name') || '',
    });
    const categoryId = requestUrl.searchParams.get('category_id');
    if (categoryId) params.set('category_id', categoryId);
    params.set('page', requestUrl.searchParams.get('page') || '1');
    params.set('limit', requestUrl.searchParams.get('limit') || '10');
    const productName = requestUrl.searchParams.get('product_name') || '';
    const categoryName = requestUrl.searchParams.get('category_name') || '';
    if (categoryId) {
      params.set('filter_type', 'Category_name');
      params.set('value', categoryName);
    } else if (productName) {
      params.set('filter_type', 'Product_name');
      params.set('value', productName);
    }

    const cookieHeader = request.headers.get('cookie') || '';
    const sessionMatch = cookieHeader.match(/(?:^|;\s*)accrabasket_admin=([^;]+)/);
    if (!sessionMatch) return Response.json({ status: 'error', message: 'Admin session required.' }, { status: 401 });
    const upstreamCookie = decodeURIComponent(sessionMatch[1]);

    const upstream = await fetch('https://crtup.in/accrabasket/admin/product/getProductList', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: upstreamCookie,
      },
      body: params.toString(),
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      { status: 'error', message: 'Unable to connect to the product service.' },
      { status: 502 }
    );
  }
}
