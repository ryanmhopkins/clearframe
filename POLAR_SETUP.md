# Polar production setup

This integration uses the live Polar organization `clearframe` and `https://getclearframe.app`. No test purchase has been made.

## Current state

- ClearFrame Pro annual product: `be456dd9-4508-4b3a-a517-60fae3c9747b`, $29 USD per year. Polar confirmed it has one recurring price.
- Previous product: `f89c5925-7362-40aa-9ce3-e69ff81005b5`, a one-time $15 purchase. Polar reported zero orders and subscriptions for it when the annual product was created. Keep it available until the new checkout is deployed, then archive it to prevent future purchases through the stale hosted link.
- Webhook endpoint: `52dc487e-ccca-4dfc-bc8e-00ffaf786727`, targeting `https://getclearframe.app/api/webhook/polar`, with API version `2026-10` and `order.paid` and `customer.state_changed` events. Its signing secret was saved only to the ignored local `.env`.
- Public upgrade links now use the new annual product through `/checkout`. The existing portal route remains in place. Polar also hosts the customer portal and emails customers a link.

## Files

- `server-lib/polar-client.js` holds the shared SDK client.
- `api/checkout.js` creates a hosted checkout and `vercel.json` maps `/checkout` to it.
- `api/webhook/polar.js` verifies the raw signed request and has explicit TODOs for paid-order and customer-state reconciliation.
- `tests/polar-routes.test.js` checks checkout validation and webhook verification behavior. Existing subscription and function-count tests were updated.
- `package.json`, `package-lock.json`, `.env.example`, and `README.md` record the dependency and configuration.

## Environment

Production Vercel now has `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER`, `POLAR_ORG_ID`, `POLAR_PRODUCT_ID`, and `SITE_URL`. The local `.env` is ignored by Git and is not transferred to Vercel. `POLAR_SERVER` is `production`. The SDK requires Node.js 22 or newer. The webhook secret matches the endpoint above.

## Verify before merging

- [x] Confirm the $29/year product and update `POLAR_PRODUCT_ID` in source examples, tests, and public upgrade links. Polar reported no purchases of the old product.
- [x] Set the production Vercel `POLAR_PRODUCT_ID` to `be456dd9-4508-4b3a-a517-60fae3c9747b` and configure the other Polar environment keys.
- [ ] Deploy these routes before expecting webhook deliveries.
- [ ] Verify `/checkout?products=be456dd9-4508-4b3a-a517-60fae3c9747b` redirects to Polar and shows $29/year.
- [ ] Send a signed Polar webhook test to `/api/webhook/polar`; an invalid signature must receive 403.
- [ ] Run `npm ci` and `npm test`.
- [ ] Decide how paid events map to app users and implement durable, idempotent access reconciliation. The webhook handlers currently acknowledge events but do not grant Pro access; the existing subscription lookup remains the access check.
- [ ] Archive the old one-time product after the annual checkout is live.

For local routing, use `npx vercel dev`; a static file server does not run the API functions. Do not use a real charge for testing. A 100% discount code can be entered on Polar checkout; no new production discount was created during this setup.
