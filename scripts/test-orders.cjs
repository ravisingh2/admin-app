const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, extras = {}) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { exports: {}, Headers, URL, URLSearchParams, Response, Request, AbortController, setTimeout, clearTimeout, ...extras };
  vm.runInNewContext(source, context);
  return context.exports;
}
const endpoints = load('src/services/order-endpoints.ts');
const fixture = { status: 'success', data: { order1: { order_details: { order_id: 'order1', store_id: 7, user_id: 9, amount: '50', order_status: 'ready_to_dispatch' } } }, totalNumberOfOrder: 12 };
async function client(os, role) {
  const calls = [];
  let response = fixture;
  const api = load('src/services/api.ts', {
    require: name => name === './order-endpoints' ? endpoints : name === 'react-native' ? { Platform: { OS: os } } : { setItemAsync: async () => {}, getItemAsync: async () => JSON.stringify({authenticated:true,userId:42,roleId:role,portalSecurityKey:'a'.repeat(64),portalCookie:'PHPSESSID=test'}) },
    localStorage: { setItem: () => {} },
    fetch: async (url, init) => { calls.push({ url, init }); return typeof response === 'string' ? new Response(response) : Response.json(response); },
  });
  api.setAuthenticatedRoleId(role); api.setAuthenticatedUserId(42); await api.setAuthenticated(true);
  if(os !== 'web') await api.restoreAuthentication();
  return { api, calls, reply: value => { response = value; } };
}
(async () => {
  for (const os of ['web', 'android', 'ios']) {
    for (const role of [1, 2]) {
      const { api, calls, reply } = await client(os, role);
      const page = await api.getMerchantOrderPage({ page: 2, status: 'ready_to_dispatch' });
      assert.equal(page.total, 12); assert.equal(page.orders[0].storeId, 7);
      const first = calls[0];
      if (role === 1) {
        assert.equal(first.url, os === 'web' ? '/api/orders?action=list' : 'https://crtup.in/accrabasket/admin/product/getOrderList');
        assert.equal(new URLSearchParams(first.init.body).has('merchant_id'), false);
      } else {
        const params = new URLSearchParams(first.init.body);
        assert.equal(params.has('merchant_id'), false); assert.equal(params.get('page'), '2');
        assert.equal(first.url, os === 'web' ? '/api/merchant?action=getOrderList' : 'https://crtup.in/accrabasket/merchant/product/getOrderList');
        await assert.rejects(api.getOrderRiders(7), /administrators/);
        await assert.rejects(api.assignOrderRider('order1', '3'), /administrators/);
      }
      const details = await api.getMerchantOrderDetails('order1');
      assert.equal(details.orderId, 'order1'); assert.equal(details.storeId, 7);
      reply({ status: 'fail', msg: 'Session invalid' });
      await assert.rejects(api.getMerchantOrderPage(), /Session invalid/);
      reply({ status: 'fail', msg: 'No record found ' });
      assert.equal((await api.getMerchantOrderPage()).orders.length, 0);
      if (role === 1) {
        reply({ status: 'success', data: { 3: { name: 'Test rider' } } });
        const riders = await api.getOrderRiders(7);
        assert.equal(riders[0].id, '3'); assert.equal(riders[0].name, 'Test rider');
        assert.equal(new URLSearchParams(calls.at(-1).init.body).get('store_id'), '7');
        reply({ status: 'success' }); await api.assignOrderRider('order1', riders[0].id);
        assert.equal(calls.at(-1).url, os === 'web' ? '/api/orders?action=assign' : 'https://crtup.in/accrabasket/admin/rider/assignOrder');
        assert.equal(calls.at(-1).init.body, 'order_id=order1&rider_id=3');
        reply({ status: 'fail', msg: 'Rider unavailable' });
        await assert.rejects(api.assignOrderRider('order1', '3'), /Rider unavailable/);
        reply('<html>Login</html>'); await assert.rejects(api.getMerchantOrderPage(), /sign in again/);
      }
    }
  }
  let forwarded;
  const route = load('src/app/api/orders+api.ts', { require: name => name.includes('portal-fetch') ? {portalFetch:async (url,init)=>{forwarded={url,init};return Response.json({status:'success'});}} : endpoints });
  const request = (action, body, cookie = 'accrabasket_admin=PHPSESSID%3Dtest') => new Request(`http://localhost/api/orders?action=${action}`, { method: 'POST', headers: { cookie }, body });
  assert.equal((await route.POST(request('list', '', ''))).status, 401);
  assert.equal((await route.POST(request('unknown', ''))).status, 400);
  assert.equal((await route.POST(request('assign', 'order_id=order1'))).status, 400);
  assert.equal((await route.POST(request('assign', 'order_id=order1&rider_id=3&merchant_id=42'))).status, 200);
  assert.equal(forwarded.url, 'https://crtup.in/accrabasket/admin/rider/assignOrder');
  assert.equal(forwarded.init.body, 'order_id=order1&rider_id=3');
  assert.equal(forwarded.init.headers.Cookie, 'PHPSESSID=test');
  const expired = load('src/app/api/orders+api.ts', { require: name => name.includes('portal-fetch') ? {portalFetch:async()=>new Response(null,{status:302,headers:{location:'/login'}})} : endpoints });
  assert.equal((await expired.POST(request('list', ''))).status, 401);
  console.log('Passed: admin/merchant orders on web, Android and iOS; details, rider selection, assignment, errors and authenticated proxy.');
})().catch(error => { console.error(error); process.exitCode = 1; });
