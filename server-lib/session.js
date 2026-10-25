const {verify, magicToken, sessionToken, sign, MAGIC_TTL_MS} = require('./tokens');
const {entitlement} = require('./polar');
const {allow} = require('./rate-limit');
const {sendMagicLink} = require('./email');
const {GENERIC, WAIT, cookies, clientIp, siteUrl, secureCookie, setCookie, clearCookie, emailOf, readUsed} = require('./http');

const DAY = 24 * 60 * 60;
const WINDOW = 15 * 60 * 1000;
const LIMIT = 5;

async function issueSession(email, customerId, deps, now, recheckAt) {
  const until = Number.isFinite(recheckAt) ? Math.floor(recheckAt / 1000) : undefined;
  return sessionToken({email, customerId, secret: deps.env.SESSION_SECRET, now, checkedAt: Math.floor(now / 1000), until});
}

function grantIsFresh(payload, now) {
  // ent is the last successful check. A grant is reused for 24 hours, except a
  // past_due grant: until is its grace deadline, and the cookie is not trusted
  // at or after that instant. Active and trialing grants have no until.
  if (now / 1000 - Number(payload.ent || 0) >= DAY) return false;
  const until = Number(payload.until);
  return !Number.isFinite(until) || now / 1000 < until;
}

async function resolveSession(req, deps, now = Date.now()) {
  const token = cookies(req).cf_session;
  const payload = verify(token, deps.env.SESSION_SECRET);
  if (!payload || payload.typ !== 'session' || !payload.email) return {ok: false};
  if (grantIsFresh(payload, now)) return {ok: true, payload};
  try {
    const result = await entitlement(payload.email, {...deps, now});
    if (!result.paid) return {ok: false, clear: true};
    const refreshed = await issueSession(payload.email, result.customerId, deps, now, result.recheckAt);
    return {ok: true, payload: verify(refreshed, deps.env.SESSION_SECRET), refreshed};
  } catch {
    return {ok: false};
  }
}

function sessionHeaders(req, deps, value, extra = []) {
  const secure = secureCookie(req, deps.env);
  const cookiesOut = [setCookie('cf_session', value, {maxAge: 30 * DAY, secure}), ...extra];
  return {'Set-Cookie': cookiesOut};
}

async function requestLink(req, deps) {
  const now = deps.now || Date.now();
  const email = emailOf(req.email);
  if (!email) return {status: 400, body: {ok: false, message: 'Enter an email address.'}};
  const ip = clientIp(req);
  if (!allow(`ip:${ip}`, LIMIT, WINDOW, now) || !allow(`email:${email}`, LIMIT, WINDOW, now)) {
    return {status: 429, body: WAIT};
  }
  try {
    const result = await entitlement(email, deps);
    if (result.paid) {
      const token = magicToken({email, secret: deps.env.SESSION_SECRET, now});
      const url = `${siteUrl(deps.env)}/api/auth/verify?token=${encodeURIComponent(token)}`;
      await sendMagicLink({to: email, url, env: deps.env, fetchImpl: deps.fetchImpl, log: deps.log});
    }
  } catch (error) {
    deps.log(`[clearframe] sign-in lookup failed: ${error.code || 'error'}`);
  }
  return {status: 200, body: GENERIC};
}

async function redeemLink(req, deps) {
  const now = deps.now || Date.now();
  const secret = deps.env.SESSION_SECRET;
  const secure = secureCookie(req, deps.env);
  const fail = () => ({status: 302, headers: {Location: `${siteUrl(deps.env)}/signin?error=1`}});
  const payload = verify(req.token, secret);
  if (!payload || payload.typ !== 'magic' || !payload.email || !payload.nonce) return fail('token');
  const used = readUsed(cookies(req).cf_used, secret);
  if (used.includes(payload.nonce)) return fail('used');
  let result;
  try { result = await entitlement(payload.email, deps); }
  catch { return fail('lookup'); }
  if (!result.paid) return fail('unpaid');
  const session = await issueSession(payload.email, result.customerId, deps, now, result.recheckAt);
  const usedToken = sign({typ: 'used', nonces: [...used, payload.nonce].slice(-20), exp: Math.floor((now + MAGIC_TTL_MS) / 1000)}, secret);
  return {
    status: 302,
    headers: {
      Location: `${siteUrl(deps.env)}/account`,
      'Set-Cookie': [
        setCookie('cf_session', session, {maxAge: 30 * DAY, secure}),
        setCookie('cf_used', usedToken, {maxAge: Math.ceil(MAGIC_TTL_MS / 1000), secure})
      ]
    }
  };
}

function clearSession(req, deps) {
  const secure = secureCookie(req, deps.env);
  return {status: 200, body: {ok: true}, headers: {'Set-Cookie': [clearCookie('cf_session', secure)]}};
}

module.exports = {resolveSession, requestLink, redeemLink, clearSession, sessionHeaders, GENERIC};
