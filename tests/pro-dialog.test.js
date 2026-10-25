const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

const PRODUCT = 'be456dd9-4508-4b3a-a517-60fae3c9747b';
const CHECKOUT = `/checkout?products=${PRODUCT}`;

function links(html) {
  return [...html.matchAll(/<a\b[^>]*>/gi)].map(match => match[0]);
}

function page(file) {
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'), {runScripts: 'outside-only', url: 'https://getclearframe.app/'});
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.scrollTo = () => {};
  return {dom, w};
}

test('upgrade dialog markup is present and the no-JS link still goes to checkout', () => {
  const index = fs.readFileSync('index.html', 'utf8');
  const account = fs.readFileSync('account.html', 'utf8');
  const signin = fs.readFileSync('signin.html', 'utf8');
  for (const html of [index, account, signin]) {
    assert.match(html, /id="proDialog"[^>]*role="dialog"/);
    assert.match(html, /aria-modal="true"/);
    assert.match(html, /aria-labelledby="proTitle"/);
    assert.match(html, /aria-describedby="proDesc"/);
    assert.match(html, /id="proBackdrop"[^>]*hidden/);
    assert.match(html, /id="proClose"/);
    assert.match(html, /src="pro-dialog\.js"/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
    assert.doesNotMatch(html, /<style[\s>]/i);
  }
  const opener = links(index).find(tag => tag.includes('data-pro-dialog'));
  assert.match(index, /class="upgrade-banner"/);
  assert.doesNotMatch(index.match(/<nav class="top-links"[^>]*>[\s\S]*?<\/nav>/)[0], /upgrade-link|data-pro-dialog/);
  assert.match(opener, new RegExp(`href="${CHECKOUT.replace('?', '\\?')}"`));
  assert.match(opener, /rel="nofollow"/);
  assert.match(opener, /aria-haspopup="dialog"/);
  assert.doesNotMatch(opener, /\bonclick=/);
  assert.equal(links(signin).some(tag => tag.includes('data-pro-dialog')), true);
  assert.equal(links(account).some(tag => tag.includes('upgrade-link')), false);
  assert.match(account, />Manage subscription</);
  assert.doesNotMatch(account, />Receipts</);
  assert.match(fs.readFileSync('account-loader.js', 'utf8'), /Manage subscription could not be opened/);
  assert.doesNotMatch(fs.readFileSync('account-loader.js', 'utf8'), /receipt/i);
  assert.match(fs.readFileSync('server-lib/http.js', 'utf8'), /ClearFrame Pro subscription/);
  assert.doesNotMatch(fs.readFileSync('server-lib/http.js', 'utf8'), /purchase/);
  assert.doesNotMatch(fs.readFileSync('pro-dialog.js', 'utf8'), /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(fs.readFileSync('analytics.js', 'utf8'), /launch9|discount_shown/);
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.pro-backdrop, \.pro-dialog \{ animation: none; \} \}/);

  const pages = ['index.html', 'how-privacy-works.html', 'privacy.html', 'terms.html', 'contact.html', 'signin.html', 'account.html'];
  for (const file of pages) {
    for (const tag of links(fs.readFileSync(file, 'utf8'))) {
      const href = (tag.match(/\bhref="([^"]+)"/) || [])[1] || '';
      if (href.startsWith('/checkout')) assert.match(tag, /\brel="nofollow"/, file);
    }
  }
  const robots = fs.readFileSync('robots.txt', 'utf8');
  assert.match(robots, /Disallow: \/checkout\b/);
  assert.match(robots, /Disallow: \/api\/checkout\b/);
});

test('dialog traps focus, closes, and returns focus to the opener', () => {
  const {dom, w} = page('index.html');
  try {
    w.eval(fs.readFileSync('pro-dialog.js', 'utf8'));
    const opener = w.document.querySelector('[data-pro-dialog]');
    const backdrop = w.document.querySelector('#proBackdrop');
    const dialog = w.document.querySelector('#proDialog');
    const app = w.document.querySelector('#app');
    opener.focus();
    opener.click();
    assert.equal(backdrop.hidden, false);
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    assert.equal(w.document.activeElement, dialog);
    assert.equal(app.inert, true);
    assert.equal(app.getAttribute('aria-hidden'), 'true');
    assert.equal(w.document.body.style.overflow, 'hidden');
    assert.equal(w.document.documentElement.style.overflow, 'hidden');
    assert.equal(opener.getAttribute('href'), CHECKOUT);

    const tab = () => w.document.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Tab', bubbles: true, cancelable: true}));
    const shiftTab = () => w.document.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Tab', shiftKey: true, bubbles: true, cancelable: true}));
    tab();
    assert.equal(w.document.activeElement.id, 'proClose');
    shiftTab();
    assert.equal(w.document.activeElement, w.document.querySelector('.pro-foot a'));
    tab();
    assert.equal(w.document.activeElement.id, 'proClose');

    w.document.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    assert.equal(backdrop.hidden, true);
    assert.equal(app.inert, false);
    assert.equal(app.hasAttribute('aria-hidden'), false);
    assert.equal(w.document.body.style.overflow, '');
    assert.equal(w.document.activeElement, opener);

    opener.click();
    w.document.querySelector('#proClose').click();
    assert.equal(backdrop.hidden, true);
    assert.equal(w.document.activeElement, opener);

    opener.click();
    backdrop.dispatchEvent(new w.MouseEvent('mousedown', {bubbles: true}));
    assert.equal(backdrop.hidden, true);
    assert.equal(w.document.activeElement, opener);
  } finally {
    dom.window.close();
  }
});

