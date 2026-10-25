const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {magicToken, sessionToken, verify, sign, MAGIC_TTL_MS} = require('../server-lib/tokens');
const {resetRateLimit} = require('../server-lib/rate-limit');
const {requestLink, redeemLink, GENERIC} = require('../server-lib/session');
const {entitlement} = require('../server-lib/polar');
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
  POLAR_PRODUCT_ID: 'be456dd9-4508-4b3a-a517-60fae3c9747b',
  SITE_URL: 'http://127.0.0.1:8765',
  EMAIL_FROM: 'ClearFrame <pro@example.com>'
};

function json(data, status = 200) {
  return {ok: status < 400, status, async json() { return data; }};
}

function sub(overrides = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    customer_id: 'cus_1',
    product_id: env.POLAR_PRODUCT_ID,
    current_period_end: '2099-01-01T00:00:00Z',
    cancel_at_period_end: false,
    ...overrides
  };
}

function order(overrides = {}) {
  return {
    id: 'ord_1',
    status: 'paid',
    refunded_amount: 0,
    customer_id: 'cus_1',
    product_id: env.POLAR_PRODUCT_ID,
    subscription_id: 'sub_1',
    billing_reason: 'subscription_cycle',
    created_at: '2098-01-01T00:00:00Z',
    ...overrides
  };
}

function polarFetch(paid) {
  const calls = [];
  const impl = async (url, options = {}) => {
    calls.push({url: String(url), options});
    if (String(url).includes('/v1/customers/')) {
      return json(paid ? {items: [{id: 'cus_1', email: 'pro@example.com'}]} : {items: []});
    }
    if (String(url).includes('/v1/subscriptions/')) {
      return json({items: paid ? [sub()] : [], pagination: {max_page: 1}});
    }
    if (String(url).includes('/v1/orders/')) {
      return json({items: paid ? [order()] : [], pagination: {max_page: 1}});
    }
    if (String(url).includes('/v1/customer-sessions/')) {
      return json({customer_portal_url: 'https://polar.sh/portal/example'});
    }
    throw new Error(`unexpected ${url}`);
  };
  return {impl, calls};
}

