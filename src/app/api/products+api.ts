const PRODUCT_URL = 'https://crtup.in/productlist';

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const params = new URLSearchParams({
      product_name: requestUrl.searchParams.get('product_name') || '',
    });
    const categoryId = requestUrl.searchParams.get('category_id');
    if (categoryId) params.set('category_id', categoryId);

    const upstream = await fetch(PRODUCT_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
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
