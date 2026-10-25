const $=s=>document.querySelector(s);const drop=$('#dropzone'),input=$('#fileInput'),results=$('#results');let batch=[],activeId=null;
const TYPES={jpg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',heic:'image/heic',heif:'image/heif',avif:'image/avif',tif:'image/tiff',tiff:'image/tiff',dng:'image/x-adobe-dng',cr2:'image/x-canon-cr2',nef:'image/x-nikon-nef',arw:'image/x-sony-arw'};
const human=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
function renderList(el,items,empty){
  el.replaceChildren();
  if(!items.length){const p=document.createElement('p');p.className='empty-finding';p.textContent=empty;el.append(p);return}
  const entry=getActive();
  items.forEach(x=>{
    const row=document.createElement('div');row.className='finding-item metadata-item';
    const label=document.createElement('label');label.className='metadata-choice';
    const check=document.createElement('input');check.type='checkbox';check.checked=entry.selected.has(x.id);check.disabled=!x.removable;
    check.dataset.metadataId=x.id;check.setAttribute('aria-label',`Remove ${x.label}`);
    check.onchange=()=>{check.checked?entry.selected.add(x.id):entry.selected.delete(x.id);visual.setAttribute('aria-checked',String(check.checked));updateSelection();renderBatch()};
    const control=document.createElement('span');control.className='check-control';
    const visual=document.createElement('span');visual.className='t-check';visual.setAttribute('aria-hidden','true');visual.setAttribute('aria-checked',String(check.checked));
    visual.innerHTML='<svg viewBox="0 0 10.1668 10.1668"><path d="M1 5.52L3.92 9.17L9.17 1"/></svg>';
    // Length of the two straight path segments, used when geometry APIs are unavailable.
    visual.style.setProperty('--check-len',String(Math.ceil(Math.hypot(2.92,3.65)+Math.hypot(5.25,8.17))));
    control.append(check,visual);
    const content=document.createElement('span');
    const title=document.createElement('strong');title.textContent=x.label;
    const description=document.createElement('small');description.textContent=`${x.detail} · ${x.removable?'Select to remove':(x.keepReason||'Required for correct display')}`;
    content.append(title,description);label.append(control,content);row.append(label);
    if(x.value || x.rawPreview){const detail=document.createElement('details');const summary=document.createElement('summary');summary.textContent=x.value?'View embedded value':'View raw metadata bytes';const pre=document.createElement('pre');pre.textContent=x.value || x.rawPreview;detail.append(summary,pre);row.append(detail)}
    el.append(row);const path=visual.querySelector('path');if(path.getTotalLength)visual.style.setProperty('--check-len',Math.ceil(path.getTotalLength()));
  });
}
function updateSelection(){
  const entry=getActive();if(!entry)return;
  const count=entry.selected.size,total=entry.report.found.filter(x=>x.removable).length;
  $('#selectionCount').textContent=`${count} of ${total} items selected`;
  const toggle=$('#bulkSelect'),all=total>0&&count===total,partial=count>0&&!all;
  toggle.disabled=total===0;toggle.dataset.on=String(all);toggle.dataset.partial=String(partial);toggle.setAttribute('aria-checked',String(all));
  $('#bulkSelectState').textContent=total===0?'Nothing to select':all?'All selected':partial?'Some selected':'None selected';
  $('#cleanDescription').textContent=count?`${count} ${count===1?'item':'items'} will be removed.`:'Nothing selected. Your copy will be unchanged.';
  $('#cleanBtn span').textContent=count?'Download clean copy':'Download unchanged';
}
function setSelection(all){const entry=getActive();if(!entry)return;entry.selected=new Set(all?entry.report.found.filter(x=>x.removable).map(x=>x.id):[]);document.querySelectorAll('.metadata-choice input').forEach(check=>{check.checked=entry.selected.has(check.dataset.metadataId);check.nextElementSibling.setAttribute('aria-checked',String(check.checked))});updateSelection();renderBatch()}
function renderPhotoData(entry){
  const data={File:{name:entry.file.name,format:entry.report.format,bytes:entry.file.size,lastModified:new Date(entry.file.lastModified).toISOString(),width:entry.report.width,height:entry.report.height},...entry.decoded.details};
  $('#photoData').textContent=JSON.stringify(data,(key,value)=>ArrayBuffer.isView(value)?`Binary data (${value.byteLength} bytes)`:value,2);
  $('#scanWarnings').textContent=entry.decoded.warnings.join(' ');
  $('#structureData').textContent=entry.report.structure.map(x=>`${x.type}: ${x.detail || human(x.bytes)} (kept)`).join('\n');
  const properties=[['File name',entry.file.name],['Format',entry.report.format],['File size',human(entry.file.size)],['Dimensions',entry.report.width?`${entry.report.width} × ${entry.report.height}`:'Not available'],['Metadata items',String(entry.report.found.length)]];
  const seen=new Set();
  function collect(value,depth=0){
    if(!value || typeof value!=='object' || depth>5 || ArrayBuffer.isView(value))return;
    for(const [key,item] of Object.entries(value)){
      const name=key.split(':').pop();
      if(['Make','Model','LensModel','DateTimeOriginal','ExposureTime','FNumber','ISO','latitude','longitude','GPSLatitude','GPSLongitude','Artist','Copyright','Software','Orientation'].includes(name) && !seen.has(name)){
        seen.add(name);properties.push([name.replace(/([a-z])([A-Z])/g,'$1 $2'),item instanceof Date?item.toLocaleString():String(item)]);
      }else if(item && typeof item==='object')collect(item,depth+1);
    }
  }
  collect(entry.decoded.details);
  const list=document.createElement('dl');
  for(const [key,value] of properties){const row=document.createElement('div');row.className='property-row';const label=document.createElement('dt'),content=document.createElement('dd');label.textContent=key;content.textContent=value;row.append(label,content);list.append(row)}
  $('#photoProperties').replaceChildren(list);

}
const escapeHTML=s=>s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function getActive(){return batch.find(x=>x.id===activeId)}
function cleanName(file){const base=file.name.replace(/\.[^.]+$/,'');return`${base}-clean.${file.name.split('.').pop()}`}
function renderBatch(){
  $('#batchCount').textContent=batch.length;$('#batchNoun').textContent=batch.length===1?'photo':'photos';
  const list=$('#batchList');list.innerHTML='';
  batch.forEach(entry=>{const button=document.createElement('button');button.type='button';button.className='batch-item'+(entry.id===activeId?' active':'');button.setAttribute('aria-pressed',entry.id===activeId?'true':'false');button.innerHTML=`<img src="${entry.url}" alt=""><span><b>${escapeHTML(entry.file.name)}</b><small>${entry.selected.size} selected · ${human(entry.file.size)}</small></span><i>${entry.id===activeId?'•':''}</i>`;button.onclick=()=>select(entry.id);button.querySelector('img').onerror=e=>{e.target.hidden=true;button.classList.add('no-preview');};list.appendChild(button)});
}
function select(id){
  $('#bulkSelect').classList.remove('is-init');activeId=id;const entry=getActive();if(!entry)return;renderBatch();
  const {file,report}=entry;$('#preview').src=entry.url;$('#preview').hidden=false;$('#previewFallback').hidden=true;$('#preview').onerror=()=>{$('#preview').hidden=true;$('#previewFallback').hidden=false;};$('#fileName').textContent=file.name;
  $('#fileDetails').textContent=`${human(file.size)} · ${report.format}${report.width?` · ${report.width} × ${report.height}`:''}`;
  const priv=report.found.filter(x=>x.kind==='private'),prov=report.found.filter(x=>x.kind==='provenance'),appearance=report.found.filter(x=>x.kind==='appearance');
  renderList($('#privacyFindings'),priv,'No other metadata blocks detected');
  renderList($('#provenanceFindings'),prov,report.decoded?'No removable credential containers listed':'No credential containers detected');
  renderList($('#appearanceFindings'),appearance,'No display metadata blocks detected');
  $('#privacyCount').textContent=priv.length;$('#provCount').textContent=prov.length;$('#appearanceCount').textContent=appearance.length;
  $('#summaryTitle').textContent=report.found.length?'Metadata found':report.decoded?'No removable fields found':'No metadata found';
  $('#formatNote').textContent=report.decoded?.warnings.join(' ')||'';$('#formatNote').hidden=!report.decoded;
  $('#selectionNote').textContent=report.decoded?'Selections remove the listed fields or groups. Required image data is kept.':'Selections remove whole metadata blocks, including the tags inside.';
  $('#summaryCopy').textContent='Checked items will be removed. Everything else stays.';
  renderPhotoData(entry);updateSelection();
}
let fileQueue=Promise.resolve(),generation=0,exporting=false;
function handleFiles(files){const incoming=[...files],current=generation;fileQueue=fileQueue.then(()=>loadFiles(incoming,current)).catch(()=>toast('Could not load these photos. Please try again.'));return fileQueue;}
async function loadFiles(files,current){
 const valid=files.filter(file=>Object.values(TYPES).includes(file.type)||/\.(jpe?g|png|webp|gif|heic|heif|avif|tiff?|dng|cr2|nef|arw)$/i.test(file.name));
 if(!valid.length){toast('Choose a supported photo format');return;}
 const fresh=[],errors=[];
 $('#scanStatus').hidden=false;
 try{for(const [index,file] of valid.entries()){
  if(current!==generation)return;
  $('#scanStatus').textContent=`Reading photo ${index+1} of ${valid.length}…`;
  try{
   if(!globalThis.ClearFramePro && /\.(dng|cr2|nef|arw)$/i.test(file.name))throw new Error('RAW cleaning is part of ClearFrame Pro.');
   if(file.size>256*1024*1024)throw new Error('This photo exceeds the 256 MB browser processing limit.');
   const b=new Uint8Array(await file.arrayBuffer()),id=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`;
   const native=(b[0]===255&&b[1]===216)||(b[0]===137&&b[1]===80)||(b[0]===82&&b[1]===73)||(b[0]===71&&b[1]===73);
   const report=native?ClearFrameMetadata.scan(b):await ClearFrameExtended.scan(file,b,id);
   const decoded=report.decoded || await ClearFrameMetadata.decode(b,report,window.exifr);
   if(current!==generation)return;
   fresh.push({id,file,b,report,decoded,selected:new Set(report.found.filter(x=>x.selected).map(x=>x.id)),url:URL.createObjectURL(file)});
  }catch(e){errors.push(`${file.name}: ${e.message}`);}
 }
 if(valid.length!==files.length)errors.push(`${files.length-valid.length} unsupported files were skipped.`);
 $('#fileErrors').textContent=errors.join('\n');$('#fileErrors').hidden=!errors.length;
 if(!fresh.length)return;
 batch.push(...fresh);activeId=fresh[0].id;results.hidden=false;$('.workspace').hidden=true;document.body.classList.add('has-results');showReview('clean');renderBatch();select(activeId);results.scrollIntoView({behavior:'smooth',block:'start'});
 }finally{if(current===generation)$('#scanStatus').hidden=true;}
}
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
function exportBusy(busy){exporting=busy;$('#cleanBtn').disabled=busy;$('#cleanAllBtn').disabled=busy;$('#startOver').disabled=busy;}
async function clean(){
 const entry=getActive();if(!entry||exporting)return;const selected=new Set(entry.selected);exportBusy(true);
 try{const cleaned=await entry.report.clean(selected);downloadBlob(new Blob([cleaned],{type:entry.report.mime||entry.file.type||'application/octet-stream'}),cleanName(entry.file));toast(`Copy ready · ${human(cleaned.length)}`);$('#fileErrors').hidden=true;}
 catch(e){$('#fileErrors').textContent=e.message;$('#fileErrors').hidden=false;}
 finally{exportBusy(false);}
}
async function cleanAll(){
 if(!batch.length||exporting)return;if(!window.JSZip){toast('ZIP tools are still loading. Try again.');return;}
 const entries=batch.map(entry=>({entry,selected:new Set(entry.selected)})),button=$('#cleanAllBtn');exportBusy(true);button.innerHTML='<span>Checking photos</span><b>···</b>';
 try{const zip=new JSZip();for(const [index,{entry,selected}] of entries.entries()){
  const output=await entry.report.clean(selected);zip.file(`${String(index+1).padStart(3,'0')}-${cleanName(entry.file)}`,output);button.querySelector('b').textContent=`${index+1}/${entries.length}`;
 }button.querySelector('span').textContent='Packaging';
 const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}},meta=>{button.querySelector('b').textContent=`${Math.round(meta.percent)}%`;});downloadBlob(blob,'clearframe-clean-images.zip');toast(`${entries.length} copies ready`);$('#fileErrors').hidden=true;
 }catch(e){$('#fileErrors').textContent=`No ZIP was downloaded. ${e.message}`;$('#fileErrors').hidden=false;}
 finally{exportBusy(false);button.innerHTML='<span>Download all</span><b>ZIP ↓</b>';}
}
function reset(){if(exporting)return;generation++;window.ClearFrameExtended?.reset();$('#scanStatus').hidden=true;$('#fileErrors').hidden=true;batch.forEach(x=>URL.revokeObjectURL(x.url));batch=[];activeId=null;input.value='';results.hidden=true;$('.workspace').hidden=false;document.body.classList.remove('has-results');showReview('clean');window.scrollTo({top:0,behavior:'smooth'})}function toast(s){const t=$('#toast');t.textContent=s;t.classList.add('is-open');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('is-open'),2800)}
$('#browseBtn').onclick=e=>{e.stopPropagation();input.click()};$('#addMore').onclick=()=>input.click();drop.onclick=e=>{if(e.target.tagName!=='BUTTON')input.click()};drop.onkeydown=e=>{if(e.target!==drop)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();input.click()}};input.onchange=()=>{handleFiles(input.files);input.value=''};['dragenter','dragover'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.add('dragging')}));['dragleave','drop'].forEach(n=>drop.addEventListener(n,e=>{e.preventDefault();drop.classList.remove('dragging')}));drop.ondrop=e=>handleFiles(e.dataTransfer.files);$('#bulkSelect').onclick=()=>{const toggle=$('#bulkSelect');toggle.classList.add('is-init');setSelection(toggle.dataset.on!=='true')};$('#cleanBtn').onclick=clean;$('#cleanAllBtn').onclick=cleanAll;$('#startOver').onclick=reset;
try{const ctx=document.modelContext;if(ctx?.registerTool){ctx.registerTool({name:'open_image_picker',title:'Choose images',description:'Open the device file picker to select images for a local metadata scan.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(){input.click();return{status:'picker_opened'}}});ctx.registerTool({name:'get_scan_summary',title:'Read scan summary',description:'Return metadata scan summaries for the current image batch.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(){if(!batch.length)throw new Error('No images are currently selected');return{images:batch.map(x=>({file:x.file.name,privacy_findings:x.report.found.filter(y=>y.kind==='private').map(y=>y.label),provenance_findings:x.report.found.filter(y=>y.kind==='provenance').map(y=>y.label)}))}}})}}catch(e){}

function showReview(view){
  const details=view==='details';
  $('#cleanView').hidden=details;$('#detailsView').hidden=!details;
  for(const id of ['clean','details']){const tab=$('#'+id+'Tab'),active=id===view;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1}
  window.ClearFrameMotion?.moveTab();
}
for(const id of ['clean','details']){
  $('#'+id+'Tab').onclick=()=>showReview(id);
  $('#'+id+'Tab').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const target=e.key==='Home'?'clean':e.key==='End'?'details':id==='clean'?'details':'clean';showReview(target);$('#'+target+'Tab').focus()}};
}
function ClearFrameCurrentIds(){return [...(getActive()?.selected||[])]}
function ClearFrameApplyToAll(ids){const wanted=new Set(ids||[]);for(const entry of batch){entry.selected=new Set(entry.report.found.filter(x=>x.removable&&wanted.has(x.id)).map(x=>x.id));}if(getActive())select(activeId);else renderBatch();}