function scriptedPolar({customers, subscriptions = [], orders = []} = {}) {
  const calls = [];
  const impl = async url => {
    const target = String(url);
    calls.push(target);
    if (target.includes('/v1/customers/')) {
      const items = typeof customers === 'function' ? customers(target) : (customers || [{id: 'cus_1', email: 'pro@example.com'}]);
      return json({items, pagination: {max_page: 1}});
    }
    if (target.includes('/v1/subscriptions/')) return json({items: subscriptions, pagination: {max_page: 1}});
    if (target.includes('/v1/orders/')) return json({items: orders, pagination: {max_page: 1}});
    throw new Error(`unexpected ${target}`);
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
  assert.match(paid.calls[1].url, /\/v1\/subscriptions\/\?/);
  assert.match(paid.calls[1].url, /customer_id=cus_1/);
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
  const refunded = scriptedPolar({
    subscriptions: [sub()],
    orders: [order({status: 'refunded', refunded_amount: 2900, billing_reason: 'subscription_create'})]
  });
  await sessionHandler({method: 'GET', url: '/api/auth/session', headers: {cookie: `cf_session=${encodeURIComponent(old)}`}}, revoked, {
    env,
    now: Date.now(),
    fetchImpl: refunded.impl
  });
  assert.equal(revoked.statusCode, 401);
  assert.match(String(revoked.headers['set-cookie']), /cf_session=;[^]*Max-Age=0/);
  assert.ok(refunded.calls.some(url => url.includes('/v1/subscriptions/')));
  assert.ok(refunded.calls.some(url => url.includes('/v1/orders/')));

  const kept = mockRes();
  const paid = polarFetch(true);
  await sessionHandler({method: 'GET', url: '/api/auth/session', headers: {cookie: `cf_session=${encodeURIComponent(old)}`}}, kept, {env, now: Date.now(), fetchImpl: paid.impl});
  assert.equal(kept.statusCode, 200);
  assert.equal(JSON.parse(kept.body).pro, true);
  assert.match(paid.calls.map(call => call.url).join('\n'), /\/v1\/subscriptions\//);

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

test('legal pages do not advertise the payment checkout, and the free page does not load Pro code', () => {
  for (const file of ['how-privacy-works.html', 'contact.html']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /Polar|Vercel|Google Fonts|buy\.polar|license key/i, file);
  }
  assert.doesNotMatch(fs.readFileSync('terms.html', 'utf8'), /\/checkout|buy\.polar|Vercel|Google Fonts|license key/i);
  const privacy = fs.readFileSync('privacy.html', 'utf8');
  assert.match(privacy, /Payments are handled separately by Polar/);
  assert.doesNotMatch(privacy, /Vercel|Google Fonts|buy\.polar|license key/i);
  assert.doesNotMatch(fs.readFileSync('index.html', 'utf8'), /\/api\/|webkitdirectory/);
  assert.match(fs.readFileSync('privacy.html', 'utf8'), /Free use does not ask for your name or email/);
  assert.match(fs.readFileSync('privacy.html', 'utf8'), /currently has ClearFrame Pro/);
  assert.match(fs.readFileSync('privacy.html', 'utf8'), /payment provider’s customer id/);
  assert.match(fs.readFileSync('privacy.html', 'utf8'), /time access was last checked/);
  assert.match(fs.readFileSync('privacy.html', 'utf8'), /24-hour window/);
  assert.match(fs.readFileSync('privacy.html', 'utf8'), /within a day/);
  assert.match(fs.readFileSync('privacy.html', 'utf8'), /refund the payment provider reports/);
  assert.doesNotMatch(fs.readFileSync('privacy.html', 'utf8'), /at most once a day/);
  assert.doesNotMatch(fs.readFileSync('privacy.html', 'utf8'), /active ClearFrame Pro subscription/);
});

test('the Pro subscription terms state the refund windows and privacy names the dialog count', () => {
  const terms = fs.readFileSync('terms.html', 'utf8');
  const visible = terms.replace(/<!--[\s\S]*?-->/g, '');
  const refund = 'Refunds. If you are not satisfied with ClearFrame Pro, email support@getclearframe.app within 14 days of your first purchase and we will refund the full amount. For renewals, you may request a refund within 7 days of the renewal charge. After those windows, payments are not refundable, but you can cancel any time and keep Pro until the end of the period you already paid for. Refunds are returned to your original payment method through our payment processor, Polar, and usually appear within 5 to 10 business days. When a refund is issued, your Pro access ends within a day. If a renewal payment fails, you keep Pro for 24 hours while the payment is retried, and your access is re-checked within a day of that deadline. Cancelling stops future charges and does not by itself trigger a refund.';
  assert.match(terms, /<h2>Pro subscription<\/h2>/);
  assert.match(terms, /This section is a draft for review/);
  assert.match(terms, /Last updated 25 October 2026/);
  assert.match(terms, /ClearFrame Pro is \$29 USD per year\./);
  assert.match(terms, /renews automatically each year until it is cancelled\./);
  assert.match(terms, /cancel any time from the account page via Manage subscription, which opens the Polar customer portal\./);
  assert.match(terms, /You keep access until the end of the paid period\./);
  assert.match(terms, /Payments and tax are handled by Polar as merchant of record\./);
  assert.ok(terms.includes(refund));
  assert.match(terms, /14 days of your first purchase/);
  assert.match(terms, /7 days of the renewal charge/);
  assert.match(terms, /your Pro access ends within a day/);
  assert.doesNotMatch(terms, /ends right away/);
  assert.match(terms, /you keep Pro for 24 hours while the payment is retried, and your access is re-checked within a day of that deadline/);
  assert.match(terms, /does not by itself trigger a refund/);
  assert.equal((terms.match(/<!-- LEGAL REVIEW -->/g) || []).length, 6);
  assert.doesNotMatch(visible, /\[RYAN TO DECIDE|\(DRAFT\)/);
  assert.doesNotMatch(terms, /\/checkout|buy\.polar/);
  const privacy = fs.readFileSync('privacy.html', 'utf8');
  assert.match(privacy, /Manage subscription opens the payment provider’s own page/);
  assert.doesNotMatch(privacy, /Managing a receipt/);
  assert.match(privacy, /Opening the Pro upgrade dialog is counted separately/);
  assert.match(privacy, /one field, source, and the only values are header and raw error/);
  assert.match(privacy, /Last updated 25 October 2026/);
  assert.match(privacy, /This page does not say either setting is already on/);
});


test('expired annual subscription never unlocks Pro, even with a historical paid order', async () => {
  const fetchImpl = async url => {
    if (String(url).includes('/v1/customers/')) return json({items: [{id: 'cus_1', email: 'pro@example.com'}]});
    if (String(url).includes('/v1/subscriptions/')) return json({items: [{id: 'sub_1', customer_id: 'cus_1', product_id: env.POLAR_PRODUCT_ID, status: 'active', current_period_end: '2020-01-01T00:00:00Z'}]});
    throw new Error('Unexpected endpoint');
  };
  assert.equal((await entitlement('pro@example.com', {env, fetchImpl})).paid, false);
});

const HOUR = 60 * 60 * 1000;
const anchor = Date.parse('2026-06-01T00:00:00.000Z');

function pastDue(extra = {}) {
  return sub({
    status: 'past_due',
    past_due_at: '2026-06-01T00:00:00.000Z',
    current_period_end: '2027-06-01T00:00:00.000Z',
    ...extra
  });
}

async function paidAt(subscriptions, orders, now) {
  const polar = scriptedPolar({subscriptions, orders});
  const result = await entitlement('pro@example.com', {env, fetchImpl: polar.impl, now});
  return {result, calls: polar.calls};
}

test('a paid order grants Pro and a full or partial refund denies it while the subscription stays active', async () => {
  const active = [sub()];
  assert.equal((await paidAt(active, [order()], Date.parse('2026-06-01T00:00:00Z'))).result.paid, true);
  assert.equal((await paidAt(active, [order({status: 'refunded', refunded_amount: 2900})], anchor)).result.paid, false);
  assert.equal((await paidAt(active, [order({status: 'partially_refunded', refunded_amount: 500})], anchor)).result.paid, false);
  assert.equal((await paidAt(active, [order({status: 'paid', refunded_amount: 1})], anchor)).result.paid, false);
  assert.equal((await paidAt(active, [order({status: 'paid', refunded_amount: 0, refunded_tax_amount: 20})], anchor)).result.paid, false);
  const noOrder = await paidAt(active, [], anchor);
  assert.equal(noOrder.result.paid, true);
  assert.ok(noOrder.calls.some(url => url.includes('/v1/orders/')));
});

test('a refund of an older order does not remove Pro after a later renewal is paid', async () => {
  const orders = [
    order({id: 'ord_old', status: 'refunded', refunded_amount: 2900, created_at: '2025-06-01T00:00:00Z', billing_reason: 'subscription_create'}),
    order({id: 'ord_new', status: 'paid', refunded_amount: 0, created_at: '2026-06-01T00:00:00Z', billing_reason: 'subscription_cycle'})
  ];
  assert.equal((await paidAt([sub()], orders, anchor)).result.paid, true);
  const reversed = [
    order({id: 'ord_old', status: 'paid', refunded_amount: 0, created_at: '2025-06-01T00:00:00Z'}),
    order({id: 'ord_new', status: 'partially_refunded', refunded_amount: 100, created_at: '2026-06-01T00:00:00Z'})
  ];
  assert.equal((await paidAt([sub()], reversed, anchor)).result.paid, false);
  const pendingRenewal = [
    order({id: 'ord_old', status: 'paid', refunded_amount: 0, created_at: '2025-06-01T00:00:00Z'}),
    order({id: 'ord_new', status: 'pending', refunded_amount: 0, created_at: '2026-06-01T00:00:00Z'})
  ];
  assert.equal((await paidAt([sub()], pendingRenewal, anchor)).result.paid, true);
});

test('past_due keeps Pro for 24 hours after past_due_at and then ends', async () => {
  const orders = [order()];
  const granted = await paidAt([pastDue()], orders, anchor + 23 * HOUR);
  assert.equal(granted.result.paid, true);
  assert.equal(granted.result.recheckAt, anchor + 24 * HOUR);
  assert.equal((await paidAt([pastDue()], orders, anchor + 24 * HOUR - 1)).result.paid, true);
  assert.equal((await paidAt([pastDue()], orders, anchor + 24 * HOUR)).result.paid, false);
  assert.equal((await paidAt([pastDue()], orders, anchor + 25 * HOUR)).result.paid, false);
  const duringFuturePeriod = await paidAt([pastDue()], orders, anchor + 23 * HOUR);
  assert.equal(duringFuturePeriod.result.paid, true);
  assert.ok(Date.parse(pastDue().current_period_end) > anchor + 23 * HOUR);
  const missingAnchor = await paidAt([pastDue({past_due_at: null})], orders, anchor + HOUR);
  assert.equal(missingAnchor.result.paid, false);
  assert.equal(missingAnchor.calls.some(url => url.includes('/v1/orders/')), false);
  assert.equal((await paidAt([pastDue()], [order({status: 'refunded', refunded_amount: 2900})], anchor + HOUR)).result.paid, false);
});

test('trialing and cancel-at-period-end grant, and other statuses deny', async () => {
  const orders = [order()];
  const now = anchor;
  assert.equal((await paidAt([sub({status: 'trialing', current_period_end: '2026-07-01T00:00:00Z'})], [], now)).result.paid, true);
  const scheduled = await paidAt([sub({cancel_at_period_end: true, canceled_at: '2026-06-01T00:00:00Z'})], orders, now);
  assert.equal(scheduled.result.paid, true);
  assert.equal(scheduled.result.cancelAtPeriodEnd, true);
  assert.equal(scheduled.result.recheckAt, undefined);
  for (const status of ['canceled', 'revoked', 'unpaid', 'paused', 'incomplete', 'incomplete_expired']) {
    const denied = await paidAt([sub({status, current_period_end: '2099-01-01T00:00:00Z'})], orders, now);
    assert.equal(denied.result.paid, false, status);
    assert.equal(denied.calls.some(url => url.includes('/v1/orders/')), false, status);
  }
});

test('a lowercased sign-in matches a mixed-case Polar customer and ignores other addresses', async () => {
  const subscriptions = [sub()];
  const orders = [order()];
  const direct = scriptedPolar({
    customers: () => [{id: 'cus_1', email: 'Pro@Example.com'}],
    subscriptions,
    orders
  });
  assert.equal((await entitlement('pro@example.com', {env, fetchImpl: direct.impl, now: anchor})).paid, true);
  assert.equal(direct.calls.filter(url => url.includes('/v1/customers/')).length, 1);
  assert.match(direct.calls[0], /email=pro%40example\.com/);
  assert.doesNotMatch(direct.calls[0], /query=/);

  const fallback = scriptedPolar({
    customers(url) {
      if (url.includes('query=')) return [{id: 'cus_1', email: 'Pro@Example.com'}, {id: 'cus_other', email: 'pro@example.com.evil'}, {id: 'cus_name', email: 'someone@example.com'}];
      return [];
    },
    subscriptions,
    orders
  });
  assert.equal((await entitlement('pro@example.com', {env, fetchImpl: fallback.impl, now: anchor})).paid, true);
  assert.match(fallback.calls[1], /query=pro%40example\.com/);
  assert.doesNotMatch(fallback.calls[1], /email=/);

  const otherPeople = scriptedPolar({
    customers(url) {
      if (url.includes('query=')) return [{id: 'cus_prefix', email: 'pro@example.co'}, {id: 'cus_suffix', email: 'notpro@example.com'}];
      return [];
    },
    subscriptions,
    orders
  });
  const missed = await entitlement('pro@example.com', {env, fetchImpl: otherPeople.impl, now: anchor});
  assert.equal(missed.paid, false);
  assert.equal(otherPeople.calls.some(url => url.includes('/v1/subscriptions/')), false);

  const ambiguous = scriptedPolar({
    customers: () => [{id: 'cus_a', email: 'Pro@Example.com'}, {id: 'cus_b', email: 'pro@example.com'}],
    subscriptions,
    orders
  });
  assert.equal((await entitlement('pro@example.com', {env, fetchImpl: ambiguous.impl, now: anchor})).paid, false);
  assert.equal(ambiguous.calls.some(url => url.includes('query=')), false);
});

test('a past_due session is re-checked at the grace deadline, and a fresh session hides a refund for under a day', async () => {
  const checked = Date.now();
  const pastDueAt = checked - 23 * HOUR;
  const deadline = pastDueAt + 24 * HOUR;
  const stale = sign({typ: 'session', email: 'pro@example.com', customerId: 'cus_1', iat: 10, ent: 10, exp: Math.floor(checked / 1000) + 3600}, secret);
  const polar = scriptedPolar({
    subscriptions: [sub({status: 'past_due', past_due_at: new Date(pastDueAt).toISOString(), current_period_end: '2099-01-01T00:00:00Z'})],
    orders: [order()]
  });
  const kept = mockRes();
  await sessionHandler({method: 'GET', url: '/api/auth/session', headers: {cookie: `cf_session=${encodeURIComponent(stale)}`}}, kept, {env, now: checked, fetchImpl: polar.impl});
  assert.equal(kept.statusCode, 200);
  const session = cookie(kept.headers['set-cookie'], 'cf_session');
  const payload = verify(session, secret);
  assert.equal(payload.until, Math.floor(deadline / 1000));
  assert.ok(payload.until > Math.floor(checked / 1000));

  const midway = mockRes();
  await moduleHandler({method: 'GET', url: '/api/pro/module?name=pro.js', headers: {cookie: `cf_session=${encodeURIComponent(session)}`}}, midway, {
    env,
    now: deadline - 1000,
    fetchImpl: () => { throw new Error('grace cache must not call Polar before until'); }
  });
  assert.equal(midway.statusCode, 200);

  const ended = mockRes();
  const stillPastDue = scriptedPolar({
    subscriptions: [sub({status: 'past_due', past_due_at: new Date(pastDueAt).toISOString(), current_period_end: '2099-01-01T00:00:00Z'})],
    orders: [order()]
  });
  await moduleHandler({method: 'GET', url: '/api/pro/module?name=pro.js', headers: {cookie: `cf_session=${encodeURIComponent(session)}`}}, ended, {env, now: deadline, fetchImpl: stillPastDue.impl});
  assert.equal(ended.statusCode, 401);
  assert.match(String(ended.headers['set-cookie']), /cf_session=;[^]*Max-Age=0/);
  assert.ok(stillPastDue.calls.some(url => url.includes('/v1/subscriptions/')));

  const active = mockRes();
  await sessionHandler({method: 'GET', url: '/api/auth/session', headers: {cookie: `cf_session=${encodeURIComponent(stale)}`}}, active, {env, now: checked, fetchImpl: polarFetch(true).impl});
  assert.equal(verify(cookie(active.headers['set-cookie'], 'cf_session'), secret).until, undefined);

  const fresh = sessionToken({email: 'pro@example.com', customerId: 'cus_1', secret, now: checked});
  const hidden = mockRes();
  await moduleHandler({method: 'GET', url: '/api/pro/module?name=pro.js', headers: {cookie: `cf_session=${encodeURIComponent(fresh)}`}}, hidden, {
    env,
    now: checked + 23 * HOUR,
    fetchImpl: () => { throw new Error('daily cache must hide a refund until the next check'); }
  });
  assert.equal(hidden.statusCode, 200);

  const due = mockRes();
  const refunded = scriptedPolar({subscriptions: [sub()], orders: [order({status: 'refunded', refunded_amount: 2900})]});
  const dueToken = sign({typ: 'session', email: 'pro@example.com', customerId: 'cus_1', iat: 10, ent: Math.floor(checked / 1000) - 24 * 60 * 60, exp: Math.floor(checked / 1000) + 3600}, secret);
  await sessionHandler({method: 'GET', url: '/api/auth/session', headers: {cookie: `cf_session=${encodeURIComponent(dueToken)}`}}, due, {env, now: checked, fetchImpl: refunded.impl});
  assert.equal(due.statusCode, 401);

  const outage = mockRes();
  await sessionHandler({method: 'GET', url: '/api/auth/session', headers: {cookie: `cf_session=${encodeURIComponent(dueToken)}`}}, outage, {
    env,
    now: checked,
    fetchImpl: async () => json({items: []}, 500)
  });
  assert.equal(outage.statusCode, 401);
  assert.equal(outage.headers['set-cookie'], undefined);
});
