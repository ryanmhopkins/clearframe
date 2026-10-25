const {resolveSession} = require('../../server-lib/session');
const {portalUrl} = require('../../server-lib/polar');
const {send, siteUrl} = require('../../server-lib/http');

async function handler(req, res, deps = {}) {
  const env = {...process.env, ...(deps.env || {})};
  const resolved = {env, fetchImpl: deps.fetchImpl || fetch, log: deps.log || console.log};
  const session = await resolveSession(req, resolved, deps.now);
  const home = `${siteUrl(env)}/signin?error=1`;
  if (!session.ok || !session.payload.customerId) return send(res, 302, '', {Location: home});
  try {
    const url = await portalUrl(session.payload.customerId, resolved);
    send(res, 302, '', {Location: url});
  } catch {
    send(res, 302, '', {Location: `${siteUrl(env)}/account?portal=1`});
  }
}

module.exports = handler;
