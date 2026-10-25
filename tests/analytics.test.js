const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const analytics=require('../analytics.js');

const SDK=fs.readFileSync('vendor/posthog/posthog-js-1.438.21.no-external.js','utf8');
const CLIENT=fs.readFileSync('analytics.js','utf8');
const FILE_VALUE=/\.(?:jpe?g|png|gif|webp|hei[cf]|avif|tiff?|dng|cr2|nef|arw|raw|rw2|orf|raf|bmp|svg)\b/i;
const EXIF_KEYS=['Make','Model','LensModel','DateTimeOriginal','ExposureTime','FNumber','ISO','GPSLatitude','GPSLongitude','Artist','Copyright','Software','Orientation','UserComment','ImageUniqueID','BodySerialNumber','Exif'];
const COMMON=['token','distinct_id','$cookieless_mode','$process_person_profile','$session_id','$window_id','$lib','$lib_version','$raw_user_agent','project','app_version','environment','$current_url','$pathname','$host','$referring_domain','utm_source','utm_medium','utm_campaign'];
const PROBES=new Set(['__mplssupport__','__support__','test','__cf_ls_probe__']);

function allowedKeys(name){
  const keys=new Set(COMMON);
  if(name==='$pageview') keys.add('path');
  for(const key of Object.keys(analytics.EVENTS[name]||{})) keys.add(key);
  if(name!=='$pageview') keys.delete('path');
  return keys;
}

function baseProps(extra){
  return {token:analytics.POSTHOG_KEY,distinct_id:'$posthog_cookieless',$cookieless_mode:true,project:'clearframe',app_version:'1.1.0',environment:'development',...extra};
}

test('sanitizer keeps only allowlisted events and coarse values',()=>{
  const page=analytics.sanitizeEvent({
    event:'$pageview',
    properties:baseProps({
      $current_url:'https://getclearframe.app/signin?token=magictokenvalue&utm_source=Newsletter&utm_medium=email&utm_campaign=launch_9#photo.jpg',
      $pathname:'/signin',
      $host:'getclearframe.app',
      $referrer:'https://evil.example/path?file=vacation.jpg',
      $referring_domain:'Evil.Example',
      utm_source:'Newsletter',
      utm_medium:'email',
      utm_campaign:'launch_9',
      path:'/photos/vacation.jpg',
      $set:{email:'person@example.com'},
      $set_once:{name:'Pat'},
      file:'vacation.jpg',
      GPSLatitude:'51.5'
    }),
    $set:{email:'person@example.com'}
  },{optedOut:false,dnt:false});
  assert.equal(page.event,'$pageview');
  assert.equal(page.$set,undefined);
  assert.equal(page.properties.$set,undefined);
  assert.equal(page.properties.$set_once,undefined);
  assert.equal(page.properties.$referrer,undefined);
  assert.equal(page.properties.path,'/signin');
  assert.equal(page.properties.$pathname,'/signin');
  assert.equal(page.properties.$current_url,'https://getclearframe.app/signin');
  assert.equal(page.properties.$referring_domain,'evil.example');
  assert.equal(page.properties.utm_source,undefined);
  assert.equal(page.properties.utm_medium,'email');
  assert.equal(page.properties.utm_campaign,'launch_9');
  assert.equal(page.properties.file,undefined);
  assert.equal(page.properties.GPSLatitude,undefined);
  assert.equal(analytics.sanitizeEvent({event:'file_uploaded',properties:baseProps()},{optedOut:false,dnt:false}),null);
  assert.equal(analytics.sanitizeEvent({event:'$set',properties:baseProps({$set:{email:'a@b.co'}})},{optedOut:false,dnt:false}),null);
  assert.equal(analytics.sanitizeEvent({event:'clean_completed',properties:baseProps({file_count_bucket:'1'})},{optedOut:true,dnt:false}),null);
  assert.equal(analytics.sanitizeEvent({event:'clean_completed',properties:baseProps({file_count_bucket:'1'})},{optedOut:false,dnt:true}),null);
  const clean=analytics.sanitizeEvent({event:'clean_completed',properties:baseProps({
    file_count_bucket:'2-5',format_group:'jpeg',mode:'batch',tier:'free',preset_used:'false',
    file_count_bucket_note:'x'.repeat(40),note:'person@example.com'
  })},{optedOut:false,dnt:false});
  assert.equal(clean.properties.file_count_bucket,'2-5');
  assert.equal(clean.properties.mode,'batch');
  assert.equal(clean.properties.note,undefined);
  const invalidMode=analytics.sanitizeEvent({event:'clean_completed',properties:baseProps({
    file_count_bucket:'1',mode:'not-a-mode'
  })},{optedOut:false,dnt:false});
  assert.equal(invalidMode.properties.mode,undefined);
  assert.equal(invalidMode.properties.file_count_bucket,'1');
  const leaked=analytics.sanitizeEvent({event:'$pageview',properties:baseProps({
    $current_url:'https://user:secret@getclearframe.app/photos/vacation.HEIC?x=1#hash',
    $pathname:'/photos/vacation.HEIC'
  })},{optedOut:false,dnt:false});
  assert.equal(leaked.properties.path,'other');
  assert.equal(leaked.properties.$current_url,'https://getclearframe.app/');
  assert.doesNotMatch(JSON.stringify(leaked),/vacation|secret|@|\.HEIC|\?/);
  assert.equal(analytics.coarsePath('/account.html'),'other');
  assert.equal(analytics.coarsePath('/privacy.html'),'/privacy');
  assert.equal(analytics.fileCountBucket(1),'1');
  assert.equal(analytics.fileCountBucket(5),'2-5');
  assert.equal(analytics.fileCountBucket(6),'6-20');
  assert.equal(analytics.fileCountBucket(21),'21+');
  assert.equal(analytics.formatGroup(['HEIF']),'heic');
  assert.equal(analytics.formatGroup(['DNG','CR2']),'raw');
  assert.equal(analytics.formatGroup(['JPEG','PNG']),'mixed');
  assert.equal(analytics.coarsePath('/pro'),'other');
  assert.equal(analytics.EVENTS.$pageview.path.includes('/pro'),false);
});

