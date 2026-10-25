const {verify} = require('./tokens');

const GENERIC = {ok: true, message: 'If this email has a ClearFrame Pro subscription, a sign-in link is on its way.'};
const WAIT = {ok: false, message: 'Please wait a few minutes and try again.'};
const EMAIL_ERROR = {ok: false, message: 'Enter an email address.'};
const LINK_ERROR = 'That sign-in link is invalid or expired.';

function readJson(req, limit = 10000) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) reject(Object.assign(new Error('too large'), {code: 'size'}));
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch { reject(Object.assign(new Error('bad json'), {code: 'json'})); }
    });
    req.on('error', reject);
  });
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  const final = {'Cache-Control': 'no-store', ...headers};
  if (body && typeof body === 'object') final['Content-Type'] = final['Content-Type'] || 'application/json; charset=utf-8';
  for (const [key, value] of Object.entries(final)) res.setHeader(key, value);
  res.end(body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body));
}

function cookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function siteUrl(env) {
  return String(env.SITE_URL || '').replace(/\/$/, '');
}

function secureCookie(req, env) {
  if (req.headers?.['x-forwarded-proto'] === 'https') return true;
  return siteUrl(env).startsWith('https://');
}

function setCookie(name, value, {maxAge, secure}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax', 'HttpOnly', `Max-Age=${maxAge}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function clearCookie(name, secure) {
  return setCookie(name, '', {maxAge: 0, secure});
}

function emailOf(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return '';
  return email;
}

function readUsed(token, secret) {
  const payload = verify(token, secret);
  if (!payload || payload.typ !== 'used' || !Array.isArray(payload.nonces)) return [];
  return payload.nonces.filter(item => typeof item === 'string');
}

module.exports = {
  GENERIC, WAIT, EMAIL_ERROR, LINK_ERROR,
  readJson, send, cookies, clientIp, siteUrl, secureCookie, setCookie, clearCookie, emailOf, readUsed
};
