// Verified against @polar-sh/sdk 1.0.2 (API version 2026-10) and Polar's public docs.
// Not called from tests.
//
// Customers: customers.list query `email` is "Filter by exact email" and `query` is
// "Filter by name, email, or external ID".
// https://polar.sh/docs/api-reference/2026-10/customers/list-customers
// The docs do not say whether `email` is case-insensitive (open question). Sign-in
// already lowercases the address. We compare the whole returned email, ignoring case.
// If the exact filter returns no single match, the documented `query` parameter is
// tried for up to three pages. Only one customer whose entire email equals the
// sign-in address (ignoring case) is accepted. More than one, or an unfinished
// scan, denies access.
//
// Subscriptions: SubscriptionStatus is incomplete | incomplete_expired | trialing |
// active | past_due | canceled | unpaid | paused. There is no status "revoked";
// subscription.revoked is an event and the subscription status becomes canceled
// (https://polar.sh/docs/integrate/webhooks/events). Fields used: status,
// current_period_end, cancel_at_period_end, past_due_at, customer_id, product_id, id.
// past_due_at is "The timestamp when the subscription entered `past_due` status."
// https://polar.sh/docs/api-reference/2026-10/subscriptions/get-subscription
//
// Grace anchor is past_due_at, not current_period_end. Renewal sequences advance
// current_period_start/end before payment succeeds, so when a renewal fails the
// period end can already be the new unpaid period.
// https://polar.sh/docs/integrate/webhooks/events
// past_due access iff now < past_due_at + 24h. Exactly 24h denies. A missing
// past_due_at denies (UNKNOWN; current_period_end is not used). past_due still uses
// only that window when current_period_end is in the future.
//
// Orders: orders.list filters organization_id, product_id, customer_id.
// https://polar.sh/docs/api-reference/orders/list-orders
// OrderStatus includes paid, refunded, and partially_refunded. Order.refunded_amount
// is "Amount refunded in cents." Order.refunded_tax_amount is "Sales tax refunded
// in cents." The current payment is the newest settled order for that subscription
// (not draft, pending, or void). status refunded|partially_refunded, refunded_amount
// > 0, or refunded_tax_amount > 0 revokes access even if the subscription is still active.
// An older refunded order does not revoke once a newer settled order is paid and
// not refunded. refunds.list is not called: a pending refund that has not yet changed
// the order is UNKNOWN and does not revoke. An incomplete order scan throws, which
// denies that request and leaves the session cookie in place.

const API = 'https://api.polar.sh';
const GRACE_MS = 24 * 60 * 60 * 1000;
const PAGE_LIMIT = 10;

function requireConfig(env) {
  if (!env.POLAR_ACCESS_TOKEN || !env.POLAR_ORG_ID || !env.POLAR_PRODUCT_ID) {
    const error = new Error('Polar is not configured');
    error.code = 'config';
    throw error;
  }
}