test('pro_dialog_opened keeps source header or raw_error and drops anything else',()=>{
  const state={optedOut:false,dnt:false};
  for(const source of ['header','raw_error']){
    const kept=analytics.sanitizeEvent({event:'pro_dialog_opened',properties:baseProps({
      source,email:'person@example.com',discount_shown:'launch9',file:'vacation.jpg',note:'x'
    })},state);
    assert.equal(kept.event,'pro_dialog_opened');
    assert.equal(kept.properties.source,source);
    assert.equal(kept.properties.project,'clearframe');
    assert.equal(kept.properties.email,undefined);
    assert.equal(kept.properties.discount_shown,undefined);
    assert.equal(kept.properties.file,undefined);
    assert.equal(kept.properties.note,undefined);
    const keys=allowedKeys('pro_dialog_opened');
    for(const key of Object.keys(kept.properties)) assert.ok(keys.has(key),key);
  }
  const bad=analytics.sanitizeEvent({event:'pro_dialog_opened',properties:baseProps({source:'pricing',placement:'header',email:'person@example.com'})},state);
  assert.equal(bad.properties.source,undefined);
  assert.equal(bad.properties.placement,undefined);
  assert.equal(bad.properties.email,undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(bad.properties,'source'),false);
  assert.equal(analytics.EVENTS.pro_dialog_opened.source.join(','),'header,raw_error');
});

