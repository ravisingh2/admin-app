type EditableProduct = {
  id: number; product_name: string; category_id: number; item_code: string;
  product_desc: string; nutrition: string; brand_name: string; status: number;
  hotdeals: number; offers: number; new_arrival: number;
  promotion_id?: number; tax_id?: number; discount_type?: string; discount_value?: string;
  attributes: Array<{ id?: number; name: string; quantity: string; unit: string; commission_type?: string; commission_value?: string; discount_type?: string; discount_value?: string }>;
};

export async function POST(request: Request) {
  try {
    const product = await request.json() as EditableProduct;
    if (!product.id || !product.product_name || !product.category_id) {
      return Response.json({ message: 'Product name and category are required.' }, { status: 400 });
    }
    const cookieHeader = request.headers.get('cookie') || '';
    const sessionMatch = cookieHeader.match(/(?:^|;\s*)accrabasket_admin=([^;]+)/);
    if (!sessionMatch) return Response.json({ message: 'Admin session required.' }, { status: 401 });

    const form = new FormData();
    form.set('id', String(product.id));
    form.set('product_name', product.product_name);
    form.set('category_id', String(product.category_id));
    form.set('promotion_id', String(product.promotion_id || ''));
    form.set('item_code', product.item_code || '');
    form.set('product_desc', product.product_desc || '');
    form.set('nutrition', product.nutrition || '');
    form.set('tax_id', String(product.tax_id || ''));
    form.set('brand_name', product.brand_name || '');
    form.set('product_discount_type', product.discount_type || '');
    form.set('product_discount_value', product.discount_value || '');
    form.set('hotdeals', String(product.hotdeals || 0));
    form.set('offers', String(product.offers || 0));
    form.set('new_arrival', String(product.new_arrival || 0));
    form.set('status', String(product.status));
    form.set('index', String(product.attributes.length));
    product.attributes.forEach((attribute) => {
      form.append('attribute_id[]', String(attribute.id || ''));
      form.append('attribute_name[]', attribute.name);
      form.append('attribute_unit[]', attribute.unit);
      form.append('attribute_quantity[]', attribute.quantity);
      form.append('attribute_commission_type[]', attribute.commission_type || 'flat');
      form.append('attribute_commission_value[]', attribute.commission_value || '0.00');
      form.append('attribute_discount_type[]', attribute.discount_type || '');
      form.append('attribute_discount_value[]', attribute.discount_value || '');
    });

    const upstream = await fetch('https://crtup.in/accrabasket/admin/product/saveproduct', {
      method: 'POST',
      headers: { Cookie: decodeURIComponent(sessionMatch[1]) },
      body: form,
      redirect: 'manual',
    });
    if (upstream.status >= 400) return Response.json({ message: 'AccraBasket rejected the update.' }, { status: upstream.status });
    return Response.json({ status: 'success' });
  } catch {
    return Response.json({ message: 'Unable to save the product.' }, { status: 502 });
  }
}
