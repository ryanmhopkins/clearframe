// Verified against Polar's public API docs (docs.polar.sh), not called from tests:
// GET /v1/customers/?organization_id=&email= filters by exact email (customers:read).
// GET /v1/orders/?organization_id=&product_id=&customer_id=&status=paid (orders:read).
// Order status values include paid, refunded, and partially_refunded. Only status paid counts.
// POST /v1/customer-sessions/ with {customer_id} returns customer_portal_url (customer_sessions:write).

const API = 'https://api.polar.sh';

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

async function customerForEmail(email, deps) {
  const params = new URLSearchParams({organization_id: deps.env.POLAR_ORG_ID, email});
  const data = await polar(`/v1/customers/?${params}`, deps);
  return (data.items || []).find(item => String(item.email || '').toLowerCase() === email.toLowerCase()) || null;
}

async function entitlement(email, deps) {
  requireConfig(deps.env);
  const customer = await customerForEmail(email, deps);
  if (!customer) return {paid: false};
  const params = new URLSearchParams({
    organization_id: deps.env.POLAR_ORG_ID,
    product_id: deps.env.POLAR_PRODUCT_ID,
    customer_id: customer.id,
    status: 'paid'
  });
  const data = await polar(`/v1/orders/?${params}`, deps);
  const paid = (data.items || []).some(order => order.status === 'paid' && order.paid !== false);
  return paid ? {paid: true, customerId: customer.id} : {paid: false, customerId: customer.id};
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