test('person profiles stay off, ids must be UUIDs, and unknown events are dropped',()=>{
  const kept=analytics.sanitizeEvent({event:'$pageview',properties:baseProps({
    $process_person_profile:false,
    $session_id:'01a17127-a2bf-7006-a0a8-064f41bb6ab0',
    $window_id:'01A17127-A2BF-7006-A0A8-064F41BB6AB1',
    $lib:'web',
    $lib_version:'1.438.21'
  })},{optedOut:false,dnt:false});
  assert.equal(kept.properties.$process_person_profile,false);
  assert.equal(kept.properties.$session_id,'01a17127-a2bf-7006-a0a8-064f41bb6ab0');
  assert.equal(kept.properties.$window_id,'01A17127-A2BF-7006-A0A8-064F41BB6AB1');
  assert.equal(kept.properties.$lib,'web');
  assert.equal(kept.properties.$lib_version,'1.438.21');
  for(const value of [true,'false',0,1,null,'no']){
    const dropped=analytics.sanitizeEvent({event:'$pageview',properties:baseProps({$process_person_profile:value})},{optedOut:false,dnt:false});
    assert.equal(Object.prototype.hasOwnProperty.call(dropped.properties,'$process_person_profile'),false,String(value));
  }
  const bad=analytics.sanitizeEvent({event:'$pageview',properties:baseProps({
    $session_id:'vacation.jpg',
    $window_id:'person@example.com',
    $lib:'web-sdk',
    $lib_version:'1.438.21-person@example.com'
  })},{optedOut:false,dnt:false});
  assert.equal(bad.properties.$session_id,undefined);
  assert.equal(bad.properties.$window_id,undefined);
  assert.equal(bad.properties.$lib,undefined);
  assert.equal(bad.properties.$lib_version,undefined);
  assert.equal(analytics.sanitizeEvent({event:'not_a_real_event',properties:baseProps({$process_person_profile:false,$session_id:'01a17127-a2bf-7006-a0a8-064f41bb6ab0'})},{optedOut:false,dnt:false}),null);
  assert.equal(analytics.sanitizeEvent({event:'$set',properties:baseProps({$process_person_profile:false})},{optedOut:false,dnt:false}),null);
});

test('cookieless hash keeps a bounded user agent and drops every other extra property',()=>{
  const ua='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
  const state={optedOut:false,dnt:false};
  const kept=analytics.sanitizeEvent({event:'$pageview',properties:baseProps({
    $current_url:'https://getclearframe.app/privacy',
    $pathname:'/privacy',
    $host:'getclearframe.app',
    $raw_user_agent:ua,
    $timezone:'America/New_York',
    $timezone_offset:-240,
    $lib:'web',
    $lib_version:'1.438.21',
    $session_id:'01a17127-a2bf-7006-a0a8-064f41bb6ab0',
    $window_id:'01a17127-a2bf-7006-a0a8-064f41bb6ab1',
    $device_id:'01a17127-a2bf-7006-a0a8-064f41bb6ab2',
    $process_person_profile:false,
    $browser:'Chrome',
    $browser_version:'131',
    $os:'Windows',
    $device_type:'Desktop',
    $screen_height:1080,
    $screen_width:1920,
    $viewport_height:900,
    $viewport_width:1400,
    $ip:'203.0.113.8',
    $insert_id:'abc123xyz',
    $time:1792901133.831,
    $pageview_id:'01a17127-a2bf-7006-a0a8-064f41bb6ab3',
    title:'Privacy policy',
    email:'person@example.com'
  })},state);
  assert.equal(kept.event,'$pageview');
  assert.equal(kept.properties.$raw_user_agent,ua);
  assert.equal(kept.properties.$host,'getclearframe.app');
  assert.equal(kept.properties.$pathname,'/privacy');
  assert.equal(kept.properties.$current_url,'https://getclearframe.app/privacy');
  assert.equal(kept.properties.$lib,'web');
  assert.equal(kept.properties.$lib_version,'1.438.21');
  assert.equal(kept.properties.$session_id,'01a17127-a2bf-7006-a0a8-064f41bb6ab0');
  assert.equal(kept.properties.$window_id,'01a17127-a2bf-7006-a0a8-064f41bb6ab1');
  assert.equal(kept.properties.$process_person_profile,false);
  for(const key of ['$timezone','$timezone_offset','$device_id','$browser','$browser_version','$os','$device_type','$screen_height','$screen_width','$viewport_height','$viewport_width','$ip','$insert_id','$time','$pageview_id','title','email']){
    assert.equal(Object.prototype.hasOwnProperty.call(kept.properties,key),false,key);
  }
  const atLimit='Mozilla/5.0 '+ 'A'.repeat(500);
  assert.equal(atLimit.length,512);
  const boundary=analytics.sanitizeEvent({event:'$pageview',properties:baseProps({$raw_user_agent:atLimit,$current_url:'https://www.getclearframe.app/'})},state);
  assert.equal(boundary.properties.$raw_user_agent,atLimit);
  assert.equal(boundary.properties.$host,'www.getclearframe.app');
  const tooLong=atLimit+'B';
  const over=analytics.sanitizeEvent({event:'$pageview',properties:baseProps({$raw_user_agent:tooLong,$current_url:'https://getclearframe.app/'})},state);
  assert.equal(over.properties.$raw_user_agent,undefined);
  assert.equal(over.event,'$pageview');
  for(const bad of [
    'Mozilla/5.0 (person@example.com)',
    'Mozilla/5.0 https://example.com/track',
    'Mozilla/5.0 www.example.com',
    'Mozilla/5.0 (vacation.jpg)',
    'Mozilla/5.0\nChrome',
    'Mozilla/5.0 café',
    'Mozilla/5.0 ?session=1',
    131,
    ''
  ]){
    const rejected=analytics.sanitizeEvent({event:'$pageview',properties:baseProps({$raw_user_agent:bad,$current_url:'https://getclearframe.app/'})},state);
    assert.equal(rejected.properties.$raw_user_agent,undefined,String(bad));
  }
  const foreign=analytics.sanitizeEvent({event:'$pageview',properties:baseProps({
    $current_url:'https://evil.example/privacy',
    $host:'evil.example',
    $raw_user_agent:ua
  })},state);
  assert.equal(foreign.properties.$host,undefined);
  assert.equal(foreign.properties.$raw_user_agent,ua);
  assert.equal(analytics.sanitizeEvent({event:'$identify',properties:baseProps({$raw_user_agent:ua,$process_person_profile:false})},state),null);
  assert.equal(analytics.sanitizeEvent({event:'file_uploaded',properties:baseProps({$raw_user_agent:ua})},state),null);
});

