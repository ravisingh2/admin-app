const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const env={ACCRABASKET_APP_KEY:'a'.repeat(64)}, calls=[];
const context={exports:{},process:{env},URL,Headers,fetch:async(url,init)=>{calls.push({url,init});return new Response(null,{status:302});}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/portal-fetch.server.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
(async()=>{
 await context.exports.portalFetch('https://crtup.in/accrabasket/admin/index',{headers:{Cookie:'PHPSESSID=test','X-Accrabasket-App-Key':'forged'},redirect:'follow'});
 assert.equal(calls[0].init.headers['x-accrabasket-app-key'],env.ACCRABASKET_APP_KEY);
 assert.equal(calls[0].init.headers.cookie,'PHPSESSID=test');
 assert.equal(calls[0].init.redirect,'manual');
 await assert.rejects(context.exports.portalFetch('https://example.test/accrabasket/admin/index'));
 env.ACCRABASKET_APP_KEY='';
 await assert.rejects(context.exports.portalFetch('https://crtup.in/accrabasket/admin/index'));
 assert.equal(calls.length,1);
 console.log('PASS: server-only key injection, configured key overrides client header, cookies retained, redirects not followed, foreign hosts and missing configuration rejected.');
})().catch(e=>{console.error(e);process.exitCode=1;});
