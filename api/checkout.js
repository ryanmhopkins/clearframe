const {polarClient} = require('../server-lib/polar-client');
const {send} = require('../server-lib/http');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function handler(req, res, deps = {}) {
  if (req.method !== 'GET') return send(res, 405, {ok: false});
  const url = new URL(req.url, 'https://getclearframe.app');
  const products = url.searchParams.getAll('products');
  if (products.length !== 1 || !UUID.test(products[0]) || products[0] !== process.env.POLAR_PRODUCT_ID) {
    return send(res, 400, {ok: false, message: 'Invalid product.'});
  }
  try {
    const checkout = await (deps.polar || polarClient()).checkouts.create({products});
    const destination = new URL(checkout.url);
    if (destination.protocol !== 'https:' || destination.hostname !== 'buy.polar.sh') throw new Error('Invalid checkout URL');
    send(res, 302, '', {Location: destination.toString()});
  } catch {
    send(res, 502, {ok: false, message: 'Checkout is temporarily unavailable.'});
  }
}

module.exports = handler;
