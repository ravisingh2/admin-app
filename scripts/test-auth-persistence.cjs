const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/services/api.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(os, storage, fetch = async () => Response.json({ status: 'success' })) {
  const context = { exports: {}, require: name => {
    if(name === './product-form') return {};
    if(name === 'react-native') return {Platform: {OS: os}};
    if(name === 'expo-secure-store') return {getItemAsync: async k => storage.get(k) ?? null, setItemAsync: async (k,v) => storage.set(k,v), deleteItemAsync: async k => storage.delete(k)};
    throw Error(name);
  }, localStorage: {getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}, sessionStorage: {getItem:()=>null,removeItem:()=>{}}, fetch, URLSearchParams, AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(source, context);
  return context.exports;
}
(async()=>{
  for(const os of ['web','android','ios']) {
    const storage = new Map();
    const api=load(os,storage);
    let notifications = 0;
    const unsubscribe = api.subscribeAuthentication(() => notifications++);
    api.setAuthenticatedRoleId(2); api.setAuthenticatedUserId(42);
    api.setAuthenticatedUserName('  Ama Mensah  ');
    await api.setAuthenticated(true);
    assert.equal(notifications, 1);
    unsubscribe();
    const restarted=load(os,storage);
    assert.equal(restarted.isAuthenticated(),false);
    await restarted.restoreAuthentication();
    assert.equal(restarted.isAuthenticated(),true);
    assert.equal(restarted.getAuthenticatedUserId(),42);
    assert.equal(restarted.getAuthenticatedRoleId(),2);
    assert.equal(restarted.getAuthenticatedUserName(),'Ama Mensah');
    await restarted.setAuthenticated(false);
    assert.equal(restarted.getAuthenticatedUserName(),'');
    const loggedOut=load(os,storage); await loggedOut.restoreAuthentication();
    assert.equal(loggedOut.isAuthenticated(),false);
    assert.equal(loggedOut.getAuthenticatedUserName(),'');
    storage.set('accrabasket_session_v1', JSON.stringify({ authenticated: true, userId: 42, roleId: 2 }));
    const legacy = load(os, storage);
    await legacy.restoreAuthentication();
    assert.equal(legacy.isAuthenticated(), true);
    assert.equal(legacy.getAuthenticatedUserName(), '');
  }
  const storage=new Map(); let step=0;
  const api=load('android',storage,async(url,options)=>{
    step++;
    if(step===1) return new Response('',{headers:{'set-cookie':'PHPSESSID=test; Path=/'}});
    assert.equal(options.headers.Cookie,'PHPSESSID=test');
    if(step===2) return new Response('<html>Dashboard</html>',{status:200});
    return Response.json({status:'success',data:{}});
  });
  await api.createAdminSession('test-user','test-password',2);
  assert.equal(step,3);
  api.setAuthenticatedRoleId(2); api.setAuthenticatedUserId(42); await api.setAuthenticated(true);
  assert.ok(![...storage.values()][0].includes('test-password'));
  let cookie='';
  const restarted=load('android',storage,async(url,options)=>{cookie=options.headers.Cookie;return Response.json({status:'success',data:{}});});
  await restarted.restoreAuthentication(); await restarted.getProductPage();
  assert.equal(cookie,'PHPSESSID=test');
  const expired=load('android',storage,async()=>new Response('',{status:401}));
  await expired.restoreAuthentication();
  await assert.rejects(expired.getProductPage(),/session has expired/);
  assert.equal(expired.isAuthenticated(),true);
  const rejected=load('android',new Map(),async(url)=> url.endsWith('/login') ? new Response('',{headers:{'set-cookie':'PHPSESSID=bad'}}): new Response('<html>Login</html>'));
  await assert.rejects(rejected.createAdminSession('bad','bad',2));
  console.log('Passed: web/native restart persistence, explicit logout, Android followed redirects, secure cookie restoration, no password storage, and expired-session login retention.');
})();
