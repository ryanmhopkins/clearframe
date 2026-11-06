const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
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
    assert.equal(doc.querySelector('.hero .hero-kicker'), null);
    assert.equal(doc.querySelector('#help-title').textContent, 'FAQs');
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

test('verified Pro members open their workspace automatically from public pages', async () => {
  for (const session of [{signedIn: true, pro: true}, {signedIn: false}, {signedIn: true, pro: false}]) {
    const destinations = [];
    vm.runInNewContext(fs.readFileSync('account-nav.js', 'utf8'), {
      document: {body: {dataset: {}}},
      fetch: async () => ({ok: session.signedIn, json: async () => session}),
      location: {replace: destination => destinations.push(destination)}
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.deepEqual(destinations, session.pro ? ['account.html'] : []);
  }
});
