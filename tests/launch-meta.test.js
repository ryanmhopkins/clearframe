const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const IMAGE = 'https://getclearframe.app/og-image.png';
const ALT = 'ClearFrame. Your photos. Only the details you choose. Scan and remove photo metadata in your browser. Photos stay on your device.';
const SHARE = [
  ['index.html', 'https://getclearframe.app/', 'ClearFrame — Photo metadata cleaner'],
  ['how-privacy-works.html', 'https://getclearframe.app/how-privacy-works', 'How your privacy works — ClearFrame'],
  ['privacy.html', 'https://getclearframe.app/privacy', 'Privacy policy — ClearFrame'],
  ['terms.html', 'https://getclearframe.app/terms', 'Terms of use — ClearFrame'],
  ['contact.html', 'https://getclearframe.app/contact', 'Contact — ClearFrame']
];

function meta(html, attr, key) {
  const tag = html.match(new RegExp(`<meta\\s+${attr}=["']${key}["']\\s+content=["']([^"']*)["']`, 'i'));
  assert.ok(tag, `${attr}=${key}`);
  return tag[1];
}

test('indexable pages have canonical URLs and a large share card', () => {
  for (const [file, url, title] of SHARE) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, new RegExp(`<link rel="canonical" href="${url.replace(/[.]/g, '\\.')}"\\s*/>`), file);
    assert.match(html, /<meta name="robots" content="index, follow"\s*\/>/, file);
    assert.equal(meta(html, 'property', 'og:type'), 'website', file);
    assert.equal(meta(html, 'property', 'og:title'), title, file);
    assert.equal(meta(html, 'property', 'og:url'), url, file);
    assert.equal(meta(html, 'property', 'og:description'), meta(html, 'name', 'description'), file);
    assert.equal(meta(html, 'property', 'og:image'), IMAGE, file);
    assert.equal(meta(html, 'property', 'og:image:width'), '1200', file);
    assert.equal(meta(html, 'property', 'og:image:height'), '630', file);
    assert.equal(meta(html, 'property', 'og:image:alt'), ALT, file);
    assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image', file);
    assert.equal(meta(html, 'name', 'twitter:title'), title, file);
    assert.equal(meta(html, 'name', 'twitter:image'), IMAGE, file);
    assert.equal(meta(html, 'name', 'twitter:image:alt'), ALT, file);
    const description = meta(html, 'name', 'description');
    const twitter = meta(html, 'name', 'twitter:description');
    assert.ok(description.startsWith(twitter), file);
    for (const text of [description, twitter, ALT]) {
      assert.doesNotMatch(text, /cookieless|no tracking|testimonial|users?\b|aggregateRating/i, file);
    }
    assert.equal((html.match(/<script type="application\/ld\+json">/g) || []).length, file === 'index.html' ? 1 : 0, file);
  }
});

test('sign-in and account stay noindex and out of the share card', () => {
  for (const file of ['signin.html', 'account.html']) {
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /<meta name="robots" content="noindex"\s*\/>/, file);
    assert.match(html, /<link rel="canonical" href="https:\/\/getclearframe\.app\/(?:signin|account)"\s*\/>/, file);
    assert.doesNotMatch(html, /og:image|summary_large_image|application\/ld\+json/, file);
  }
});

test('the home page JSON-LD names ClearFrame and the free and yearly Pro prices', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1);
  const data = JSON.parse(blocks[0][1]);
  assert.equal(data['@context'], 'https://schema.org');
  assert.equal(data['@type'], 'SoftwareApplication');
  assert.equal(data.name, 'ClearFrame');
  assert.equal(data.applicationCategory, 'MultimediaApplication');
  assert.equal(data.operatingSystem, 'Any');
  assert.equal(data.url, 'https://getclearframe.app/');
  assert.equal(data.description, meta(html, 'name', 'description'));
  assert.ok(Array.isArray(data.offers));
  assert.equal(data.offers.length, 2);
  assert.equal(data.offers[0].name, 'Free');
  assert.equal(Number(data.offers[0].price), 0);
  assert.equal(data.offers[0].priceCurrency, 'USD');
  assert.equal(data.offers[1].name, 'ClearFrame Pro');
  assert.equal(Number(data.offers[1].price), 29);
  assert.equal(data.offers[1].priceCurrency, 'USD');
  assert.equal(data.offers[1].priceSpecification['@type'], 'UnitPriceSpecification');
  assert.equal(Number(data.offers[1].priceSpecification.price), 29);
  assert.equal(data.offers[1].priceSpecification.priceCurrency, 'USD');
  assert.equal(data.offers[1].priceSpecification.billingDuration, 'P1Y');
  assert.equal(data.aggregateRating, undefined);
  assert.equal(data.review, undefined);
  assert.equal(data.reviews, undefined);
  assert.doesNotMatch(blocks[0][1], /aggregateRating|"review"|cookieless|no tracking/i);
  const headers = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
  const csp = headers.headers.flatMap(rule => rule.headers).find(header => header.key === 'Content-Security-Policy').value;
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(csp, /unsafe-inline/);
  assert.match(csp, /img-src 'self' blob: data:/);
});

test('sitemap lists only the indexable pages and robots points at it', () => {
  const xml = fs.readFileSync('sitemap.xml', 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(locs, SHARE.map(([, url]) => url));
  for (const loc of locs) {
    assert.match(loc, /^https:\/\/getclearframe\.app\//);
    assert.doesNotMatch(loc, /[?#]/);
  }
  assert.doesNotMatch(xml, /signin|account|checkout|\/api\//);
  const robots = fs.readFileSync('robots.txt', 'utf8');
  assert.match(robots, /^Sitemap: https:\/\/getclearframe\.app\/sitemap\.xml$/m);
  assert.match(robots, /^Disallow: \/checkout$/m);
  assert.match(robots, /^Disallow: \/api\/checkout$/m);
});

test('the share image is a 1200 by 630 PNG under 300KB', () => {
  const buf = fs.readFileSync('og-image.png');
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(buf.readUInt32BE(16), 1200);
  assert.equal(buf.readUInt32BE(20), 630);
  assert.ok(buf.length < 300 * 1024, buf.length);
  assert.equal(fs.existsSync('tools/og-image.html'), true);
  assert.match(fs.readFileSync('tools/og-image.html', 'utf8'), /name="robots" content="noindex"/);
});
