const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, fetch) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
  const context = {exports: {}, require:()=>({portalFetch:fetch}), fetch, Response, URL, URLSearchParams};
  vm.runInNewContext(source, context);
  return context.exports;
}
(async () => {
  const session = load('src/app/api/admin-session+api.ts', async (url, options) => {
    assert.equal(url, 'https://crtup.in/accrabasket/admin/index');
    assert.equal(options.redirect, 'manual');
    assert.equal(new URLSearchParams(options.body).get('username'), 'merchant-test');
    return new Response(null, {status: 302, headers: {'set-cookie': 'PHPSESSID=test-session; Path=/', location: 'https://crtup.in/accrabasket/merchant/dashboard'}});
  });
  const request = () => new Request('http://localhost/api/admin-session', {method: 'POST', body: JSON.stringify({username: 'merchant-test', password: 'test-only', roleId: 2})});
  const response = await session.POST(request());
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.ok(cookie.startsWith('accrabasket_admin='));
  const adminSession = load('src/app/api/admin-session+api.ts', async (url) => {
    if (url.endsWith('/admin/index')) return new Response(null, {status: 302, headers: {'set-cookie': 'site_access=ok; Path=/, PHPSESSID=admin-session; Path=/', location: '/accrabasket/admin/dashboard'}});
    assert.equal(url, 'https://crtup.in/accrabasket/admin/product/addproduct');
    return new Response('<form action=saveproduct method=post></form>');
  });
  const adminResponse = await adminSession.POST(new Request('http://localhost/api/admin-session', {method: 'POST', body: JSON.stringify({username: 'admin-test', password: 'test-only', roleId: 1})}));
  assert.equal(adminResponse.status, 200);
  assert.match(adminResponse.headers.get('set-cookie'), /site_access%3Dok%3B%20PHPSESSID%3Dadmin-session/);
  const noCreateAccess = load('src/app/api/admin-session+api.ts', async (url) => url.endsWith('/admin/index')
    ? new Response(null, {status: 302, headers: {'set-cookie': 'PHPSESSID=admin-session; Path=/', location: '/accrabasket/admin/dashboard'}})
    : new Response(null, {status: 302, headers: {location: '/accrabasket/admin/index/login'}}));
  assert.equal((await noCreateAccess.POST(new Request('http://localhost/api/admin-session', {method: 'POST', body: JSON.stringify({username: 'admin-test', password: 'test-only', roleId: 1})}))).status, 403);
  const products = load('src/app/api/products+api.ts', async (url, options) => {
    assert.equal(url, 'https://crtup.in/accrabasket/merchant/product/getproductlist');
    assert.equal(options.headers.Cookie, 'PHPSESSID=test-session');
    return Response.json({status: 'success', data: {}});
  });
  assert.equal((await products.GET(new Request('http://localhost/api/products?role_id=2', {headers: {cookie}}))).status, 200);
  assert.equal((await products.GET(new Request('http://localhost/api/products?role_id=2'))).status, 401);
  for (const status of [200, 302, 500]) {
    const rejected = load('src/app/api/admin-session+api.ts', async () => new Response(null, {status, headers: {'set-cookie': 'PHPSESSID=invalid; Path=/', location: '/admin/index/login'}}));
    assert.equal((await rejected.POST(request())).status, 401);
  }
  const expired = load('src/app/api/products+api.ts', async () => new Response(null, {status: 302, headers: {location: '/admin/index/login'}}));
  assert.equal((await expired.GET(new Request('http://localhost/api/products?role_id=2', {headers: {cookie}}))).status, 401);
  console.log('Passed: merchant shared login, browser session cookie forwarding, missing/expired sessions, and rejected portal logins.');
})();
