const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {magicToken, sessionToken, verify, sign, MAGIC_TTL_MS} = require('../server-lib/tokens');
const {resetRateLimit} = require('../server-lib/rate-limit');
const {requestLink, redeemLink, GENERIC} = require('../server-lib/session');
const requestHandler = require('../api/auth/request');
const verifyHandler = require('../api/auth/verify');
const sessionHandler = require('../api/auth/session');
const portalHandler = require('../api/auth/portal');
const moduleHandler = require('../api/pro/module');

const secret = 'test-secret-test-secret-test-secret';
const env = {
  SESSION_SECRET: secret,
  POLAR_ACCESS_TOKEN: 'polar-test',
  POLAR_ORG_ID: '451754ed-9a0e-4fcb-be7f-5e15db2a9b9b',
  POLAR_PRODUCT_ID: 'f89c5925-7362-40aa-9ce3-e69ff81005b5',
  SITE_URL: 'http://127.0.0.1:8765',
  EMAIL_FROM: 'ClearFrame <pro@example.com>'
};

function json(data, status = 200) {
  return {ok: status < 400, status, async json() { return data; }};
}

function polarFetch(paid) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({url: String(url), options});
    if (String(url).includes('/v1/customers/')) {
      return json(paid ? {items: [{id: 'cus_1', email: 'pro@example.com'}]} : {items: []});
    }
    if (String(url).includes('/v1/orders/')) {
      return json({items: paid ? [{status: 'paid', paid: true}] : []});
    }
    if (String(url).includes('/v1/customer-sessions/')) {
      return json({customer_portal_url: 'https://polar.sh/portal/example'});
    }
    throw new Error(`unexpected ${url}`);
  };
  return {impl, calls};
}

function mockRes() {
  return {statusCode: 0, body: '', headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(body) { this.body = body == null ? '' : String(body); }};
}

function cookie(header, name) {
  const rows = [].concat(header || []);
  const row = rows.find(item => item.startsWith(`${name}=`));
  if (!row) return '';
  return decodeURIComponent(row.slice(name.length + 1).split(';')[0]);
}

test('magic and session tokens expire and reject tampering', () => {
  const fresh = magicToken({email: 'a@b.co', secret});
  const payload = verify(fresh, secret);
  assert.equal(payload.typ, 'magic');
  assert.equal(payload.email, 'a@b.co');
  assert.ok(payload.exp * 1000 - Date.now() > MAGIC_TTL_MS - 5000);
  assert.ok(payload.exp * 1000 - Date.now() <= MAGIC_TTL_MS);
  assert.equal(verify(magicToken({email: 'a@b.co', secret, now: Date.now() - MAGIC_TTL_MS - 1000}), secret), null);
  assert.equal(verify(`${fresh.slice(0, -2)}aa`, secret), null);
  const session = verify(sessionToken({email: 'a@b.co', customerId: 'cus_1', secret}), secret);
  assert.equal(session.typ, 'session');
  assert.equal(session.customerId, 'cus_1');
  assert.ok(session.exp - session.iat >= 30 * 24 * 60 * 60 - 1);
  assert.equal(verify(sign({typ: 'session', email: 'a@b.co', exp: Math.floor(Date.now() / 1000) - 5}, secret), secret), null);
});

test('sign-in returns the same message for customers and everyone else', async () => {
  resetRateLimit();
  const logs = [];
  const paid = polarFetch(true);
  const customer = await requestLink({email: 'Pro@Example.com', headers: {'x-forwarded-for': '203.0.113.8'}}, {env, fetchImpl: paid.impl, log: message => logs.push(message), now: 10_000});
  const stranger = await requestLink({email: 'nope@example.com', headers: {'x-forwarded-for': '203.0.113.9'}}, {env, fetchImpl: polarFetch(false).impl, log: message => logs.push(message), now: 11_000});
  assert.deepEqual(customer, {status: 200, body: GENERIC});
  assert.deepEqual(stranger, customer);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /magic link for pro@example.com: http:\/\/127\.0\.0\.1:8765\/api\/auth\/verify\?token=/);
  assert.match(paid.calls[0].url, /\/v1\/customers\/\?/);
  assert.match(paid.calls[0].url, /email=pro%40example\.com/);
  assert.match(paid.calls[1].url, /\/v1\/orders\/\?/);
  assert.match(paid.calls[1].url, /status=paid/);
  assert.match(paid.calls[1].url, new RegExp(env.POLAR_PRODUCT_ID));
  assert.equal(paid.calls.some(call => call.url.includes('api.resend.com')), false);
});

test('sign-in is rate limited without saying whether the email is a customer', async () => {
  resetRateLimit();
  const deps = {env, fetchImpl: polarFetch(false).impl, log() {}, now: 50_000};
  const req = {email: 'limit@example.com', headers: {'x-forwarded-for': '198.51.100.4'}};
  for (let i = 0; i < 5; i++) assert.equal((await requestLink(req, deps)).status, 200);
  const blocked = await requestLink(req, deps);
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.message, 'Please wait a few minutes and try again.');
  assert.doesNotMatch(JSON.stringify(blocked.body), /customer|purchase|not found/i);
});

