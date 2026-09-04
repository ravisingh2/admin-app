type Category = { id: number; category_name: string; category_des?: string };

export async function GET() {
  try {
    const upstream = await fetch('https://crtup.in', { headers: { Accept: 'text/html' } });
    if (!upstream.ok) throw new Error('Category source unavailable');
    const html = await upstream.text();
    const match = html.match(/var\s+categoryList\s*=\s*(\{[\s\S]*?\});/);
    if (!match?.[1]) throw new Error('Category data not found');
    const categoryMap = JSON.parse(match[1]) as Record<string, Category>;
    return Response.json({ status: 'success', data: Object.values(categoryMap) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json({ status: 'error', message: 'Unable to load categories.' }, { status: 502 });
  }
}
