const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const metadata=require('../metadata.js');
function setup(){
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'outside-only',url:'http://localhost'});
 const w=dom.window;
 w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.Blob=Blob;
 w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
 w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
 w.eval(fs.readFileSync('metadata.js','utf8'));w.eval(fs.readFileSync('motion.js','utf8'));w.eval(fs.readFileSync('app.js','utf8'));
 return {dom,w,query:s=>w.document.querySelector(s)};
}
const jpeg=new Uint8Array([255,216,255,254,0,7,65,108,105,99,101,255,227,0,4,1,2,255,217]);
const file=name=>({name,type:'image/jpeg',size:jpeg.length,lastModified:0,arrayBuffer:async()=>jpeg.buffer});
test('select/deselect all, individual choice, per-image persistence, download and ZIP selections',async()=>{
 const {dom,w,query}=setup();
 try{
  await w.handleFiles([file('same.jpg'),file('same.jpg')]);
  assert.match(query('#selectionCount').textContent,/2 of 2/);
  query('#bulkSelect').click();assert.match(query('#selectionCount').textContent,/0 of 2/);
  assert.equal(query('#cleanBtn span').textContent,'Download unchanged');
  let check=query('#privacyFindings input');check.click();
  assert.equal(query('#bulkSelect').dataset.partial,'true');assert.equal(query('#bulkSelect').getAttribute('aria-checked'),'false');assert.equal(query('#bulkSelectState').textContent,'Some selected');
  assert.match(query('#selectionCount').textContent,/1 of 2/);
  w.document.querySelectorAll('.batch-item')[1].click();assert.match(query('#selectionCount').textContent,/2 of 2/);
  w.document.querySelectorAll('.batch-item')[0].click();assert.match(query('#selectionCount').textContent,/1 of 2/);
  const downloads=[];w.downloadBlob=(blob,name)=>downloads.push({blob,name});
  await w.clean();
  const exported=new Uint8Array(await downloads[0].blob.arrayBuffer());
  assert.deepEqual(metadata.scan(exported).found.map(x=>x.type),['APP3']);
  const packaged=[];
  w.JSZip=class {file(name,data){packaged.push({name,data})}async generateAsync(options,progress){progress({percent:100});return new Blob(['zip'])}};
  await w.cleanAll();assert.equal(packaged.length,2);assert.notEqual(packaged[0].name,packaged[1].name);
  assert.equal(metadata.scan(packaged[0].data).found.length,1);assert.equal(metadata.scan(packaged[1].data).found.length,0);
  query('#bulkSelect').click();assert.match(query('#selectionCount').textContent,/2 of 2/);assert.equal(query('#bulkSelect').getAttribute('aria-checked'),'true');
  query('#bulkSelect').click();await w.clean();
  assert.deepEqual(new Uint8Array(await downloads.at(-1).blob.arrayBuffer()),jpeg);
  query('#startOver').click();assert.equal(query('#results').hidden,true);
 }finally{dom.window.close()}
});
test('metadata and filenames render as text, including markup-like content',async()=>{
 const {dom,w,query}=setup();try{
  const content=Buffer.from('<img src=x onerror=alert(1)>');
  const bytes=new Uint8Array(Buffer.concat([Buffer.from([255,216,255,254,0,content.length+2]),content,Buffer.from([255,217])]));
  await w.handleFiles([{...file('<script>evil</script>.jpg'),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}]);
  assert.equal(query('#privacyFindings img'),null);assert.match(query('#privacyFindings pre').textContent,/<img/);
  assert.equal(query('#batchList script'),null);assert.match(query('#fileName').textContent,/<script>/);
 }finally{dom.window.close()}
});

test('photo detail tabs support keyboard navigation and show readable properties',async()=>{
 const {dom,w,query}=setup();try{
  await w.handleFiles([file('photo.jpg')]);
  assert.equal(w.document.body.classList.contains('has-results'),true);
  query('#detailsTab').click();assert.equal(query('#detailsView').hidden,false);assert.equal(query('#cleanView').hidden,true);
  assert.equal(query('#detailsTab').getAttribute('aria-selected'),'true');
  assert.match(query('#photoProperties').textContent,/photo.jpg/);
  query('#detailsTab').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));
  assert.equal(query('#cleanView').hidden,false);assert.equal(w.document.activeElement.id,'cleanTab');
  query('#startOver').click();assert.equal(w.document.body.classList.contains('has-results'),false);
 }finally{dom.window.close()}
});