async function polar(path, {env, fetchImpl, method = 'GET', body}) {
  const response = await fetchImpl(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
      Accept: 'application/json',
      ...(body ? {'Content-Type': 'application/json'} : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    const error = new Error(`Polar request failed (${response.status})`);
    error.code = 'polar';
    throw error;
  }
  return response.json();
}

function sameEmail(candidate, email) {
  return String(candidate || '').toLowerCase() === String(email || '').toLowerCase();
}

function oneCustomer(items, email) {
  const matched = [];
  for (const item of items) {
    if (!sameEmail(item && item.email, email)) continue;
    if (item.id && matched.some(existing => existing.id === item.id)) continue;
    matched.push(item);
  }
  return matched.length === 1 ? matched[0] : null;
}

async function customerForEmail(email, deps) {
  const normalized = String(email || '').trim().toLowerCase();
  const org = deps.env.POLAR_ORG_ID;
  const exact = await polar(`/v1/customers/?${new URLSearchParams({organization_id: org, email: normalized})}`, deps);
  const direct = oneCustomer(exact.items || [], normalized);
  if (direct) return direct;
  if ((exact.items || []).some(item => sameEmail(item && item.email, normalized))) return null;

  const params = new URLSearchParams({organization_id: org, query: normalized, limit: '100'});
  const found = [];
  let page = 1;
  while (page <= 3) {
    params.set('page', String(page));
    const data = await polar(`/v1/customers/?${params}`, deps);
    const items = data.items || [];
    for (const item of items) {
      if (!sameEmail(item && item.email, normalized)) continue;
      if (item.id && found.some(existing => existing.id === item.id)) continue;
      found.push(item);
    }
    if (found.length > 1) return null;
    const done = items.length < 100 || (data.pagination && data.pagination.max_page <= page);
    if (done) return found.length === 1 ? found[0] : null;
    page++;
  }
  return null;
}

function periodOpen(sub, now) {
  const until = Date.parse(sub.current_period_end || '');
  return Number.isFinite(until) && until > now;
}

function graceDeadline(sub, now) {
  const anchor = Date.parse(sub.past_due_at || '');
  if (!Number.isFinite(anchor)) return null;
  const deadline = anchor + GRACE_MS;
  return now < deadline ? deadline : null;
}

function subscriptionGrants(sub, customer, deps, now) {
  if (!sub || sub.customer_id !== customer.id || sub.product_id !== deps.env.POLAR_PRODUCT_ID) return null;
  if (typeof sub.id !== 'string' || !sub.id) return null;
  if ((sub.status === 'active' || sub.status === 'trialing') && periodOpen(sub, now)) return {sub, recheckAt: null};
  if (sub.status === 'past_due') {
    const recheckAt = graceDeadline(sub, now);
    if (recheckAt != null) return {sub, recheckAt};
  }
  return null;
}

function amountRefunded(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
}

function orderRevokes(order) {
  if (order.status === 'refunded' || order.status === 'partially_refunded') return true;
  return amountRefunded(order.refunded_amount) || amountRefunded(order.refunded_tax_amount);
}

function paymentRevoked(orders, subscriptionId, productId) {
  const settled = orders.filter(order => {
    if (!order || order.subscription_id !== subscriptionId) return false;
    if (order.product_id && order.product_id !== productId) return false;
    return order.status !== 'draft' && order.status !== 'pending' && order.status !== 'void';
  });
  if (!settled.length) return false;
  let newest = -Infinity;
  for (const order of settled) {
    const created = Date.parse(order.created_at || '');
    if (Number.isFinite(created) && created > newest) newest = created;
  }
  if (newest === -Infinity) return true;
  return settled.some(order => Date.parse(order.created_at || '') === newest && orderRevokes(order));
}

async function ordersFor(customerId, deps) {
  const params = new URLSearchParams({
    organization_id: deps.env.POLAR_ORG_ID,
    product_id: deps.env.POLAR_PRODUCT_ID,
    customer_id: customerId,
    sorting: '-created_at',
    limit: '100'
  });
  const orders = [];
  let page = 1;
  while (page <= PAGE_LIMIT) {
    params.set('page', String(page));
    const data = await polar(`/v1/orders/?${params}`, deps);
    const items = data.items || [];
    orders.push(...items);
    if (items.length < 100 || (data.pagination && data.pagination.max_page <= page)) return orders;
    page++;
  }
  const error = new Error('Polar order list incomplete');
  error.code = 'polar';
  throw error;
}

async function entitlement(email, deps) {
  requireConfig(deps.env);
  const customer = await customerForEmail(email, deps);
  if (!customer) return {paid: false};
  const params = new URLSearchParams({
    organization_id: deps.env.POLAR_ORG_ID,
    product_id: deps.env.POLAR_PRODUCT_ID,
    customer_id: customer.id
  });
  const now = deps.now || Date.now();
  const grants = [];
  let page = 1;
  while (page <= PAGE_LIMIT) {
    params.set('page', String(page));
    params.set('limit', '100');
    const data = await polar(`/v1/subscriptions/?${params}`, deps);
    const subscriptions = data.items || [];
    for (const sub of subscriptions) {
      const grant = subscriptionGrants(sub, customer, deps, now);
      if (grant) grants.push(grant);
    }
    if (subscriptions.length < 100 || (data.pagination && data.pagination.max_page <= page)) break;
    page++;
  }
  if (!grants.length) return {paid: false, customerId: customer.id};
  const orders = await ordersFor(customer.id, deps);
  const open = grants.find(grant => !paymentRevoked(orders, grant.sub.id, deps.env.POLAR_PRODUCT_ID));
  if (!open) return {paid: false, customerId: customer.id};
  const result = {
    paid: true,
    customerId: customer.id,
    renewsAt: open.sub.current_period_end,
    cancelAtPeriodEnd: !!open.sub.cancel_at_period_end
  };
  if (open.recheckAt != null) result.recheckAt = open.recheckAt;
  return result;
}

async function portalUrl(customerId, deps) {
  requireConfig(deps.env);
  const data = await polar('/v1/customer-sessions/', {
    ...deps,
    method: 'POST',
    body: {customer_id: customerId, return_url: `${String(deps.env.SITE_URL || '').replace(/\/$/, '')}/account`}
  });
  if (!data.customer_portal_url) {
    const error = new Error('Polar portal URL missing');
    error.code = 'polar';
    throw error;
  }
  return data.customer_portal_url;
}

module.exports = {entitlement, portalUrl};
