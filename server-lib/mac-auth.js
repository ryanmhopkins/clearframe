const crypto = require('crypto');
const {sign, verify, MAGIC_TTL_MS, SESSION_TTL_MS} = require('./tokens');
const {allow} = require('./rate-limit');
const {sendMagicLink} = require('./email');
const {entitlement} = require('./polar');
const {clientIp, emailOf, siteUrl, WAIT} = require('./http');

const WINDOW = 15 * 60 * 1000;
const LIMIT = 5;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

async function requestMacLink(req, deps) {
  const now = deps.now || Date.now();
  const email = emailOf(req.email);
  if (!email || !CHALLENGE.test(String(req.challenge || ''))) return {status: 400, body: {ok: false, message: 'Enter a valid email address.'}};
  if (!allow(`mac-ip:${clientIp(req)}`, LIMIT, WINDOW, now) || !allow(`mac-email:${email}`, LIMIT, WINDOW, now)) {
    return {status: 429, body: WAIT};
  }
  const token = sign({typ: 'mac-magic', email, challenge: req.challenge,
    nonce: crypto.randomBytes(16).toString('base64url'), exp: Math.floor((now + MAGIC_TTL_MS) / 1000)}, deps.env.SESSION_SECRET);
  const url = `${siteUrl(deps.env)}/api/mac/auth/verify?token=${encodeURIComponent(token)}`;
  try {
    await sendMagicLink({to: email, url, env: deps.env, fetchImpl: deps.fetchImpl, log: deps.log, mac: true});
  } catch (error) {
    deps.log(`[clearframe] Mac sign-in email failed: ${error.code || 'error'}`);
    return {status: 503, body: {ok: false, message: 'Sign-in email could not be sent. Try again later.'}};
  }
  return {status: 200, body: {ok: true, message: 'Check your email and open the link on this Mac.'}};
}

function verifyMacLink(token, env) {
  const payload = verify(token, env.SESSION_SECRET);
  return payload?.typ === 'mac-magic' && payload.email && CHALLENGE.test(payload.challenge) ? payload : null;
}

function exchangeMacLink(token, verifier, env, now = Date.now()) {
  const payload = verifyMacLink(token, env);
  if (!payload || typeof verifier !== 'string' || verifier.length < 32 || verifier.length > 256) return null;
  const actual = crypto.createHash('sha256').update(verifier).digest();
  const expected = Buffer.from(payload.challenge, 'base64url');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(actual, expected)) return null;
  return sign({typ: 'mac-session', email: payload.email, iat: Math.floor(now / 1000),
    exp: Math.floor((now + SESSION_TTL_MS) / 1000)}, env.SESSION_SECRET);
}

function readMacSession(req, env) {
  const auth = req.headers?.authorization || '';
  const payload = verify(auth.startsWith('Bearer ') ? auth.slice(7) : '', env.SESSION_SECRET);
  return payload?.typ === 'mac-session' && emailOf(payload.email) ? payload : null;
}

async function macAccount(req, deps) {
  const session = readMacSession(req, deps.env);
  if (!session) return {status: 401, body: {signedIn: false}};
  try {
    const result = await entitlement(session.email, deps);
    return {status: 200, body: {signedIn: true, email: session.email, pro: !!result.paid}};
  } catch {
    return {status: 503, body: {signedIn: true, email: session.email, pro: null, message: 'Account status is temporarily unavailable.'}};
  }
}

module.exports = {requestMacLink, verifyMacLink, exchangeMacLink, readMacSession, macAccount};
