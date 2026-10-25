const {resolveSession, sessionHeaders} = require('../../server-lib/session');
const {send, clearCookie, secureCookie} = require('../../server-lib/http');

async function handler(req, res, deps = {}) {
  const env = {...process.env, ...(deps.env || {})};
  const resolved = {...deps, env, fetchImpl: deps.fetchImpl || fetch, log: deps.log || console.log};
  const session = await resolveSession(req, resolved, deps.now);
  if (!session.ok) {
    const headers = session.clear ? {'Set-Cookie': [clearCookie('cf_session', secureCookie(req, env))]} : {};
    return send(res, 401, {signedIn: false}, headers);
  }
  const headers = session.refreshed ? sessionHeaders(req, resolved, session.refreshed) : {};
  send(res, 200, {signedIn: true, pro: true, email: session.payload.email}, headers);
}

module.exports = handler;
