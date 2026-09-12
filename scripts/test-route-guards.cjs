const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/app/_layout.tsx','utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022}}).outputText;
function accessibleScreens(authenticated, role = 2, snapshots = []) {
  const Stack = Object.assign(()=>{}, {Protected: 'Protected', Screen: 'Screen'});
  const jsx=(type,props)=>({type,props});
  const context={exports:{}, require(name) {
    if(name==='react/jsx-runtime') return {jsx,jsxs:jsx,Fragment:'Fragment'};
    if(name==='react') return {useEffect:()=>{},useState:()=>[true,()=>{}],useSyncExternalStore:(subscribe,snapshot)=>{ snapshots.push(snapshot); return snapshot(); }};
    if(name==='expo-router') return {Stack};
    if(name==='expo-status-bar') return {StatusBar:'StatusBar'};
    if(name==='react-native') return {};
    if(name==='@/services/api') return {isAuthenticated:()=>authenticated,getAuthenticatedRoleId:()=>typeof role === 'number' ? role : role.value,subscribeAuthentication:()=>()=>{},restoreAuthentication:async()=>{}};
    throw Error(name);
  }};
  vm.runInNewContext(source,context);
  const tree=context.exports.default();
  const screens=[];
  function walk(node) {
    if(!node||typeof node!=='object')return;
    if(node.type==='Protected'&&!node.props.guard)return;
    if(node.type==='Screen')screens.push(node.props.name);
    const children=node.props?.children;
    (Array.isArray(children)?children:[children]).forEach(walk);
  }
  walk(tree);return screens;
}
assert.deepEqual(accessibleScreens(false),['index']);
assert.ok(accessibleScreens(true, 1).includes('add-product'));
for (const role of [0, 2, 3]) assert.ok(!accessibleScreens(true, role).includes('add-product'));
const sessionRole = {value:2};
const snapshots = [];
accessibleScreens(true, sessionRole, snapshots);
const beforeRoleChange = snapshots.map(snapshot => snapshot());
sessionRole.value = 1;
assert.ok(snapshots.some((snapshot, i) => snapshot() !== beforeRoleChange[i]), 'The route guard must subscribe to role changes even while the login status stays true.');
assert.ok(accessibleScreens(true, sessionRole).includes('add-product'));
const signedIn=accessibleScreens(true);
assert.ok(!signedIn.includes('index'));
for(const screen of ['dashboard','home','products','orders','order-details','merchant-inventory','edit-product','explore','reconnect-products']) assert.ok(signedIn.includes(screen));
assert.deepEqual(accessibleScreens(false),['index']);
console.log('Passed: logged-out routes exclude all private screens; logged-in routes exclude login and retain protected product reconnection.');
