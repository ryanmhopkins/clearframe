import {inspect} from './extended-metadata.mjs';
// ExifTool shares its interpreter: serialize all requests, including different photos.
const photos=new Map();
let queue=Promise.resolve();
self.onmessage=({data})=>{
  queue=queue.then(async()=>{
    try{
      let result;
      if(data.op==='scan') {const entry=await inspect({name:data.name,data:new Uint8Array(data.bytes)});if(entry.report.tier==='pro')throw new Error('This format is part of ClearFrame Pro.');photos.set(data.photoId,entry);result=entry.report;}
      else if(data.op==='clean'){const entry=photos.get(data.photoId);if(!entry)throw new Error('Please add this photo again.');result=await entry.clean(data.selected);}
      else throw new Error('Unknown photo operation.');
      self.postMessage({id:data.id,result},result instanceof Uint8Array?[result.buffer]:[]);
    }catch(error){self.postMessage({id:data.id,error:error.message});}
  });
};