test('quota prompt explains the reset and restores the normal Pro copy', () => {
  const {dom, w} = page('index.html');
  try {
    w.eval(fs.readFileSync('pro-dialog.js', 'utf8'));
    const original = w.document.querySelector('#proTitle').textContent;
    w.ClearFrameProDialog.open({source: 'quota', message: 'Your allowance resets at local midnight.'});
    assert.match(w.document.querySelector('#proTitle').textContent, /daily free allowance/);
    assert.equal(w.document.querySelector('#proDesc').textContent, 'Your allowance resets at local midnight.');
    w.document.querySelector('#proClose').click();
    w.ClearFrameProDialog.open({source: 'header'});
    assert.equal(w.document.querySelector('#proTitle').textContent, original);
  } finally { dom.window.close(); }
});

test('Get Pro on both public pages opens features before checkout', () => {
  for (const file of ['index.html', 'signin.html']) {
    const {dom, w} = page(file);
    try {
      w.eval(fs.readFileSync('pro-dialog.js', 'utf8'));
      w.document.querySelector('.upgrade-banner-action').click();
      assert.equal(w.document.querySelector('#proBackdrop').hidden, false, file);
      assert.equal(w.document.querySelectorAll('.pro-features li').length, 4, file);
      assert.match(w.document.querySelector('#proCheckout').getAttribute('href'), /^\/checkout\?products=/);
    } finally { dom.window.close(); }
  }
});

test('a RAW cleaning error keeps its message and opens the dialog', async () => {
  const {dom, w} = page('index.html');
  try {
    w.TextDecoder = TextDecoder;
    w.TextEncoder = TextEncoder;
    w.Blob = Blob;
    w.URL.createObjectURL = () => 'blob:test';
    w.URL.revokeObjectURL = () => {};
    w.eval(fs.readFileSync('pro-dialog.js', 'utf8'));
    w.eval(fs.readFileSync('app.js', 'utf8'));
    let read = 0;
    await w.handleFiles([{
      name: 'vacation.dng',
      type: '',
      size: 12,
      lastModified: 0,
      arrayBuffer: async () => { read += 1; return new ArrayBuffer(0); }
    }]);
    const errors = w.document.querySelector('#fileErrors');
    assert.equal(errors.hidden, false);
    assert.match(errors.textContent, /vacation\.dng: RAW cleaning is part of ClearFrame Pro\./);
    assert.equal(w.document.querySelector('#proBackdrop').hidden, false);
    assert.equal(w.document.querySelector('#proDialog').getAttribute('data-source'), 'raw_error');
    assert.equal(read, 0);
    w.document.dispatchEvent(new w.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true}));
    assert.equal(w.document.querySelector('#proBackdrop').hidden, true);
    assert.equal(w.document.activeElement.id, 'dropzone');
    assert.equal(errors.hidden, false);
  } finally {
    dom.window.close();
  }
});

test('the subscribed note is fixed text and stays hidden for any other query', () => {
  const welcome = 'Welcome. Check your email for a sign-in link if the address you used at checkout has an active ClearFrame Pro subscription.';
  const shown = new JSDOM(fs.readFileSync('signin.html', 'utf8'), {
    runScripts: 'outside-only',
    url: 'https://getclearframe.app/signin?subscribed=1&email=%3Cscript%3Ealert(1)%3C/script%3E&next=https://evil.example'
  });
  try {
    shown.window.eval(fs.readFileSync('signin.js', 'utf8'));
    const note = shown.window.document.querySelector('#subscribedNote');
    assert.equal(note.hidden, false);
    assert.equal(note.textContent, welcome);
    assert.equal(shown.window.document.body.textContent.includes('evil.example'), false);
    assert.equal(shown.window.document.body.textContent.includes('alert'), false);
  } finally {
    shown.window.close();
  }
  const hidden = new JSDOM(fs.readFileSync('signin.html', 'utf8'), {
    runScripts: 'outside-only',
    url: 'https://getclearframe.app/signin?subscribed=%3Cimg%20src%3Dx%3E'
  });
  try {
    hidden.window.eval(fs.readFileSync('signin.js', 'utf8'));
    assert.equal(hidden.window.document.querySelector('#subscribedNote').hidden, true);
    assert.equal(hidden.window.document.body.textContent.includes('<img'), false);
  } finally {
    hidden.window.close();
  }
});
