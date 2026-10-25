/* Extended formats use ExifTool in a worker; no image conversion or uploads. */
import {parseMetadata, writeMetadata} from './vendor/exiftool/index.mjs';
import {tiffImageHash} from './image-integrity.mjs';
export const FORMATS = new Set(['HEIC','HEIF','AVIF','TIFF','DNG','CR2','NEF','ARW']);
const RAW = new Set(['DNG','CR2','NEF','ARW']);
const SAFE_EXIF = new Set(['Artist','Copyright','ImageDescription','XPTitle','XPComment','XPAuthor','XPKeywords','XPSubject','UserComment','DateTimeOriginal','CreateDate','ModifyDate','OffsetTime','OffsetTimeOriginal','OffsetTimeDigitized','SubSecTime','SubSecTimeOriginal','SubSecTimeDigitized','CameraOwnerName','BodySerialNumber','LensSerialNumber','ImageUniqueID','HostComputer','DocumentName','PageName']);
const scanArgs = ['-j','-G1','-n','-a','-api','RequestTags=ImageDataHash'];
const defaultFetch = () => fetch(new URL('./vendor/exiftool/zeroperl-mqcadjqm.wasm', import.meta.url));
function checked(result) {
  if(!result.success) throw new Error(result.error || 'The photo engine could not process this file.');
  return result.data;
}
async function read(file, engineFetch) {
  const tags=JSON.parse(checked(await parseMetadata(file,{fetch:engineFetch,args:scanArgs})))[0];
  const warning=tags?.['ExifTool:Warning'];
  const omittedArray=warning && /^\[Minor\] Not decoding some large array\(s\)\. Ignore minor errors to decode(?: \[x\d+\])?$/.test(warning);
  if(!tags || tags['ExifTool:Error'] || (warning && !omittedArray)) throw new Error('This file has structural warnings and cannot be safely cleaned.');
  return tags;
}
function value(tags,name){return Object.entries(tags).find(([k])=>k.endsWith(':'+name))?.[1];}
function inventory(tags) {
  const groups=new Map();
  for(const [key,val] of Object.entries(tags)) {
    const split=key.indexOf(':'); if(split<0)continue;
    const group=key.slice(0,split),tag=key.slice(split+1);
    let id,label,kind='private';
    if(group==='GPS'){id='GPS:all';label='GPS location';}
    else if(group.startsWith('XMP')){id='XMP:all';label='XMP descriptions, editing & AI tags';}
    else if(group==='IPTC'){id='IPTC:all';label='IPTC captions & author details';}
    else if(/^(IFD\d+|ExifIFD)$/.test(group) && SAFE_EXIF.has(tag)){id=key;label=tag.replace(/([a-z])([A-Z])/g,'$1 $2');}
    else if(group.startsWith('ICC')){id='ICC_Profile:all';label='ICC color profile';kind='appearance';}
    else continue;
    if(!groups.has(id))groups.set(id,{id,label,type:id,kind,removable:true,selected:kind==='private',entries:[]});
    groups.get(id).entries.push([key,val]);
  }
  return [...groups.values()].map(({entries,...b})=>({...b,...(b.id==='XMP:all' && /c2pa:|c2pa\.org|contentauthenticity\.org/i.test(JSON.stringify(entries))?{kind:'provenance',selected:false}:{}),detail:`${entries.length} ${entries.length===1?'field':'fields'}`,value:entries.map(([k,v])=>`${k}: ${typeof v==='object'?JSON.stringify(v):v}`).join('\n'),keys:entries.map(([k])=>k)}));
}
function protectedTags(tags, found) {
  const editable=new Set(found.flatMap(b=>b.keys));
  return Object.fromEntries(Object.entries(tags).filter(([k])=>!editable.has(k) && !/^(SourceFile$|System:|ExifTool:|Composite:)/.test(k) && !/(Offsets?|Start|ByteCounts?|Length|Padding)$/.test(k) && !/^File:.*ByteOrder$/.test(k) && k!=='QuickTime:MediaDataSize'));
}
export async function inspect(file, engineFetch=defaultFetch) {
  // Never pass user filenames as ExifTool paths or switches.
  const safe={name:'photo.'+(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,''),data:file.data};
  const tags=await read(safe,engineFetch),format=tags['File:FileType'];
  if(!FORMATS.has(format))throw new Error('Supported extended formats: HEIC, HEIF, AVIF, TIFF, DNG, CR2, NEF and ARW.');
  const tiffHash=await tiffImageHash(new Uint8Array(safe.data));
  const hash=tiffHash || tags['File:ImageDataHash'];
  if(!hash || hash==='d41d8cd98f00b204e9800998ecf8427e')throw new Error('The image data in this file could not be verified. No cleaned copy can be made.');
  const found=inventory(tags), protectedData=protectedTags(tags,found);
  const sizes=Object.entries(tags).filter(([k,v])=>/:(ExifImageWidth|ImageWidth)$/.test(k) && Number(v)>0).map(([k,w])=>({width:Number(w),height:Number(tags[k.replace(/Width$/,'Height')])})).filter(s=>s.height>0).sort((a,b)=>b.width*b.height-a.width*a.height);
  const dimensions=RAW.has(format)||format==='TIFF'?sizes[0]:null;
  const report={format,tier:RAW.has(format)?'pro':'free',width:dimensions?.width||value(tags,'ImageWidth'),height:dimensions?.height||value(tags,'ImageHeight'),mime:tags['File:MIMEType'],found,
    structure:[{type:'Encoded image data and required rendering settings',detail:'Preserved'}],
    decoded:{details:tags,warnings:[RAW.has(format)?'RAW cleaning removes the selected standard metadata. Camera maker notes, previews and rendering settings are kept and may contain other identifying details.':'Only the listed fields can be removed. Other container and rendering information is kept.']}};
  return {report,async clean(selected) {
    if(!selected.length)return new Uint8Array(safe.data);
    const chosen=found.filter(b=>selected.includes(b.id));
    if(chosen.length!==new Set(selected).size)throw new Error('Invalid metadata selection. Scan the photo again.');
    const output=new Uint8Array(checked(await writeMetadata(safe,Object.fromEntries(chosen.map(b=>[b.id,''])),{fetch:engineFetch,args:['-api','NoWarning=^Not decoding some large array\\(s\\)\\.',...(tags['IFD0:YCbCrPositioning']!==undefined?['-tagsFromFile','@','-IFD0:YCbCrPositioning']:[])]})));
    const after=await read({name:safe.name,data:output},engineFetch);
    if(after['File:FileType']!==format || (tiffHash?await tiffImageHash(output):after['File:ImageDataHash'])!==hash)throw new Error('Image verification failed. No file was downloaded.');
    const remaining=inventory(after);
    if(remaining.some(b=>selected.includes(b.id)))throw new Error('Some selected metadata could not be removed. No file was downloaded.');
    for(const b of found.filter(b=>!selected.includes(b.id)))for(const key of b.keys)
      if(JSON.stringify(after[key])!==JSON.stringify(tags[key]))throw new Error('A field you chose to keep changed. No file was downloaded.');
    for(const [key,val] of Object.entries(protectedData))
      if(JSON.stringify(after[key])!==JSON.stringify(val))throw new Error(`A required image property (${key}) changed. No file was downloaded.`);
    return output;
  }};
}
