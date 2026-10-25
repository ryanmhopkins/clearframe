const {polarClient} = require('../server-lib/polar-client');
const {send, clientIp, siteUrl} = require('../server-lib/http');
const {allow} = require('../server-lib/rate-limit');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORIGIN = /^https?:\/\/[^/?#\s]+$/;
const WINDOW = 15 * 60 * 1000;
const LIMIT = 10;

// Polar's CheckoutCreate.success_url is an optional absolute URI.
// {CHECKOUT_ID} is an optional query placeholder, not required, so this URL
// stays a fixed path and does not carry a checkout id back to the browser.
function successUrl() {
  const site = siteUrl(process.env);
  if (!ORIGIN.test(site)) return '';
  return `${site}/signin?subscribed=1`;
}

async function handler(req, res, deps = {}) {
  if (req.method !== 'GET') return send(res, 405, {ok: false});
  const url = new URL(req.url, 'https://getclearframe.app');
  const products = url.searchParams.getAll('products');
  if (products.length !== 1 || !UUID.test(products[0]) || products[0] !== process.env.POLAR_PRODUCT_ID) {
    return send(res, 400, {ok: false, message: 'Invalid product.'});
  }
  const now = deps.now || Date.now();
  if (!allow(`checkout:${clientIp(req)}`, LIMIT, WINDOW, now)) {
    return send(res, 429, {ok: false, message: 'Please wait a few minutes and try again.'});
  }
  try {
    const body = {products};
    const success = successUrl();
    if (success) body.success_url = success;
    const checkout = await (deps.polar || polarClient()).checkouts.create(body);
    const destination = new URL(checkout.url);
    if (destination.protocol !== 'https:' || !['polar.sh', 'buy.polar.sh'].includes(destination.hostname)) throw new Error('Invalid checkout URL');
    send(res, 302, '', {Location: destination.toString()});
  } catch {
    send(res, 502, {ok: false, message: 'Checkout is temporarily unavailable.'});
  }
}

module.exports = handler;
