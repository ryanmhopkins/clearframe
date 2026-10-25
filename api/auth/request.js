const {requestLink} = require('../../server-lib/session');
const {readJson, send} = require('../../server-lib/http');

async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return send(res, 405, {ok: false, message: 'Enter an email address.'});
  let body;
  try { body = await readJson(req); }
  catch { return send(res, 400, {ok: false, message: 'Enter an email address.'}); }
  const result = await requestLink({...req, email: body.email}, {
    env: process.env,
    fetchImpl: fetch,
    log: console.log,
    now: Date.now(),
    ...deps
  });
  send(res, result.status, result.body);
}

module.exports = handler;
