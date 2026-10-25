const fs = require('fs');
const path = require('path');
const {resolveSession, sessionHeaders} = require('../lib/session');
const {send, clearCookie, secureCookie} = require('../lib/http');

const FILES = {
  'pro.js': 'pro.js',
  'pro-worker.mjs': 'pro-worker.mjs'
};

async function handler(req, res, deps = {}) {
  const env = {...process.env, ...(deps.env || {})};
  const url = new URL(req.url || '/', 'http://localhost');
  const name = FILES[url.searchParams.get('name')];
  if (!name) return send(res, 404, '');
  const resolved = {env, fetchImpl: deps.fetchImpl || fetch, log: deps.log || console.log};
  const session = await resolveSession(req, resolved, deps.now);
  if (!session.ok) {
    const headers = session.clear ? {'Set-Cookie': [clearCookie('cf_session', secureCookie(req, env))]} : {};
    return send(res, 401, '', headers);
  }
  const source = deps.files?.[name] || fs.readFileSync(path.join(__dirname, 'files', name), 'utf8');
  const headers = {
    'Content-Type': 'application/javascript; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...(session.refreshed ? sessionHeaders(req, resolved, session.refreshed) : {})
  };
  send(res, 200, source, headers);
}

module.exports = handler;
