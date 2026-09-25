const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, extras = {}) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, Headers, FormData, Response, Request, URL, URLSearchParams, Blob, ...extras };
  vm.runInNewContext(source, context);
  return context.exports;
}
const helpers = load('src/services/product-form.ts');
const html = `<form action="saveproduct" method="post"><select name="category_id"><option value="">Choose</option><option value="5">Fruit &amp; Vegetable</option></select><select name="promotion_id"><option value="1">Seasonal</option></select><select name="tax_id"><option value="2">Tax (12 %)</option></select></form>`;
const options = helpers.parseProductFormOptions(html);
const product = () => ({ ...helpers.blankProduct(), product_name: 'Test rice', category_id: '5', promotion_id: '1', tax_id: '2', attributes: [{ ...helpers.blankAttribute(), name: '1 kg', quantity: '1', unit: 'kg' }] });
const build = (data) => helpers.buildProductForm(data, (form, key, photo) => form.append(key, photo.file, photo.name));
const request = (form, cookie = 'accrabasket_admin=PHPSESSID%3Dtest') => new Request('http://localhost/api/product-create', { method: 'POST', headers: { cookie }, body: form });
const route = (fetch) => load('src/app/api/product-create+api.ts', { fetch, require: name => name.includes('portal-fetch') ? {portalFetch:fetch} : name === './categories+api' ? load('src/app/api/categories+api.ts', {fetch, require:()=>load('src/services/portal-proxy.ts',{fetch, require:()=>({portalFetch:fetch})})}) : helpers });

