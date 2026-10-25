const {webhooks} = require('@polar-sh/sdk/2026-10');
const {send} = require('../../server-lib/http');

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString('utf8');
    if (body.length > 1048576) throw new Error('Webhook too large');
  }
  return body;
}

async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return send(res, 405, {ok: false});
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  if (!secret) return send(res, 503, {ok: false});
  let event;
  try {
    const body = await rawBody(req);
    event = await (deps.validateEvent || webhooks.validateEvent)(body, {
      'webhook-id': req.headers['webhook-id'] || '',
      'webhook-timestamp': req.headers['webhook-timestamp'] || '',
      'webhook-signature': req.headers['webhook-signature'] || ''
    }, secret);
  } catch (error) {
    if (error instanceof webhooks.PolarWebhookUnknownTypeError) return send(res, 202, {received: true});
    return send(res, error instanceof webhooks.PolarWebhookVerificationError ? 403 : 400, {received: false});
  }
  switch (event.type) {
    case 'order.paid':
      // TODO: Reconcile the paid order with the app's customer and access state.
      break;
    case 'customer.state_changed':
      // TODO: Reconcile the customer's current subscription state and Pro access.
      break;
  }
  send(res, 200, {received: true});
}

module.exports = handler;
module.exports.config = {api: {bodyParser: false}};