test('a magic link sets a session once, and Pro code is gated on that session', async () => {
  resetRateLimit();
  const logs = [];
  const paid = polarFetch(true);
  const deps = {env, fetchImpl: paid.impl, log: message => logs.push(message), now: Date.now()};
  const requested = mockRes();
  await requestHandler({method: 'POST', headers: {'x-forwarded-for': '192.0.2.9'}, body: {email: 'pro@example.com'}}, requested, deps);
  assert.equal(requested.statusCode, 200);
  assert.equal(JSON.parse(requested.body).message, GENERIC.message);
  const token = logs[0].split('token=')[1];
  const verified = mockRes();
  await verifyHandler({method: 'GET', url: `/api/auth/verify?token=${encodeURIComponent(token)}`, headers: {}}, verified, deps);
  assert.equal(verified.statusCode, 302);
  assert.equal(verified.headers.location, 'http://127.0.0.1:8765/account');
  const session = cookie(verified.headers['set-cookie'], 'cf_session');
  const used = cookie(verified.headers['set-cookie'], 'cf_used');
  assert.equal(verify(session, secret).email, 'pro@example.com');
  assert.equal(verified.headers['set-cookie'].some(row => row.includes('Secure')), false);

  const again = mockRes();
  await verifyHandler({method: 'GET', url: `/api/auth/verify?token=${encodeURIComponent(token)}`, headers: {cookie: `cf_used=${encodeURIComponent(used)}`}}, again, deps);
  assert.equal(again.headers.location, 'http://127.0.0.1:8765/signin?error=1');

  const denied = mockRes();
  await moduleHandler({method: 'GET', url: '/api/pro/module?name=pro.js', headers: {}}, denied, deps);
  assert.equal(denied.statusCode, 401);
  assert.equal(denied.body, '');
  assert.doesNotMatch(denied.body, /webkitdirectory/);

  const allowed = mockRes();
  await moduleHandler({method: 'GET', url: '/api/pro/module?name=pro.js', headers: {cookie: `cf_session=${encodeURIComponent(session)}`}}, allowed, {...deps, fetchImpl: () => { throw new Error('fresh session must not call Polar'); }});
  assert.equal(allowed.statusCode, 200);
  assert.match(allowed.body, /webkitdirectory/);
  assert.match(allowed.headers['content-type'], /application\/javascript/);

  const https = mockRes();
  await verifyHandler({method: 'GET', url: `/api/auth/verify?token=${encodeURIComponent(magicToken({email: 'pro@example.com', secret}))}`, headers: {}}, https, {...deps, env: {...env, SITE_URL: 'https://getclearframe.app'}});
  assert.equal(https.headers['set-cookie'].every(row => row.includes('Secure')), true);
});

test('a stale session is checked again and a refund removes Pro access', async () => {
  const old = sign({typ: 'session', email: 'pro@example.com', customerId: 'cus_1', iat: 10, ent: 10, exp: Math.floor(Date.now() / 1000) + 3600}, secret);
  const revoked = mockRes();
  let calls = 0;
  await sessionHandler({method: 'GET', url: '/api/auth/session', headers: {cookie: `cf_session=${encodeURIComponent(old)}`}}, revoked, {
    env,
    now: Date.now(),
    fetchImpl: async () => { calls++; return json({items: []}); }
  });
  assert.equal(revoked.statusCode, 401);
  assert.match(String(revoked.headers['set-cookie']), /cf_session=;[^]*Max-Age=0/);
  assert.ok(calls > 0);

  const kept = mockRes();
  const paid = polarFetch(true);
  await sessionHandler({method: 'GET', url: '/api/auth/session', headers: {cookie: `cf_session=${encodeURIComponent(old)}`}}, kept, {env, now: Date.now(), fetchImpl: paid.impl});
  assert.equal(kept.statusCode, 200);
  assert.equal(JSON.parse(kept.body).pro, true);
  assert.match(paid.calls.map(call => call.url).join('\n'), /\/v1\/orders\//);

  const portal = mockRes();
  const session = cookie(kept.headers['set-cookie'], 'cf_session');
  const portalFetch = polarFetch(true);
  await portalHandler({method: 'GET', url: '/api/auth/portal', headers: {cookie: `cf_session=${encodeURIComponent(session)}`}}, portal, {env, fetchImpl: portalFetch.impl});
  assert.equal(portal.statusCode, 302);
  assert.equal(portal.headers.location, 'https://polar.sh/portal/example');
  const create = portalFetch.calls.find(call => call.url.includes('/v1/customer-sessions/'));
  assert.equal(create.options.method, 'POST');
  assert.match(create.options.body, /cus_1/);
});

test('legal pages do not name the payment provider, and the free page does not load Pro code', () => {
  for (const file of ['privacy.html', 'terms.html', 'how-privacy-works.html', 'contact.html']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /Polar|Vercel|Google Fonts|buy\.polar|license key/i, file);
  }
  assert.doesNotMatch(fs.readFileSync('index.html', 'utf8'), /\/api\/|webkitdirectory/);
  assert.match(fs.readFileSync('privacy.html', 'utf8'), /Free use does not ask for your name or email/);
  assert.match(fs.readFileSync('privacy.html', 'utf8'), /at most once a day/);
});
