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
  process.env.POLAR_PRODUCT_ID = product;
  try {
    const calls = [];
    const polar = {checkouts: {create: async value => { calls.push(value); return {url: 'https://polar.sh/checkout/example'}; }}};
    const bad = response();
    await checkout({method: 'GET', url: '/checkout?products=00000000-0000-4000-8000-000000000000'}, bad, {polar});
    assert.equal(bad.statusCode, 400);
    assert.equal(calls.length, 0);
    const good = response();
    await checkout({method: 'GET', url: `/checkout?products=${product}`}, good, {polar});
    assert.equal(good.statusCode, 302);
    assert.equal(good.headers.location, 'https://polar.sh/checkout/example');
    assert.deepEqual(calls, [{products: [product]}]);
  } finally {
    if (previous === undefined) delete process.env.POLAR_PRODUCT_ID;
    else process.env.POLAR_PRODUCT_ID = previous;
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
