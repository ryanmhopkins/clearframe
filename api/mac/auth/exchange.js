const {exchangeMacLink} = require('../../../server-lib/mac-auth');
const {readJson, send} = require('../../../server-lib/http');

module.exports = async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return send(res, 405, {ok: false});
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, {ok: false}); }
  const session = exchangeMacLink(body.token, body.verifier, {...process.env, ...(deps.env || {})}, deps.now || Date.now());
  if (!session) return send(res, 401, {ok: false, message: 'Sign-in link could not be verified.'});
  send(res, 200, {ok: true, session});
};
