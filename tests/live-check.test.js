const {test}=require('node:test');
const assert=require('node:assert/strict');
const {checkLive,CHECKS}=require('../scripts/check-live.cjs');
function response(type,body,status=200){return {ok:status===200,status,headers:{get:()=>type},text:async()=>body};}
test('live checks stay read-only and avoid checkout/API endpoints',async()=>{
 const requested=[];
 const results=await checkLive({fetchImpl:async(url,options)=>{
  requested.push(url);assert.equal(options.redirect,'error');assert.equal(options.method,undefined);assert.equal(options.body,undefined);
  const [path,type,marker]=CHECKS.find(([path])=>url==='https://getclearframe.app'+path);
  return response(type,marker+(path==='/signin'?' <meta name="robots" content="noindex">':''));
 }});
 assert.equal(results.length,12);assert.ok(results.every(r=>r.ok));
 assert.ok(requested.every(url=>!url.includes('/checkout')&&!url.includes('/api/')));
});
test('HTTP 200 HTML masquerading as script is rejected and subsequent checks continue',async()=>{
 const results=await checkLive({fetchImpl:async url=>{
  const [path,type,marker]=CHECKS.find(([path])=>url==='https://getclearframe.app'+path);
  if(path==='/app.js')return response('text/html','<html>Not found</html>');
  if(path==='/pricing')return response(type,'wrong page');
  if(path==='/signin')return response(type,marker);
  return response(type,marker);
 }});
 assert.deepEqual(results.filter(r=>!r.ok).map(r=>r.path),['/pricing','/signin','/app.js']);
 assert.equal(results.at(-1).ok,true);
});
