const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const pages=['index.html','how-privacy-works.html','privacy.html','terms.html','contact.html','signin.html','account.html'];
const owner=/ryanmhopkins|rmhopkins|Ryan Hopkins|Created by Ryan|x\.com\/rm/i;
const codeFiles=['styles.css','fonts/fonts.css','motion.css','app.js','pro-dialog.js','motion.js','extended-client.js','metadata.js','metadata-worker.mjs','extended-metadata.mjs'];
const blocked=/fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr|cdnjs\.cloudflare|unpkg\.com|googletagmanager|google-analytics|plausible\.io/i;

test('pages and styles do not load third-party scripts, fonts, or connections',()=>{
  for(const file of codeFiles){
    assert.doesNotMatch(fs.readFileSync(file,'utf8'), blocked, file);
  }
  for(const file of pages){
    const text=fs.readFileSync(file,'utf8');
    const srcs=[...text.matchAll(/<(?:script|link)\b[^>]*>/gi)].map(m=>m[0]);
    for(const tag of srcs){
      if(/\brel=["']canonical["']/i.test(tag)) continue;
      const href=(tag.match(/\b(?:src|href)=["']([^"']+)["']/i)||[])[1];
      assert.ok(href, tag);
      assert.doesNotMatch(href,/^https?:/i, `${file} loads ${href}`);
    }
    assert.match(text,/how-privacy-works\.html/);
    assert.match(text,/privacy\.html/);
    assert.match(text,/terms\.html/);
    assert.match(text,/contact\.html/);
    assert.match(text,/rel="canonical" href="https:\/\/getclearframe\.app/);
    assert.doesNotMatch(text, owner, file);
  }
  assert.match(fs.readFileSync('index.html','utf8'),/vendor\/jszip\/jszip-3\.10\.1\.min\.js/);
  assert.doesNotMatch(fs.readFileSync('index.html','utf8'),/id="how-your-privacy-works"/);
  assert.match(fs.readFileSync('how-privacy-works.html','utf8'),/id="privacy-title"/);
  assert.match(fs.readFileSync('styles.css','utf8'),/@import url\('fonts\/fonts\.css'\)/);
  assert.equal(fs.existsSync('vendor/jszip/jszip-3.10.1.min.js'),true);
  assert.equal(fs.existsSync('vendor/jszip/LICENSE.markdown'),true);
  assert.equal(fs.existsSync('fonts/DM-Sans-OFL.txt'),true);
  assert.equal(fs.existsSync('fonts/IBM-Plex-OFL.txt'),true);
  const fontCss=fs.readFileSync('fonts/fonts.css','utf8');
  assert.match(fontCss,/url\("[^"]+\.woff2"\)/);
  assert.doesNotMatch(fontCss,/https?:/);
  const headers=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  const csp=headers.headers.flatMap(r=>r.headers).find(h=>h.key==='Content-Security-Policy').value;
  assert.match(csp,/connect-src 'self'/);
  assert.match(csp,/script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(csp,/worker-src 'self'/);
  assert.match(csp,/img-src 'self' blob: data:/);
  assert.match(csp,/frame-ancestors 'none'/);
  for(const key of ['X-Content-Type-Options','Referrer-Policy','Permissions-Policy','X-Frame-Options']){
    assert.ok(headers.headers.some(r=>r.headers.some(h=>h.key===key)), key);
  }
  const robots=fs.readFileSync('robots.txt','utf8');
  assert.match(robots,/Sitemap: https:\/\/getclearframe\.app\/sitemap\.xml/);
  assert.match(robots,/Disallow: \/checkout\b/);
  assert.match(robots,/Disallow: \/api\/checkout\b/);
  assert.match(fs.readFileSync('sitemap.xml','utf8'),/https:\/\/getclearframe\.app\/privacy/);
  assert.match(fs.readFileSync('sitemap.xml','utf8'),/https:\/\/getclearframe\.app\/how-privacy-works/);
  assert.doesNotMatch(fs.readFileSync('sitemap.xml','utf8'), owner);
  assert.doesNotMatch(fs.readFileSync('README.md','utf8'), owner);
  const contact=fs.readFileSync('contact.html','utf8');
  assert.match(contact,/mailto:support@getclearframe\.app/);
  assert.match(contact,/>support@getclearframe\.app</);
  assert.doesNotMatch(contact,/@gmail\.com/i);
  assert.doesNotMatch(contact,owner);
  assert.doesNotMatch(contact,/YOUR-DOMAIN-HERE|will not receive mail|placeholder/i);
  for(const file of ['index.html','how-privacy-works.html','privacy.html','terms.html','signin.html','account.html','README.md','sitemap.xml','robots.txt']){
    assert.doesNotMatch(fs.readFileSync(file,'utf8'), /@gmail\.com|rmhxai|YOUR-DOMAIN-HERE/i, file);
  }
  const freeBundle=['index.html','app.js','extended-client.js','metadata.js','metadata-worker.mjs','signin.js'];
  for(const file of freeBundle){
    assert.doesNotMatch(fs.readFileSync(file,'utf8'), /webkitdirectory|preset-bar|pro-worker/, file);
  }
  assert.doesNotMatch(fs.readFileSync('index.html','utf8'), /\/api\//);
  assert.match(fs.readFileSync('api/pro/files/_pro.js','utf8'), /webkitdirectory/);
  const functions=[];
  (function walk(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const full=require('node:path').join(dir,entry.name);
      if(entry.isDirectory()) walk(full);
      else if(!entry.name.startsWith('_')) functions.push(full);
    }
  })('api');
  assert.ok(functions.length<=12, functions.join('\n'));
  assert.equal(functions.length, 8);
  assert.equal(fs.existsSync('api/lib'), false);
});