function boot(options={}){
  const dom=new JSDOM(options.html||`<!doctype html><html><head><title>Privacy</title></head><body>
    <header><a class="upgrade-link" href="/checkout?products=be456dd9-4508-4b3a-a517-60fae3c9747b">Upgrade to Pro</a></header>
    <button id="analyticsToggle" type="button">Turn off analytics</button>
  </body></html>`,{
    url:options.url||'https://getclearframe.app/privacy?token=magictokenvalue&file=vacation.jpg&utm_source=Newsletter&utm_medium=email&utm_campaign=launch_9#photo.png',
    runScripts:'dangerously',
    pretendToBeVisual:true
  });
  const w=dom.window;
  w.__CF_ANALYTICS_HOLD__=true;
  const requests=[];
  w.fetch=async(input,init={})=>{
    requests.push({url:String(input&&input.url||input),method:(init.method||'GET').toUpperCase(),body:init.body});
    return {ok:true,status:200,text:async()=>'',json:async()=>({})};
  };
  const XHR=w.XMLHttpRequest;
  const open=XHR.prototype.open,send=XHR.prototype.send;
  XHR.prototype.open=function(method,url){this.__method=method;this.__url=url;return open.apply(this,arguments);};
  XHR.prototype.send=function(body){requests.push({url:String(this.__url),method:String(this.__method||'GET').toUpperCase(),body,via:'xhr'});};
  w.navigator.sendBeacon=(url,body)=>{requests.push({url:String(url),method:'BEACON',body,win:w});return true;};
  const writes=[];
  const setItem=w.Storage.prototype.setItem;
  w.Storage.prototype.setItem=function(key,value){writes.push(key);return setItem.call(this,key,value);};
  let cookieWrites=0;
  const jar=[];
  Object.defineProperty(w.document,'cookie',{configurable:true,get(){return jar.map(item=>item.split(';')[0]).join('; ');},set(value){cookieWrites+=1;jar.push(String(value));}});
  if(options.dnt) Object.defineProperty(w.navigator,'doNotTrack',{configurable:true,get(){return '1';}});
  if(options.storageThrows){
    w.Storage.prototype.setItem=function(){writes.push('throw');throw new Error('blocked');};
    w.Storage.prototype.getItem=function(){return null;};
    w.Storage.prototype.removeItem=function(){};
  }
  w.eval(SDK);
  w.eval(CLIENT);
  return {dom,w,requests,writes,cookieWrites:()=>cookieWrites};
}

