const {redeemLink} = require('../lib/session');
const {send, siteUrl, clearCookie, secureCookie} = require('../lib/http');

async function handler(req, res, deps = {}) {
  const env = {...process.env, ...(deps.env || {})};
  const url = new URL(req.url || '/', 'http://localhost');
  const result = await redeemLink({...req, token: url.searchParams.get('token') || ''}, {
    env,
    fetchImpl: fetch,
    log: console.log,
    now: Date.now(),
    ...deps,
    env
  });
  const headers = {...(result.headers || {})};
  if (result.clear) {
    headers['Set-Cookie'] = [clearCookie('cf_session', secureCookie(req, env)), ...(headers['Set-Cookie'] || [])];
  }
  if (!headers.Location) headers.Location = `${siteUrl(env)}/signin?error=1`;
  send(res, result.status || 302, '', headers);
}

module.exports = handler;
