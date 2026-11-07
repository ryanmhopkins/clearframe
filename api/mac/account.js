const {macAccount} = require('../../server-lib/mac-auth');
const {send} = require('../../server-lib/http');

module.exports = async function handler(req, res, deps = {}) {
  if (req.method !== 'GET') return send(res, 405, {signedIn: false});
  const result = await macAccount(req, {
    env: {...process.env, ...(deps.env || {})}, fetchImpl: deps.fetchImpl || fetch,
    log: deps.log || console.log, now: deps.now || Date.now()
  });
  send(res, result.status, result.body);
};
