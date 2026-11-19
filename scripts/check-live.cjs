'use strict';
// Read-only checks. Never request checkout, auth APIs, analytics ingestion, or photos.
const ORIGIN = 'https://getclearframe.app';
const CHECKS = [
  ['/', 'text/html', 'id="scanner"'],
  ['/pricing', 'text/html', '$29/year'],
  ['/signin', 'text/html', 'id="signin"'],
  ['/batch-remove-photo-metadata', 'text/html', 'A repeatable pre-delivery workflow'],
  ['/app.js', 'javascript', 'function handleFiles'],
  ['/metadata.js', 'javascript', 'ClearFrameMetadata'],
  ['/daily-limit.js', 'javascript', 'ClearFrameDailyLimit'],
  ['/sample-photo.js', 'javascript', 'handleSample'],
  ['/share.js', 'javascript', 'shareClearFrame'],
  ['/signin.js', 'javascript', '/api/auth/request'],
  ['/styles.css', 'text/css', ':root'],
  ['/sitemap.xml', 'xml', '/batch-remove-photo-metadata']
];
async function checkLive({fetchImpl = fetch} = {}) {
  const results = [];
  // Sequential requests keep traffic bounded and reports ordered.
  for (const [path, type, marker] of CHECKS) {
    try {
      const response = await fetchImpl(ORIGIN + path, {redirect: 'error', signal: AbortSignal.timeout(15000)});
      const mime = response.headers.get('content-type') || '';
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!mime.includes(type)) throw new Error(`Unexpected content type (expected ${type})`);
      const body = await response.text();
      if (!body.includes(marker)) throw new Error('Expected page or asset content missing');
      if (path === '/signin' && !/name="robots" content="noindex"/.test(body)) throw new Error('Sign-in noindex missing');
      results.push({path, ok: true});
    } catch (error) {
      // Do not expose response bodies, tokens, or arbitrary exception messages.
      const message = /^(HTTP \d{3}|Unexpected content type|Expected page|Sign-in noindex)/.test(error.message || '') ? error.message : 'Request failed or timed out';
      results.push({path, ok: false, message});
    }
  }
  return results;
}
if (require.main === module) {
  checkLive().then(results => {
    for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.path}${result.message ? ': ' + result.message : ''}`);
    process.exitCode = results.every(result => result.ok) ? 0 : 1;
  }).catch(() => { console.error('Live check could not complete'); process.exitCode = 1; });
}
module.exports = {checkLive, CHECKS};
