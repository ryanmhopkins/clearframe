const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');

test('Pro page shows membership navigation and the same FAQ as the public cleaner', () => {
  const account = new JSDOM(fs.readFileSync('account.html', 'utf8'));
  const publicPage = new JSDOM(fs.readFileSync('index.html', 'utf8'));
  try {
    const doc = account.window.document;
    assert.equal(doc.querySelector('.top-links a[href="signin.html"]'), null);
    assert.equal(doc.querySelector('.top-links a[href^="/checkout"]'), null);
    assert.ok(doc.querySelector('.top-links .member-badge'));
    assert.ok(doc.querySelector('#signOut'));
    assert.equal(doc.querySelector('.member-card'), null);
    assert.equal(doc.querySelectorAll('a[href="/api/auth/portal"]').length, 1);
    assert.deepEqual(
      [...doc.querySelectorAll('.faq summary')].map(item => item.textContent),
      [...publicPage.window.document.querySelectorAll('.faq summary')].map(item => item.textContent)
    );
  } finally {
    account.window.close();
    publicPage.window.close();
  }
});

test('signed-in visitors see Pro navigation on the public page', async () => {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {runScripts: 'outside-only', url: 'https://getclearframe.app/'});
  try {
    dom.window.fetch = async () => ({ok: true, json: async () => ({signedIn: true, pro: true})});
    dom.window.eval(fs.readFileSync('account-nav.js', 'utf8'));
    await new Promise(resolve => setTimeout(resolve, 0));
    const nav = dom.window.document.querySelector('.top-links');
    assert.equal(nav.querySelector('a[href="signin.html"]'), null);
    assert.equal(nav.querySelector('a[href^="/checkout"]'), null);
    assert.equal(nav.querySelector('.member-badge').textContent, 'Pro active');
    assert.equal(nav.querySelector('.account-link').getAttribute('href'), 'account.html');
  } finally {
    dom.window.close();
  }
});
