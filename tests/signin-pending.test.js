const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
function setup(fetchImpl){
 const dom=new JSDOM(fs.readFileSync('signin.html','utf8'),{runScripts:'outside-only',url:'https://getclearframe.app/signin'});
 const w=dom.window;w.fetch=fetchImpl;w.document.querySelector('#email').value='test@example.com';w.eval(fs.readFileSync('signin.js','utf8'));
 return {dom,w,form:w.document.querySelector('#signin'),button:w.document.querySelector('#signin button[type="submit"]'),status:w.document.querySelector('#signinStatus'),submit(){this.form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));},async tick(){await new Promise(r=>setTimeout(r,0));}};
}
test('repeated pending submissions make one request and completion restores controls',async()=>{
 let resolve,calls=0;
 const s=setup((url,options)=>{calls++;assert.equal(url,'/api/auth/request');assert.equal(options.signal.aborted,false);return new Promise(r=>{resolve=r});});
 try{
  s.submit();s.submit();assert.equal(calls,1);assert.equal(s.button.disabled,true);assert.equal(s.form.getAttribute('aria-busy'),'true');
  resolve({ok:true,json:async()=>({message:'If this email has Pro, a sign-in link is on its way.'})});await s.tick();
  assert.equal(s.button.disabled,false);assert.equal(s.form.hasAttribute('aria-busy'),false);assert.match(s.status.textContent,/If this email/);
 }finally{s.dom.window.close();}
});
test('network failure restores the form and allows a retry',async()=>{
 let calls=0;const s=setup(async()=>{calls++;throw new Error('offline')});
 try{
  s.submit();await s.tick();assert.equal(s.button.disabled,false);assert.match(s.status.textContent,/could not be confirmed/);
  s.submit();await s.tick();assert.equal(calls,2);assert.equal(s.form.hasAttribute('aria-busy'),false);
 }finally{s.dom.window.close();}
});
test('timed-out request aborts and restores controls',async()=>{
 const s=setup((url,options)=>new Promise((resolve,reject)=>{
  options.signal.addEventListener('abort',()=>reject(new Error('aborted')));
 }));
 try{
  let expire;s.w.setTimeout=callback=>{expire=callback;return 1};s.w.clearTimeout=()=>{};
  s.submit();assert.equal(s.button.disabled,true);expire();await s.tick();
  assert.equal(s.button.disabled,false);assert.equal(s.form.hasAttribute('aria-busy'),false);assert.match(s.status.textContent,/could not be confirmed/);
 }finally{s.dom.window.close();}
});
