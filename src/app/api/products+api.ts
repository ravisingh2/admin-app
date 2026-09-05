export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const isMerchant = requestUrl.searchParams.get('role_id') === '2';
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
    if (!isMerchant && !sessionMatch) return Response.json({ status: 'error', message: 'Admin session required.' }, { status: 401 });
    const upstreamCookie = sessionMatch ? decodeURIComponent(sessionMatch[1]) : '';

    const productUrl = isMerchant
      ? 'https://crtup.in/basketapi/index.php/application/product'
      : 'https://crtup.in/accrabasket/admin/product/getProductList';
    const merchantParameters = JSON.stringify({
      method: 'productlist',
      all_product: 0,
      pagination: 1,
      page: Number(requestUrl.searchParams.get('page') || 1),
      merchant_id: Number(requestUrl.searchParams.get('merchant_id') || 0),
      ...(productName ? { product_name: productName } : {}),
      ...(categoryId ? { category_id: Number(categoryId) } : {}),
    });
    const upstreamBody = isMerchant
      ? new URLSearchParams({ parameters: merchantParameters, rqid: '' }).toString()
      : params.toString();
    const upstream = await fetch(productUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(isMerchant ? {} : { Cookie: upstreamCookie }),
      },
      body: upstreamBody,
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