(async () => {
  assert.equal(options.categories[0].label, 'Fruit & Vegetable');
  const legacyHtml = `<form action=saveproduct method=post><select id=category_id name=category_id><option value="">Select category<option value=5>Fruit &amp; Vegetable<option value='18'>Rice, Flour and Dal</select><select name=promotion_id><option value=1>Seasonal</select><select name=tax_id><option value=2>Tax (12 %)</select></form>`;
  const legacyOptions = helpers.parseProductFormOptions(legacyHtml);
  assert.equal(legacyOptions.categories.length, 2);
  assert.equal(legacyOptions.categories[0].value, '5');
  assert.equal(legacyOptions.categories[0].label, 'Fruit & Vegetable');
  assert.equal(legacyOptions.categories[1].value, '18');
  assert.equal(legacyOptions.promotions[0].value, '1');
  assert.equal(legacyOptions.taxes[0].value, '2');
  assert.equal(helpers.validateProductForm(build(product()), legacyOptions), null);
  const legacyRoute = route(async () => new Response(legacyHtml));
  const legacyResponse = await legacyRoute.GET(new Request('http://localhost/api/product-create', {headers:{cookie:'accrabasket_admin=PHPSESSID%3Dtest'}}));
  assert.equal(legacyResponse.status, 200);
  assert.equal((await legacyResponse.json()).data.categories.length, 2);
  assert.throws(() => helpers.parseProductFormOptions(html.replace('<option value="5">Fruit &amp; Vegetable</option>', '')), /No categories/);
  const emptyCategoriesHtml = html.replace('<option value="5">Fruit &amp; Vegetable</option>', '');
  let fallbackCalls = 0;
  let fallbackSaves = 0;
  const fallbackRoute = route(async (url) => {
    if (url.endsWith('/getCategoryList')) {
      fallbackCalls++;
      return Response.json({status:'success',data:{5:{id:5,category_name:'Fruit & Vegetable'}}});
    }
    if (url.endsWith('/addproduct')) return new Response(emptyCategoriesHtml);
    fallbackSaves++;
    return new Response(null, {status:302,headers:{location:'/accrabasket/admin/product/index'}});
  });
  const fallbackResponse = await fallbackRoute.GET(new Request('http://localhost/api/product-create', {headers:{cookie:'accrabasket_admin=PHPSESSID%3Dtest'}}));
  assert.equal(fallbackResponse.status, 200);
  assert.equal((await fallbackResponse.json()).data.categories[0].value, '5');
  assert.equal((await fallbackRoute.POST(request(build(product())))).status, 200);
  assert.equal(fallbackCalls, 2);
  assert.equal(fallbackSaves, 1);
  let unauthorizedFallback = false;
  await assert.rejects(helpers.resolveProductFormOptions('<form action="login"></form>', async()=>{unauthorizedFallback=true;return [];}), /session/);
  assert.equal(unauthorizedFallback, false);
  await assert.rejects(helpers.resolveProductFormOptions(emptyCategoriesHtml, async()=>[]), /No categories/);
  assert.throws(() => helpers.parseProductFormOptions('<form action="login"></form>'), /session/);
  assert.equal(helpers.validateProductForm(build(product()), options), null);
  for (const [key, value] of [['product_name', ' '], ['category_id', '999'], ['id', '42'], ['status', 'invalid'], ['product_discount_type', 'percent']]) {
    const form = build(product()); form.set(key, value);
    assert.ok(helpers.validateProductForm(form, options), key);
  }
  for (const quantity of ['0', '-1', 'abc', 'Infinity']) {
    const form = build(product()); form.set('attribute_quantity[]', quantity);
    assert.match(helpers.validateProductForm(form, options), /positive quantity/);
  }
  const discount = product(); discount.product_discount_type = 'percent'; discount.product_discount_value = '101';
  assert.match(helpers.validateProductForm(build(discount), options), /between 0 and 100/);
  const custom = product(); custom.customFields = [{ title: 'Storage', description: '' }];
  assert.match(helpers.validateProductForm(build(custom), options), /custom field/);

  const photo = { uri: 'blob:test', name: 'rice.png', mimeType: 'image/png', file: new Blob(['test-image'], { type: 'image/png' }) };
  const complete = product(); complete.images = [photo]; complete.nutritionImage = photo;
  complete.attributes[0].images = [photo]; complete.customFields = [{ title: 'Storage', description: 'Keep dry' }];
  let saves = 0;
  const api = route(async (url, init) => {
    assert.equal(init.headers.Cookie, 'PHPSESSID=test');
    if (url.endsWith('/addproduct')) return new Response(html);
    saves++;
    const form = init.body;
    assert.equal(form.get('id'), '');
    assert.equal(form.get('index'), '1');
    assert.equal(form.get('attribute_id[]'), '');
    assert.equal(form.get('custom_dis[]'), 'Keep dry');
    for (const key of ['product_img[]', 'nutrition_image', 'attribute_img_1[]']) {
      assert.equal(form.get(key).name, 'rice.png');
      assert.equal(await form.get(key).text(), 'test-image');
    }
    return new Response(null, { status: 302, headers: { location: 'https://crtup.in/accrabasket/admin/product/index' } });
  });
  assert.equal((await api.POST(request(build(complete)))).status, 200);
  assert.equal(saves, 1);
  assert.equal((await api.POST(request(build(complete), ''))).status, 401);
  assert.equal(saves, 1);
  const bad = build(complete); bad.set('category_id', '999');
  assert.equal((await api.POST(request(bad))).status, 400);
  assert.equal(saves, 1);
  const denied = route(async () => new Response(null, { status: 302, headers: { location: '/accrabasket/merchant/dashboard' } }));
  assert.equal((await denied.POST(request(build(product())))).status, 401);
  for (const response of [new Response(null, {status:302,headers:{location:'/accrabasket/admin/index/login'}}), new Response('<form>Failed validation</form>'), Response.json({status:'fail'}), new Response(null, {status:500})]) {
    await assert.rejects(helpers.assertProductCreated(response));
  }
  await helpers.assertProductCreated(Response.json({status:'success'}));
  const followed = new Response('<h1>Products</h1>'); Object.defineProperty(followed, 'url', { value: 'https://crtup.in/accrabasket/admin/product/index' });
  await helpers.assertProductCreated(followed);

  for (const os of ['web', 'android', 'ios']) {
    let calls = 0;
    const storage = new Map();
    class NativeFormData {
      constructor() { this.parts = []; }
      append(key, value) { this.parts.push([key, value]); }
      getParts() { return this.parts; }
    }
    const platformHelpers = os === 'web' ? helpers : load('src/services/product-form.ts', {FormData: NativeFormData});
    const client = load('src/services/api.ts', {
      require: name => name === './product-form' ? platformHelpers : name === 'react-native' ? {Platform: {OS: os}} : {setItemAsync: async()=>{},getItemAsync:async()=>JSON.stringify({authenticated:true,userId:42,roleId:1,portalSecurityKey:'a'.repeat(64),portalCookie:'PHPSESSID=test'})},
      localStorage: {setItem: (k,v)=>storage.set(k,v)},
      fetch: async (url, init) => {
        calls++;
        const read = key => os === 'web' ? init.body.get(key) : init.body.getParts().find(([name])=>name===key)?.[1];
        assert.equal(read('id'), ''); assert.equal(read('attribute_name[]'), '1 kg');
        assert.equal(read('product_img[]').name, 'rice.png');
        if (os !== 'web') { assert.equal(read('product_img[]').uri, 'file:///rice.png'); assert.equal(read('product_img[]').type, 'image/png'); }
        return Response.json({status:'success'});
      },
    });
    client.setAuthenticatedRoleId(1); client.setAuthenticatedUserId(42);
    await assert.rejects(client.createProduct(product(), options), /signed-in administrators/);
    await client.setAuthenticated(true);
    client.setAuthenticatedRoleId(2);
    await assert.rejects(client.createProduct(product(), options), /signed-in administrators/);
    assert.equal(calls, 0);
    client.setAuthenticatedRoleId(1);
    if(os !== 'web') await client.restoreAuthentication();
    const withPhoto = product(); withPhoto.images = [{...photo, uri:'file:///rice.png'}];
    await client.createProduct(withPhoto, options);
    assert.equal(calls, 1);
  }
  const optionClient = async (fetch, timers = {setTimeout, clearTimeout}) => {
    const client = load('src/services/api.ts', {
      require: name => name === './product-form' ? helpers : name === 'react-native' ? {Platform:{OS:'web'}} : {},
      localStorage:{setItem:()=>{}}, fetch, AbortController, ...timers,
    });
    client.setAuthenticatedRoleId(1); client.setAuthenticatedUserId(42); await client.setAuthenticated(true);
    return client;
  };
  const validOptions = await optionClient(async()=>Response.json({data:options}));
  assert.equal((await validOptions.getNewProductOptions()).categories.length, 1);
  const incompleteOptions = await optionClient(async()=>Response.json({status:'success'}));
  await assert.rejects(incompleteOptions.getNewProductOptions(), /incomplete form/);
  const stalled = await optionClient(async(_url, {signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))), {setTimeout:callback=>{queueMicrotask(callback);return 1;},clearTimeout:()=>{}});
  await assert.rejects(stalled.getNewProductOptions(), /took too long/);
  console.log('Passed: role-1 creation, live options, validation, multipart photos/custom fields, blank create IDs, upstream authorization, loading timeouts, malformed form responses, and accurate save/error responses on web/iOS/Android.');
})().catch(error => { console.error(error); process.exitCode = 1; });