test('animated disclosures keep closed content inaccessible and toggle with their buttons',()=>{
 const {dom,query}=setup();try{
  const item=query('.optional-panel.t-acc'),button=item.querySelector('button'),panel=item.querySelector('.t-acc-panel');
  assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(panel.inert,true);
  assert.equal(button.getAttribute('aria-controls'),panel.id);
  button.click();assert.equal(item.dataset.open,'true');assert.equal(panel.inert,false);assert.equal(panel.getAttribute('aria-hidden'),'false');
  button.click();assert.equal(panel.inert,true);assert.equal(button.getAttribute('aria-expanded'),'false');
 }finally{dom.window.close()}
});

test('animated checkmarks stay synchronized with native inputs and bulk actions',async()=>{
 const {dom,w,query}=setup();try{
  await w.handleFiles([file('photo.jpg')]);
  const check=query('#privacyFindings input'),visual=check.nextElementSibling;
  check.click();assert.equal(visual.getAttribute('aria-checked'),'false');
  query('#bulkSelect').click();assert.equal(visual.getAttribute('aria-checked'),'true');assert.equal(check.checked,true);
  query('#bulkSelect').click();assert.equal(visual.getAttribute('aria-checked'),'false');assert.equal(check.checked,false);
  w.toast('Download ready');assert.equal(query('#toast').classList.contains('is-open'),true);
 }finally{dom.window.close()}
});

test('async cleaning failures block individual and ZIP downloads and restore controls',async()=>{
 const {dom,w,query}=setup();try{
  await w.handleFiles([file('photo.jpg')]);
  const downloads=[];w.downloadBlob=(...args)=>downloads.push(args);
  w.getActive().report.clean=async()=>{throw new Error('Image verification failed.');};
  await w.clean();assert.equal(downloads.length,0);assert.match(query('#fileErrors').textContent,/verification failed/);assert.equal(query('#cleanBtn').disabled,false);
  w.JSZip=class {file(){} async generateAsync(){throw new Error('Must not package failed images');}};
  await w.cleanAll();assert.equal(downloads.length,0);assert.match(query('#fileErrors').textContent,/No ZIP was downloaded/);assert.equal(query('#startOver').disabled,false);
 }finally{dom.window.close();}
});

test('file extension fallback handles empty MIME types and shows malformed-file errors',async()=>{
 const {dom,w,query}=setup();try{
  await w.handleFiles([{...file('photo.JPG'),type:''}]);assert.equal(query('#batchCount').textContent,'1');
  await w.handleFiles([{...file('broken.gif'),type:'',arrayBuffer:async()=>new Uint8Array([71,73,70,56,57,97]).buffer}]);
  assert.match(query('#fileErrors').textContent,/broken.gif/);assert.equal(query('#batchCount').textContent,'1');
  const entry=w.getActive();assert.equal(entry.file.name,'photo.JPG');
 }finally{dom.window.close();}
});

test('extended decoder fields appear in readable photo properties',async()=>{
 const {dom,w,query}=setup();try{
  await w.handleFiles([file('photo.jpg')]);
  const entry=w.getActive();entry.decoded.details={'IFD0:Make':'Sony','IFD0:Model':'ILCE-7S','GPS:GPSLatitude':40.71};
  w.renderPhotoData(entry);assert.match(query('#photoProperties').textContent,/Sony/);assert.match(query('#photoProperties').textContent,/40.71/);
 }finally{dom.window.close();}
});

test('fictional sample scans and cleans through the normal flow without opening the file picker',async()=>{
 const {dom,w,query}=setup();
 try{
  w.File=class extends Blob {constructor(parts,name,options){super(parts,options);this.name=name;this.lastModified=options.lastModified;}};
  let pickerOpened=false;query('#fileInput').click=()=>{pickerOpened=true};
  const original=w.handleFiles;
  let finish;const scanned=new Promise(resolve=>{finish=resolve});
  w.handleFiles=async files=>{await original(files);finish(files[0])};
  w.eval(fs.readFileSync('sample-photo.js','utf8'));
  query('#sampleBtn').click();
  const sample=await scanned;
  assert.equal(pickerOpened,false);
  assert.equal(query('#results').hidden,false);
  assert.equal(sample.name,'clearframe-fictional-sample.jpg');
  const before=new Uint8Array(await sample.arrayBuffer());
  assert.ok(metadata.scan(before).found.some(x=>x.type==='APP1'));
  const downloads=[];w.downloadBlob=(blob,name)=>downloads.push({blob,name});
  await w.clean();
  const after=new Uint8Array(await downloads[0].blob.arrayBuffer());
  assert.equal(metadata.scan(after).found.some(x=>x.type==='APP1'),false);
  assert.equal(metadata.scan(after).width,480);
  assert.equal(metadata.scan(after).height,300);
 }finally{dom.window.close()}
});
