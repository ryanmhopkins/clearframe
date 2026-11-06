const {verifyMacLink} = require('../../../server-lib/mac-auth');
const {send} = require('../../../server-lib/http');

module.exports = function handler(req, res, deps = {}) {
  if (req.method !== 'GET') return send(res, 405, '');
  const token = new URL(req.url || '/', 'http://localhost').searchParams.get('token') || '';
  if (!verifyMacLink(token, {...process.env, ...(deps.env || {})})) {
    return send(res, 400, 'This ClearFrame sign-in link is invalid or expired.');
  }
  send(res, 302, '', {Location: `clearframe://auth?token=${encodeURIComponent(token)}`, 'Referrer-Policy': 'no-referrer'});
};
