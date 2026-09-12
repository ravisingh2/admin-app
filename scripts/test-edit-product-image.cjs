const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, extras = {}) {
  const context = { exports: {}, FormData, Response, Request, URL, URLSearchParams, Blob, ...extras };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText, context);
  return context.exports;
}
const helpers = load('src/services/product-form.ts');
const product = {id:42,product_name:'Rice',category_id:18,item_code:'RICE',product_desc:'',nutrition:'',brand_name:'',status:1,hotdeals:0,offers:0,new_arrival:0,attributes:[{id:7,name:'1 kg',quantity:'1',unit:'kg'}]};
const photo = {uri:'file:///replacement.png',name:'replacement.png',mimeType:'image/png',file:new Blob(['new-image'],{type:'image/png'})};
(async()=>{
  let forwarded;
  const server = load('src/app/api/product-save+api.ts', {require:()=>helpers, fetch:async(_url, init)=>{forwarded=init.body;return new Response(null,{status:302,headers:{location:'/accrabasket/admin/product/index'}});}});
  const request = body => new Request('http://localhost/api/product-save',{method:'POST',headers:{cookie:'accrabasket_admin=PHPSESSID%3Dtest',...(typeof body==='string'?{'Content-Type':'application/json'}:{})},body});
  assert.equal((await server.POST(request(JSON.stringify(product)))).status,200);
  assert.equal(forwarded.get('id'),'42');
  assert.equal(forwarded.get('attribute_id[]'),'7');
  assert.equal(forwarded.has('product_img[]'),false);
  const multipart=new FormData();multipart.append('product',JSON.stringify(product));multipart.append('product_img[]',photo.file,photo.name);
  assert.equal((await server.POST(request(multipart))).status,200);
  assert.equal(forwarded.get('product_img[]').name,photo.name);
  assert.equal(await forwarded.get('product_img[]').text(),'new-image');
  assert.equal(forwarded.get('attribute_id[]'),'7');
  const invalid=new FormData();invalid.append('product',JSON.stringify(product));invalid.append('product_img[]',new Blob(['bad'],{type:'text/plain'}),'bad.txt');
  assert.equal((await server.POST(request(invalid))).status,400);
  const expired=load('src/app/api/product-save+api.ts',{require:()=>helpers,fetch:async()=>new Response(null,{status:302,headers:{location:'/accrabasket/admin/index/login'}})});
  assert.notEqual((await expired.POST(request(JSON.stringify(product)))).status,200);

  for(const os of ['web','android','ios']) {
    class NativeFormData {constructor(){this.parts=[];}append(k,v){this.parts.push([k,v]);}getParts(){return this.parts;}}
    let sent;
    const client=load('src/services/api.ts',{FormData:os==='web'?FormData:NativeFormData,require:name=>name==='./product-form'?helpers:name==='react-native'?{Platform:{OS:os}}:{},fetch:async(_url,init)=>{sent=init;return Response.json({status:'success'});}});
    await client.saveProduct(product,photo);
    assert.equal(sent.headers?.['Content-Type'],undefined,'Let fetch set the multipart boundary.');
    if(os==='web') {
      assert.equal(JSON.parse(sent.body.get('product')).id,42);
      assert.equal(sent.body.get('product_img[]').name,photo.name);
    } else {
      const parts=Object.fromEntries(sent.body.getParts());
      assert.equal(parts.id,'42');assert.equal(parts['product_img[]'].uri,photo.uri);assert.equal(parts['product_img[]'].type,'image/png');
    }
  }

  let cursor=0;const states=[];let chooserResult={canceled:true,assets:null};let saved;let destination;
  const jsx=(type,props)=>({type,props});
  const original={...product,product_id:42,image_url:'https://example.test/current.png',attribute:{7:{id:7,attribute_name:'1 kg',quantity:1,unit:'kg'}}};
  const screen=load('src/app/edit-product.tsx',{require:name=>{
    if(name==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment:'Fragment'};
    if(name==='react')return {useEffect:()=>{},useMemo:fn=>fn(),useState:initial=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value];}};
    if(name==='expo-image')return {Image:'Image'};
    if(name==='expo-image-picker')return {launchImageLibraryAsync:async()=>chooserResult};
    if(name==='expo-router')return {useLocalSearchParams:()=>({id:'42'}),router:{replace:value=>destination=value,back:()=>{}}};
    if(name==='react-native')return {...Object.fromEntries(['ActivityIndicator','KeyboardAvoidingView','Modal','Pressable','ScrollView','Text','TextInput','View'].map(k=>[k,k])),Platform:{OS:'web'},StyleSheet:{create:v=>v},Alert:{alert:()=>{}}};
    if(name==='react-native-safe-area-context')return {SafeAreaView:'SafeAreaView'};
    if(name==='@/services/api')return {getSelectedProduct:()=>original,getCategories:async()=>[],getProductListFilters:()=>({productName:'Rice',categoryId:18}),saveProduct:async(data,image)=>{saved={data,image};}};
    throw Error(name);
  }});
  const render=()=>{cursor=0;return screen.default();};
  function nodes(tree) {if(!tree||typeof tree!=='object')return [];const children=tree.props?.children;return [tree,...(Array.isArray(children)?children:[children]).flatMap(nodes)];}
  const button=(tree,label)=>nodes(tree).find(n=>n.type==='Pressable'&&nodes(n).some(c=>c.type==='Text'&&c.props.children===label));
  let tree=render();assert.ok(nodes(tree).some(n=>n.type==='Image'&&n.props.source.uri===original.image_url));
  await button(tree,'Change image').props.onPress();tree=render();assert.ok(!button(tree,'Keep current image'));
  chooserResult={canceled:false,assets:[{uri:photo.uri,fileName:photo.name,mimeType:photo.mimeType,file:photo.file}]};
  await button(tree,'Change image').props.onPress();tree=render();assert.ok(nodes(tree).some(n=>n.type==='Image'&&n.props.source.uri===photo.uri));
  button(tree,'Keep current image').props.onPress();tree=render();assert.ok(nodes(tree).some(n=>n.type==='Image'&&n.props.source.uri===original.image_url));
  await button(tree,'Change image').props.onPress();tree=render();await button(tree,'Save Product').props.onPress();
  assert.equal(saved.image.uri,photo.uri);assert.equal(saved.data.id,42);assert.ok(destination.params.refresh);
  console.log('Passed: image selection, preview, cancellation, undo, save and list refresh; web/iOS/Android image payloads; existing image preservation; server upload validation and failed-session handling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
