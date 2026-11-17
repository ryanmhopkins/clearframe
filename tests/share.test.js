const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'outside-only',url:'https://getclearframe.app/?token=private#photo'});
 const w=dom.window;
 return {dom,w,button:w.document.querySelector('#shareClearFrame'),status:w.document.querySelector('#shareStatus'),fallback:w.document.querySelector('#shareLink'),start(){w.eval(fs.readFileSync('share.js','utf8'));},async tick(){await new Promise(r=>setTimeout(r,0));}};
}
test('share payload contains only a fixed public URL and static copy',async()=>{
 const s=setup();try{
  const calls=[];s.w.navigator.share=async payload=>calls.push(payload);s.start();s.button.click();await s.tick();
  assert.equal(calls.length,1);assert.equal(calls[0].url,'https://getclearframe.app/');assert.doesNotMatch(JSON.stringify(calls),/private|token|photo\.jpg/);assert.equal(s.button.disabled,false);
 }finally{s.dom.window.close();}
});
test('copy fallback reports success only after copying the public link',async()=>{
 const s=setup();try{
  const calls=[];s.w.navigator.clipboard={writeText:async text=>calls.push(text)};s.start();s.button.click();await s.tick();
  assert.deepEqual(calls,['https://getclearframe.app/']);assert.equal(s.status.textContent,'Link copied.');assert.equal(s.fallback.hidden,true);
 }finally{s.dom.window.close();}
});
test('canceling native share does not copy; rejected clipboard offers manual copy',async()=>{
 const s=setup();try{
  let copied=0;s.w.navigator.share=async()=>{const e=new Error();e.name='AbortError';throw e};s.w.navigator.clipboard={writeText:async()=>{copied++;throw new Error('Denied')}};
  s.start();s.button.click();await s.tick();assert.equal(copied,0);assert.equal(s.fallback.hidden,true);assert.equal(s.status.textContent,'');
  delete s.w.navigator.share;s.button.click();await s.tick();assert.equal(copied,1);assert.equal(s.fallback.hidden,false);assert.equal(s.fallback.value,'https://getclearframe.app/');assert.doesNotMatch(s.status.textContent,/copied/i);assert.equal(s.button.disabled,false);
 }finally{s.dom.window.close();}
});
