const {test} = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const {resetRateLimit} = require('../server-lib/rate-limit');
const {verify} = require('../server-lib/tokens');
const {requestMacLink, verifyMacLink, exchangeMacLink, macAccount} = require('../server-lib/mac-auth');
const requestHandler = require('../api/mac/auth/request');
const verifyHandler = require('../api/mac/auth/verify');
const exchangeHandler = require('../api/mac/auth/exchange');
const accountHandler = require('../api/mac/account');

const env = {
  SESSION_SECRET: 'test-secret-test-secret-test-secret',
  SITE_URL: 'https://getclearframe.app',
  POLAR_ACCESS_TOKEN: 'test-token',
  POLAR_ORG_ID: 'test-org',
  POLAR_PRODUCT_ID: 'test-product'
};
const verifier = 'a'.repeat(44);
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const now = Date.now();

function response() {
  return {statusCode: 0, body: '', headers: {},
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; },
    end(body) { this.body = String(body || ''); }};
}

function polarFetch(paid) {
  return async url => {
    let body = {items: []};
    if (paid && String(url).includes('/customers/')) body = {items: [{id: 'customer-1', email: 'member@example.com'}]};
    if (paid && String(url).includes('/subscriptions/')) body = {items: [{id: 'sub-1', customer_id: 'customer-1', product_id: 'test-product', status: 'active', current_period_end: '2099-01-01T00:00:00Z'}]};
    if (paid && String(url).includes('/orders/')) body = {items: [{id: 'order-1', subscription_id: 'sub-1', product_id: 'test-product', status: 'paid', created_at: '2026-01-01T00:00:00Z'}]};
    return {ok: true, async json() { return body; }};
  };
}

test('Mac sign-in accepts free email, binds link to requesting device, and expires', async () => {
  resetRateLimit();
  const logs = [];
  const request = await requestMacLink({email: 'Free@Example.com', challenge, headers: {}},
    {env, now, log: line => logs.push(line)});
  assert.equal(request.status, 200);
  const token = new URL(logs[0].split(': ').at(-1)).searchParams.get('token');
  assert.equal(verifyMacLink(token, env).email, 'free@example.com');
  assert.equal(exchangeMacLink(token, 'wrong'.repeat(10), env), null);
  const session = exchangeMacLink(token, verifier, env, now);
  assert.equal(verify(session, env.SESSION_SECRET).typ, 'mac-session');
  const account = await macAccount({headers: {authorization: `Bearer ${session}`}}, {env, now, fetchImpl: polarFetch(false)});
  assert.deepEqual(account.body, {signedIn: true, email: 'free@example.com', pro: false});
  const expiredToken = require('../server-lib/tokens').sign({typ: 'mac-magic', email: 'free@example.com', challenge, exp: Math.floor(Date.now() / 1000) - 1}, env.SESSION_SECRET);
  assert.equal(verifyMacLink(expiredToken, env), null);
});

test('Mac endpoints recognize existing paid web account without changing web session', async () => {
  resetRateLimit();
  const logs = [];
  const req = response();
  await requestHandler({method: 'POST', headers: {}, body: {email: 'member@example.com', challenge}}, req,
    {env, now, log: line => logs.push(line)});
  assert.equal(req.statusCode, 200);
  const token = new URL(logs[0].split(': ').at(-1)).searchParams.get('token');
  const redirect = response();
  verifyHandler({method: 'GET', url: `/api/mac/auth/verify?token=${encodeURIComponent(token)}`}, redirect, {env});
  assert.equal(redirect.statusCode, 302);
  assert.match(redirect.headers.location, /^clearframe:\/\/auth\?token=/);
  const exchanged = response();
  await exchangeHandler({method: 'POST', headers: {}, body: {token, verifier}}, exchanged, {env, now});
  assert.equal(exchanged.statusCode, 200);
  const session = JSON.parse(exchanged.body).session;
  const profile = response();
  await accountHandler({method: 'GET', headers: {authorization: `Bearer ${session}`}}, profile,
    {env, now, fetchImpl: polarFetch(true)});
  assert.equal(JSON.parse(profile.body).pro, true);
  const denied = response();
  await accountHandler({method: 'GET', headers: {authorization: 'Bearer invalid'}}, denied,
    {env, now, fetchImpl: polarFetch(true)});
  assert.equal(denied.statusCode, 401);
});
