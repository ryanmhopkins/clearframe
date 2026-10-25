const {clearSession} = require('../../server-lib/session');
const {send} = require('../../server-lib/http');

function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return send(res, 405, {ok: false});
  const env = {...process.env, ...(deps.env || {})};
  const result = clearSession(req, {env});
  send(res, result.status, result.body, result.headers);
}

module.exports = handler;
