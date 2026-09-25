// Import only from API routes, never from browser/native components.
export async function portalFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input);
  if (url.origin !== 'https://crtup.in' || !url.pathname.startsWith('/accrabasket/')) {
    throw new Error('Invalid portal destination.');
  }
  const key = process.env.ACCRABASKET_APP_KEY;
  if (!key || !/^[a-f0-9]{64}$/.test(key)) throw new Error('The portal security key is not configured.');
  const headers = new Headers(init.headers);
  headers.set('X-Accrabasket-App-Key', key);
  // Do not forward the key to redirect destinations.
  return fetch(url.toString(), { ...init, headers: Object.fromEntries(headers.entries()), redirect: 'manual' });
}
