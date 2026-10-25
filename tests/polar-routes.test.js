const {test} = require('node:test');
const assert = require('node:assert/strict');
const checkout = require('../api/checkout');
const webhook = require('../api/webhook/polar');

const product = 'be456dd9-4508-4b3a-a517-60fae3c9747b';

function response() {
  return {statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(body) { this.body = body; }};
}

test('checkout accepts only the configured product and redirects to Polar', async () => {
  const previous = process.env.POLAR_PRODUCT_ID;
  const previousSite = process.env.SITE_URL;
  process.env.POLAR_PRODUCT_ID = product;
  process.env.SITE_URL = 'https://getclearframe.app/';
  try {
    const calls = [];
    const polar = {checkouts: {create: async value => { calls.push(value); return {url: 'https://polar.sh/checkout/example'}; }}};
    const bad = response();
    await checkout({method: 'GET', url: '/checkout?products=00000000-0000-4000-8000-000000000000', headers: {'x-forwarded-for': '203.0.113.10'}}, bad, {polar, now: 8_000_000_000});
    assert.equal(bad.statusCode, 400);
    assert.equal(calls.length, 0);
    const good = response();
    await checkout({method: 'GET', url: `/checkout?products=${product}`, headers: {'x-forwarded-for': '203.0.113.10'}}, good, {polar, now: 8_000_000_000});
    assert.equal(good.statusCode, 302);
    assert.equal(good.headers.location, 'https://polar.sh/checkout/example');
    assert.deepEqual(calls, [{products: [product], success_url: 'https://getclearframe.app/signin?subscribed=1'}]);

    delete process.env.SITE_URL;
    const bare = response();
    await checkout({method: 'GET', url: `/checkout?products=${product}`, headers: {'x-forwarded-for': '203.0.113.11'}}, bare, {polar, now: 8_000_000_000});
    assert.equal(bare.statusCode, 302);
    assert.deepEqual(calls[1], {products: [product]});

    process.env.SITE_URL = 'https://getclearframe.app';
    const limited = [];
    const limitedPolar = {checkouts: {create: async value => { limited.push(value); return {url: 'https://polar.sh/checkout/example'}; }}};
    const headers = {'x-forwarded-for': '203.0.113.77'};
    const responses = [];
    const pending = [];
    for (let i = 0; i < 11; i++) {
      const res = response();
      responses.push(res);
      pending.push(checkout({method: 'GET', url: `/checkout?products=${product}`, headers}, res, {polar: limitedPolar, now: 9_000_000_000}));
    }
    await Promise.all(pending);
    assert.deepEqual(responses.slice(0, 10).map(res => res.statusCode), Array(10).fill(302));
    assert.equal(responses[10].statusCode, 429);
    assert.equal(limited.length, 10);
    assert.equal(limited[0].success_url, 'https://getclearframe.app/signin?subscribed=1');
    assert.equal(JSON.stringify(limited[0]).includes('CHECKOUT_ID'), false);
  } finally {
    if (previous === undefined) delete process.env.POLAR_PRODUCT_ID;
    else process.env.POLAR_PRODUCT_ID = previous;
    if (previousSite === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = previousSite;
  }
});

test('webhook rejects invalid signatures and reads the untouched body', async () => {
  const previous = process.env.POLAR_WEBHOOK_SECRET;
  process.env.POLAR_WEBHOOK_SECRET = 'test-secret';
  try {
    const body = '{"type":"order.paid", "data":{}}';
    const headers = {'webhook-id': 'msg_1', 'webhook-timestamp': '123', 'webhook-signature': 'bad'};
    const rejected = response();
    await webhook({method: 'POST', headers, body}, rejected);
    assert.equal(rejected.statusCode, 403);
    const accepted = response();
    await webhook({method: 'POST', headers, body}, accepted, {validateEvent: async (received, receivedHeaders, secret) => {
      assert.equal(received, body);
      assert.deepEqual(receivedHeaders, headers);
      assert.equal(secret, 'test-secret');
      return {type: 'order.paid', data: {}};
    }});
    assert.equal(accepted.statusCode, 200);
  } finally {
    if (previous === undefined) delete process.env.POLAR_WEBHOOK_SECRET;
    else process.env.POLAR_WEBHOOK_SECRET = previous;
  }
});
