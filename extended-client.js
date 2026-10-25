(function(root){
  let worker,serial=0;const pending=new Map();
  function reset(){if(worker)worker.terminate();worker=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Photo processing stopped. Please add the photo again.'));}pending.clear();}
  function request(data){
    if(!worker){worker=new Worker(globalThis.ClearFrameProWorker||'metadata-worker.mjs',{type:'module'});worker.onerror=reset;}
    return new Promise((resolve,reject)=>{const id=++serial;const timer=setTimeout(reset,180000);pending.set(id,{resolve,reject,timer});worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.result);};worker.postMessage({id,...data});});
  }
  root.ClearFrameExtended={reset,async scan(file,bytes,photoId){const report=await request({op:'scan',name:file.name,bytes,photoId});report.clean=selected=>request({op:'clean',photoId,selected:[...selected]});return report;}};
})(globalThis);
