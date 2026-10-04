const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = process.env.SESSION_TEST_ROOT || path.resolve(__dirname, '..');
let calls = [], reply = () => Response.json({status:'success', data:{}});
const cache = new Map();
function load(file, os = 'web') {
  file = path.resolve(root, file);
  const key = os + file;
  if (cache.has(key)) return cache.get(key);
  const exports = {};
  cache.set(key, exports);
  const requireModule = name => {
    if (name === 'react-native') return {Platform:{OS:os}};
    if (name === 'expo-secure-store') return {getItemAsync:async()=>JSON.stringify({authenticated:true,roleId:2,userId:42,portalSecurityKey:'a'.repeat(64),portalCookie:'PHPSESSID=native'}),setItemAsync:async()=>{}};
    return load(path.relative(root, path.resolve(path.dirname(file), name + '.ts')), os);
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, process:{env:{ACCRABASKET_APP_KEY:'a'.repeat(64)}}, require:requireModule, Request, Response, Headers, URL, URLSearchParams, FormData, AbortController, setTimeout,clearTimeout,
    localStorage:{setItem:()=>{}},
    fetch:async(url,init)=>{calls.push({url,init});return reply(url,init);}
  });
  return exports;
}
(async()=>{
  const cookie = 'accrabasket_admin=PHPSESSID%3Dtest';
  const request=(url, body='', withCookie=true)=>new Request('http://localhost'+url,{method:'POST',headers:withCookie?{cookie}:{},body});
  const categories=load('src/app/api/categories+api.ts');
  assert.equal((await categories.POST(request('/api/categories','',false))).status,401);
  assert.equal(calls.length,0);
  assert.equal((await categories.POST(new Request('http://localhost/api/categories', {method:'POST',headers:{cookie:'accrabasket_admin=%ZZ'}}))).status,401);
  assert.equal(calls.length,0);
  reply=()=>Response.json({status:'success',data:{1:{id:1,category_name:'Test'}}});
  assert.equal((await categories.POST(request('/api/categories'))).status,200);
  assert.equal(new Headers(calls.at(-1).init.headers).get('Cookie'),'PHPSESSID=test');
  assert.match(calls.at(-1).url,/admin\/product\/getCategoryList$/);
  const merchant=load('src/app/api/merchant+api.ts');
  assert.equal((await merchant.POST(request('/api/merchant?action=storelist','',false))).status,401);
  assert.equal((await merchant.POST(request('/api/merchant?action=deleteproduct'))).status,400);
  await merchant.POST(request('/api/merchant?action=getOrderList','page=1&merchant_id=999&method=deleteproduct'));
  assert.equal(calls.at(-1).init.body,'page=1');
  assert.match(calls.at(-1).url,/merchant\/product\/getOrderList$/);
  for (const status of [302,401,403,404,500]) {
    reply=()=>new Response(null,{status,headers:status===302?{location:'/accrabasket/admin/index/login'}:{}});
    assert.equal((await merchant.POST(request('/api/merchant?action=storelist'))).status,status===302?401:status);
  }
  reply=()=>new Response('<form action="/login"><input type="password"></form>');
  assert.equal((await categories.POST(request('/api/categories'))).status,401);
  reply=()=>new Response('<html>PHP error</html>');
  assert.equal((await merchant.POST(request('/api/merchant?action=saveinventory'))).status,502);
  reply=()=>new Response(null,{status:302,headers:{location:'/unexpected'}});
  assert.equal((await merchant.POST(request('/api/merchant?action=saveinventory'))).status,502);
  const products=load('src/app/api/products+api.ts');
  assert.equal((await products.GET(new Request('http://localhost/api/products?role_id=2&source=inventory'))).status,401);
  reply=()=>Response.json({status:'success',data:{}});
  await products.GET(new Request('http://localhost/api/products?role_id=2&source=inventory',{headers:{cookie}}));
  assert.match(calls.at(-1).url,/merchant\/product\/getproductlist$/);
  for(const os of ['web','android','ios']) {
    const api=load('src/services/api.ts',os);
    if(os==='web'){api.setAuthenticatedRoleId(2);api.setAuthenticatedUserId(42);await api.setAuthenticated(true);}
    else await api.restoreAuthentication();
    reply=()=>Response.json({status:'success',data:{1:{id:1,store_name:'Test'}}});
    await api.getMerchantStores();
    assert.equal(calls.at(-1).init.credentials,'include');
    if(os!=='web') assert.equal(calls.at(-1).init.headers.get('Cookie'),'PHPSESSID=native');
    assert.ok(!calls.at(-1).url.includes('basketapi'));
    await api.saveMerchantInventory({productId:1,storeId:1,variants:[{id:2,price:5,stock:4}]});
    assert.match(calls.at(-1).url,/saveinventory$/);
    assert.equal(new URLSearchParams(calls.at(-1).init.body).get('merchant_id'),null);
    await api.getCategories();
    assert.equal(calls.at(-1).init.credentials,'include');
  }
  console.log('PASS: session forwarding on web/Android/iOS; missing, malformed and expired sessions; action allowlist; identity stripping; inventory bypass removed; categories and inventory use portal.');
})().catch(error=>{console.error(error);process.exitCode=1;});
