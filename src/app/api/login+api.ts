const LOGIN_URL = 'https://crtup.in/api/usercontroller/loginuser';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const username = requestUrl.searchParams.get('username');
  const password = requestUrl.searchParams.get('password');

  if (!username || !password) {
    return Response.json(
      { status: 'error', message: 'Username and password are required.' },
      { status: 400 }
    );
  }

  const upstreamUrl = new URL(LOGIN_URL);
  upstreamUrl.searchParams.set('username', username);
  upstreamUrl.searchParams.set('password', password);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
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
      { status: 'error', message: 'Unable to connect to the login service.' },
      { status: 502 }
    );
  }
}
