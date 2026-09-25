import { portalProxy } from '../../services/portal-proxy';

const fields: Record<string, string[]> = {
  getOrderList: ['page', 'order_status', 'order_id'],
  changestatus: ['order_id', 'user_id', 'order_status'],
  storelist: [],
  saveinventory: ['product_id', 'store_id[]', 'attribute_id[]', 'price[]', 'stock[]', 'merchant_product_code[]'],
};

export async function POST(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get('action') || '';
    if (!Object.hasOwn(fields, action)) return Response.json({ message: 'Unsupported portal action.' }, { status: 400 });
    const input = new URLSearchParams(await request.text());
    const body = new URLSearchParams();
    for (const field of fields[action]) for (const value of input.getAll(field)) body.append(field, value);
    return await portalProxy(request, 'merchant/product/' + action, body.toString());
  } catch {
    return Response.json({ message: 'Unable to connect to the merchant portal.' }, { status: 502 });
  }
}
