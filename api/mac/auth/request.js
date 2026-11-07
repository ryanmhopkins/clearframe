const {requestMacLink} = require('../../../server-lib/mac-auth');
const {readJson, send} = require('../../../server-lib/http');

module.exports = async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return send(res, 405, {ok: false});
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, {ok: false}); }
  const result = await requestMacLink({...req, email: body.email, challenge: body.challenge}, {
    env: {...process.env, ...(deps.env || {})}, fetchImpl: deps.fetchImpl || fetch,
    log: deps.log || console.log, now: deps.now || Date.now()
  });
  send(res, result.status, result.body);
};
