const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/services/api.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
async function run(os, role, response) {
  const calls = [];
  const storage = new Map();
  const context = { exports: {}, Headers, require: (name) => { if (name === 'expo-secure-store') return { getItemAsync: async () => JSON.stringify({authenticated:true,userId:42,roleId:role,portalSecurityKey:'a'.repeat(64),portalCookie:'PHPSESSID=test'}) }; if ( name === './product-form' || name === './order-endpoints') return {}; assert.equal(name, 'react-native'); return { Platform: { OS: os } }; }, URLSearchParams, AbortController, setTimeout, clearTimeout,
    sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, text: async () => typeof response === 'string' ? response : JSON.stringify(response) }; }
  };
  vm.runInNewContext(source, context);
  context.exports.setAuthenticatedRoleId(role);
  context.exports.setAuthenticatedUserId(42);
  if(os !== 'web') await context.exports.restoreAuthentication();
  const result = await context.exports.getProductPage({ page: 2, limit: 10 });
  return { result, calls };
}
(async () => {
  const fixture = { status: 'success', data: { 12: { id: 12, product_name: 'Rice', atribute: [{ id: 7, name: '1kg', quantity: 1, unit: 'kg' }] } }, inventry_detail: { 5: { 7: { id: 91, attribute_id: 7, store_id: 5, price: '25.50', stock: '8' } } }, totalRecord: 24 };
  for (const os of ['web', 'android']) {
    const {result, calls} = await run(os, 2, fixture);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.includes(os === 'web' ? 'source=mapped' : 'merchant/product/getproductlist'));
    assert.equal(result.total, 24);
    assert.equal(result.products[0].product_id, 12);
    assert.equal(result.products[0].attribute['7'].price, 25.5);
    assert.equal(result.products[0].attribute['7'].stock, 8);
    assert.equal(result.products[0].attribute['7'].attribute_id, 7);
    assert.equal(result.products[0].attribute['7'].id, 91);
    assert.equal(result.products[0].attribute['7'].store_id, 5);
    const empty = await run(os, 2, {status: 'fail', msg: 'No record found '});
    assert.equal(empty.result.total, 0);
    assert.equal(empty.result.products.length, 0);
    await assert.rejects(run(os, 2, {status: 'fail', msg: 'Session invalid'}), /Session invalid/);
    await assert.rejects(run(os, 2, '<html>Login</html>'), /session has expired/);
  }
  const admin = await run('web', 1, fixture);
  assert.ok(admin.calls[0].url.includes('source=admin'));
  assert.equal(admin.result.total, 24);
  console.log('Passed: browser and mobile merchant loading, inventory values, pagination, empty lists, real failures, expired sessions, and admin routing.');
})();
