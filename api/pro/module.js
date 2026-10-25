const fs = require('fs');
const path = require('path');
const {resolveSession, sessionHeaders} = require('../../server-lib/session');
const {send, clearCookie, secureCookie} = require('../../server-lib/http');

const FILES = {
  'pro.js': '_pro.js',
  'pro-worker.mjs': '_pro-worker.mjs'
};

function readBundled(diskName) {
  if (diskName === '_pro.js') return fs.readFileSync(path.join(__dirname, 'files', '_pro.js'), 'utf8');
  if (diskName === '_pro-worker.mjs') return fs.readFileSync(path.join(__dirname, 'files', '_pro-worker.mjs'), 'utf8');
  return null;
}

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
  const source = deps.files?.[name] || readBundled(name);
  const headers = {
    'Content-Type': 'application/javascript; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...(session.refreshed ? sessionHeaders(req, resolved, session.refreshed) : {})
  };
  send(res, 200, source, headers);
}

module.exports = handler;