async function readBody(body,win){
  if(body==null) return '';
  if(typeof body==='string') return body;
  if(typeof body.text==='function') return body.text();
  if(typeof body.arrayBuffer==='function') return Buffer.from(await body.arrayBuffer()).toString('utf8');
  if(body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  const Reader=win&&win.FileReader;
  if(Reader&&typeof body.size==='number'){
    return await new Promise((resolve,reject)=>{
      const reader=new Reader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(reader.error);
      reader.readAsText(body);
    });
  }
  return String(body);
}

function decodePayload(text){
  const trimmed=String(text||'').trim();
  if(!trimmed||trimmed.startsWith('{')||trimmed.startsWith('[')) return trimmed;
  const match=trimmed.match(/(?:^|&)data=([^&]*)/);
  if(!match) return trimmed;
  let raw=match[1];
  try { raw=decodeURIComponent(raw); } catch { /* keep the raw field */ }
  raw=raw.replace(/-/g,'+').replace(/_/g,'/');
  try { return Buffer.from(raw,'base64').toString('utf8'); }
  catch { return trimmed; }
}

async function eventsOf(requests){
  const events=[];
  for(const request of requests){
    request.text=decodePayload(await readBody(request.body,request.win));
    if(!request.text) continue;
    try{
      const json=JSON.parse(request.text);
      for(const event of json.batch||[json]) events.push(event);
    }catch{ /* a non-event request still has its URL checked by the caller */ }
  }
  return events;
}

function assertClean(events,requests){
  const blob=JSON.stringify({events,urls:requests.map(request=>request.url+'\n'+(request.text||''))});
  assert.doesNotMatch(blob,FILE_VALUE);
  assert.doesNotMatch(blob,/magictokenvalue|person@example\.com|vacation/i);
  assert.doesNotMatch(blob,/"\$set"|\$set_once/);
  for(const event of events){
    assert.ok(analytics.EVENTS[event.event],event.event);
    const keys=allowedKeys(event.event);
    for(const key of Object.keys(event.properties||{})) assert.ok(keys.has(key),`${event.event} ${key}`);
    const props=event.properties||{};
    if(props.distinct_id) assert.equal(props.distinct_id,'$posthog_cookieless');
    if(props.token) assert.equal(props.token,analytics.POSTHOG_KEY);
    for(const [key,value] of Object.entries(props)){
      if(key==='$process_person_profile') assert.equal(value,false);
      if(typeof value!=='string') continue;
      assert.equal(value.includes('@'),false,key);
      assert.equal(value.includes('?'),false,key);
      assert.equal(value.includes('#'),false,key);
      if(key==='$session_id'||key==='$window_id'){
        assert.match(value,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        continue;
      }
      if(key==='$raw_user_agent'){
        assert.match(value,/^[\x20-\x7E]{1,512}$/);
        assert.equal(value.includes('://'),false);
        assert.doesNotMatch(value,/www\./i);
        continue;
      }
      if(key!=='token'&&key!=='$current_url') assert.ok(value.length<=32,key);
    }
    for(const name of EXIF_KEYS){
      assert.equal(Object.prototype.hasOwnProperty.call(props,name),false,name);
      assert.equal(Object.values(props).includes(name),false,name);
    }
  }
}

async function until(fn,ms=1500){
  const start=Date.now();
  while(Date.now()-start<ms){
    if(await fn()) return true;
    await new Promise(resolve=>setTimeout(resolve,25));
  }
  return false;
}

test('shipped client pins the SDK, blocks third-party script hosts, and wires events without file names',()=>{
  const src=fs.readFileSync('analytics.js','utf8');
  assert.equal(analytics.DEFAULTS,'2026-08-30');
  assert.equal(analytics.APP_VERSION,'1.1.0');
  assert.equal(analytics.UI_HOST,'https://us.posthog.com');
  assert.match(src,/cookieless_mode:\s*'always'/);
  assert.match(src,/person_profiles:\s*'never'/);
  assert.match(src,/advanced_disable_flags:\s*true/);
  assert.match(src,/opt_out_capturing/);
  assert.match(src,/opt_in_capturing/);
  assert.doesNotMatch(src,/\.identify\s*\(/);
  assert.doesNotMatch(src,/\.alias\s*\(/);
  assert.doesNotMatch(src,/fonts\.googleapis|cdn\.jsdelivr|googletagmanager|eu\.i\.posthog|eu\.posthog/);
  assert.doesNotMatch(fs.readFileSync('contact.html','utf8'),/analytics\.js|posthog/);
  for(const file of ['index.html','privacy.html','how-privacy-works.html','terms.html','signin.html','account.html']){
    const html=fs.readFileSync(file,'utf8');
    assert.match(html,/vendor\/posthog\/posthog-js-1\.438\.21\.no-external\.js/);
    assert.match(html,/src="analytics\.js"/);
    for(const tag of html.match(/<script\b[^>]*>/gi)||[]){
      const href=(tag.match(/\bsrc=["']([^"']+)["']/)||[])[1];
      if(href) assert.doesNotMatch(href,/^https?:/i,file);
    }
  }
  assert.match(fs.readFileSync('privacy.html','utf8'),/id="analyticsToggle"/);
  assert.match(fs.readFileSync('privacy.html','utf8'),/>Turn off analytics</);
  const functions=[];
  (function walk(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=require('node:path').join(dir,entry.name);
      if(entry.isDirectory()) walk(full);
      else if(!entry.name.startsWith('_')) functions.push(full);
    }
  })('api');
  assert.equal(functions.length,8);
});

test('payloads stay on the allowlist, and a same-origin host never leaves the page origin',async()=>{
  const {dom,w,requests,writes,cookieWrites}=boot();
  w.ClearFrameAnalytics.start({apiHost:'/cf-signal',disableCompression:true});
  assert.equal(w.posthog.config.cookieless_mode,'always');
  assert.equal(w.posthog.config.person_profiles,'never');
  assert.equal(w.posthog.config.autocapture,false);
  assert.equal(w.posthog.config.capture_pageleave,false);
  assert.equal(w.posthog.config.capture_dead_clicks,false);
  assert.equal(w.posthog.config.rageclick,false);
  assert.equal(w.posthog.config.capture_heatmaps,false);
  assert.equal(w.posthog.config.capture_performance,false);
  assert.equal(w.posthog.config.capture_exceptions,false);
  assert.equal(w.posthog.config.disable_session_recording,true);
  assert.equal(w.posthog.config.disable_surveys,true);
  assert.equal(w.posthog.config.advanced_disable_flags,true);
  assert.equal(w.posthog.config.respect_dnt,true);
  assert.equal(w.posthog.config.defaults,'2026-08-30');
  w.posthog.capture('clean_completed',{
    file_count_bucket:'1',format_group:'jpeg',mode:'single',tier:'free',preset_used:'false',
    file:'vacation.jpg',email:'person@example.com',GPSLatitude:'51.5',Make:'Canon',
    $set:{email:'person@example.com'},$set_once:{name:'Pat'},note:'x'.repeat(40)
  },{send_instantly:true});
  w.posthog.capture('not_a_real_event',{file:'secret.dng',email:'person@example.com'},{send_instantly:true});
  const saw=await until(async()=>{
    const parsed=await eventsOf(requests);
    return parsed.some(event=>event.event==='clean_completed')&&parsed.some(event=>event.event==='$pageview'&&event.properties&&event.properties.path==='/privacy');
  });
  assert.equal(saw,true);
  const events=await eventsOf(requests);
  assert.ok(events.some(event=>event.event==='clean_completed'));
  assert.equal(events.some(event=>event.event==='not_a_real_event'),false);
  assert.ok(events.some(event=>event.event==='$pageview'&&event.properties.path==='/privacy'));
  const page=events.find(event=>event.event==='$pageview');
  assert.equal(page.properties.$current_url,'https://getclearframe.app/privacy');
  assert.equal(page.properties.utm_medium,'email');
  assert.equal(page.properties.utm_campaign,'launch_9');
  assert.equal(page.properties.utm_source,undefined);
  assertClean(events,requests);
  for(const request of requests){
    const url=new URL(request.url,'https://getclearframe.app');
    assert.equal(url.origin,'https://getclearframe.app');
    assert.doesNotMatch(url.href,/posthog\.com/);
    assert.equal(url.search,'');
    assert.equal(url.hash,'');
  }
  assert.equal(cookieWrites(),0);
  assert.equal(w.localStorage.length,0);
  assert.equal(w.sessionStorage.length,0);
  for(const key of writes) assert.ok(PROBES.has(key),key);
  dom.window.close();
});

test('direct ingest talks only to the US host',async()=>{
  const {dom,w,requests}=boot({url:'https://getclearframe.app/'});
  w.ClearFrameAnalytics.start({apiHost:'https://us.i.posthog.com',disableCompression:true});
  const saw=await until(()=>requests.length>0);
  assert.equal(saw,true);
  w.ClearFrameAnalytics.cleanCompleted({count:3,formats:['JPEG','HEIC'],mode:'batch',tier:'free',presetUsed:false});
  await until(()=>requests.some(request=>String(request.body||'').includes('clean_completed')));
  for(const request of requests){
    const url=new URL(request.url,'https://getclearframe.app');
    assert.equal(url.origin,'https://us.i.posthog.com');
  }
  const events=await eventsOf(requests);
  const clean=events.find(event=>event.event==='clean_completed');
  assert.equal(clean.properties.file_count_bucket,'2-5');
  assert.equal(clean.properties.format_group,'mixed');
  assert.equal(clean.properties.mode,'batch');
  assert.equal(clean.properties.preset_used,'false');
  assert.equal(clean.properties.project,'clearframe');
  assert.equal(clean.properties.app_version,'1.1.0');
  assertClean(events,requests);
  dom.window.close();
});

test('opt-out stores only that choice and stops sends; Do Not Track sends nothing',async()=>{
  const opted=boot();
  opted.w.ClearFrameAnalytics.start({apiHost:'/cf-signal',disableCompression:true});
  await until(()=>opted.requests.length>0);
  let stable=opted.requests.length;
  for(let i=0;i<6;i++){
    await new Promise(resolve=>setTimeout(resolve,40));
    if(opted.requests.length===stable) break;
    stable=opted.requests.length;
  }
  const before=opted.requests.length;
  opted.w.document.querySelector('#analyticsToggle').click();
  assert.equal(opted.w.localStorage.getItem('cf_analytics_off'),'1');
  assert.equal(opted.w.localStorage.length,1);
  assert.equal(opted.w.sessionStorage.length,0);
  opted.w.ClearFrameAnalytics.cleanCompleted({count:1,formats:['PNG'],mode:'single',tier:'pro',presetUsed:true});
  opted.w.posthog.capture('$pageview',{},{send_instantly:true});
  await new Promise(resolve=>setTimeout(resolve,300));
  assert.equal(opted.requests.length,before);
  opted.w.document.querySelector('#analyticsToggle').click();
  assert.equal(opted.w.localStorage.getItem('cf_analytics_off'),null);
  assert.equal(opted.w.localStorage.length,0);
  const resumed=await until(()=>opted.requests.length>before);
  assert.equal(resumed,true);
  assert.equal(opted.cookieWrites(),0);
  opted.dom.window.close();

  const quiet=boot({dnt:true});
  quiet.w.ClearFrameAnalytics.start({apiHost:'https://us.i.posthog.com',disableCompression:true});
  quiet.w.ClearFrameAnalytics.scanCompleted({count:2,formats:['TIFF'],metadataFound:'some'});
  await new Promise(resolve=>setTimeout(resolve,400));
  assert.equal(quiet.requests.length,0);
  assert.equal(quiet.w.localStorage.length,0);
  assert.equal(quiet.cookieWrites(),0);
  quiet.dom.window.close();
});

test('checkout uses the beacon path and sign-in does not report a paid-or-sent guess',async()=>{
  const {dom,w,requests}=boot();
  w.ClearFrameAnalytics.start({apiHost:'https://us.i.posthog.com',disableCompression:true});
  w.document.addEventListener('click',event=>{
    const link=event.target&&event.target.closest&&event.target.closest('a.upgrade-link');
    if(link) event.preventDefault();
  },true);
  w.document.querySelector('.upgrade-link').click();
  const saw=await until(async()=>{
    const parsed=await eventsOf(requests);
    return parsed.some(event=>event.event==='checkout_started')&&requests.some(request=>request.method==='BEACON');
  });
  assert.equal(saw,true);
  const events=await eventsOf(requests);
  const checkout=events.find(event=>event.event==='checkout_started');
  assert.equal(checkout.properties.placement,'header');
  assert.equal(checkout.properties.discount_shown,undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(analytics.EVENTS.checkout_started,'discount_shown'),false);
  assert.equal(JSON.stringify(analytics.EVENTS).includes('launch9'),false);
  assert.equal(events.some(event=>event.event==='upgrade_click'),false);
  w.ClearFrameAnalytics.signinRequested('accepted');
  w.ClearFrameAnalytics.signinRequested('error');
  await until(()=>requests.some(request=>String(request.body||'').includes('pro_signin_requested')));
  const signins=(await eventsOf(requests)).filter(event=>event.event==='pro_signin_requested');
  assert.ok(signins.some(event=>event.properties.result==='error'));
  assert.equal(signins.some(event=>event.properties.result==='sent'||event.properties.result==='not_paid'),false);
  dom.window.close();
});

test('a blocked analytics store does not fall back to a cookie, and cleaning does not upload the photo',async()=>{
  const blocked=boot({storageThrows:true,url:'https://getclearframe.app/'});
  blocked.w.ClearFrameAnalytics.start({apiHost:'/cf-signal',disableCompression:true});
  await new Promise(resolve=>setTimeout(resolve,400));
  assert.equal(blocked.requests.length,0);
  assert.equal(blocked.cookieWrites(),0);
  blocked.dom.window.close();

  const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{runScripts:'outside-only',url:'https://getclearframe.app/'});
  const w=dom.window;
  w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.Blob=Blob;
  w.URL.createObjectURL=()=>'blob:test';w.URL.revokeObjectURL=()=>{};
  w.HTMLElement.prototype.scrollIntoView=()=>{};w.scrollTo=()=>{};
  const calls=[];
  w.ClearFrameAnalytics={
    cleanCompleted(info){calls.push(info);},
    scanCompleted(info){calls.push(info);}
  };
  let fetches=0;
  w.fetch=()=>{fetches+=1;throw new Error('network');};
  w.eval(fs.readFileSync('metadata.js','utf8'));
  w.eval(fs.readFileSync('motion.js','utf8'));
  w.eval(fs.readFileSync('app.js','utf8'));
  const jpeg=new Uint8Array([255,216,255,254,0,7,65,108,105,99,101,255,217]);
  const file={name:'vacation.jpg',type:'image/jpeg',size:jpeg.length,lastModified:0,arrayBuffer:async()=>jpeg.buffer};
  await w.handleFiles([file]);
  w.downloadBlob=()=>{};
  await w.clean();
  assert.equal(fetches,0);
  const blob=JSON.stringify(calls);
  assert.doesNotMatch(blob,/vacation|GPSLatitude|@|\.jpg/);
  assert.equal(calls.some(call=>call.count===1&&call.formats&&call.formats.includes('JPEG')&&call.mode==='single'&&call.tier==='free'&&call.presetUsed===false),true);
  dom.window.close();
});

test('the configured host is either a same-origin path or the single US ingest host',()=>{
  const host=analytics.API_HOST;
  if(host.startsWith('/')){
    assert.doesNotMatch(host,/analytics|posthog|ingest/i);
    return;
  }
  assert.equal(host,'https://us.i.posthog.com');
  const headers=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  const csp=headers.headers.flatMap(rule=>rule.headers).find(header=>header.key==='Content-Security-Policy').value;
  const connect=(csp.match(/connect-src[^;]*/)||[''])[0];
  assert.equal(connect,"connect-src 'self' https://us.i.posthog.com");
  assert.equal(connect.includes('*'),false);
});
