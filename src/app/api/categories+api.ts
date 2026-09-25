import { portalProxy } from '../../services/portal-proxy';

export async function GET(request: Request) {
  try {
    const portal = new URL(request.url).searchParams.get('portal') === 'merchant' ? 'merchant' : 'admin';
    const response = await portalProxy(request, portal + '/product/getCategoryList');
    if (!response.ok) return response;
    const result = await response.json();
    if (result.status === 'success' && result.data) result.data = Object.values(result.data);
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ message: 'Unable to load categories.' }, { status: 502 });
  }
}
export const POST = GET;