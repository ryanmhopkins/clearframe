const crypto = require('crypto');

const MAGIC_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload, secret) {
  if (!secret) throw new Error('SESSION_SECRET is not set');
  const body = encode(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', secret).update(body).digest();
  return `${body}.${encode(mac)}`;
}

function verify(token, secret) {
  if (!secret || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  let got;
  try { got = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); }
  catch { return null; }
  if (!payload || typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
  return payload;
}

function magicToken({email, secret, now = Date.now()}) {
  const iat = Math.floor(now / 1000);
  return sign({
    typ: 'magic',
    email,
    nonce: crypto.randomBytes(16).toString('base64url'),
    iat,
    exp: Math.floor((now + MAGIC_TTL_MS) / 1000)
  }, secret);
}

function sessionToken({email, customerId, secret, now = Date.now(), checkedAt, until}) {
  const iat = Math.floor(now / 1000);
  const payload = {
    typ: 'session',
    email,
    customerId,
    iat,
    ent: checkedAt == null ? iat : checkedAt,
    exp: Math.floor((now + SESSION_TTL_MS) / 1000)
  };
  // until is the past_due grace deadline in unix seconds. It is a timestamp in the
  // existing signed session, not a new cookie or identifier.
  if (Number.isFinite(until)) payload.until = until;
  return sign(payload, secret);
}

module.exports = {sign, verify, magicToken, sessionToken, MAGIC_TTL_MS, SESSION_TTL_MS};
