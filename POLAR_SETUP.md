# Polar production setup

This integration uses the live Polar organization `clearframe` and `https://getclearframe.app`. No test purchase has been made.

## Current state

- Existing ClearFrame Pro product: `f89c5925-7362-40aa-9ce3-e69ff81005b5`.
- Polar reports that product as a **one-time $15 purchase**, not a $15/year subscription. Pro authorization checks for an active subscription. Resolve the product and existing-customer migration before using the new checkout in public navigation.
- Webhook endpoint: `52dc487e-ccca-4dfc-bc8e-00ffaf786727`, targeting `https://getclearframe.app/api/webhook/polar`, with API version `2026-10` and `order.paid` and `customer.state_changed` events. Its signing secret was saved only to the ignored local `.env`.
- The existing hosted checkout link and existing portal route remain in place. Polar also hosts the customer portal and emails customers a link.

## Files

- `server-lib/polar-client.js` holds the shared SDK client.
- `api/checkout.js` creates a hosted checkout and `vercel.json` maps `/checkout` to it.
- `api/webhook/polar.js` verifies the raw signed request and has explicit TODOs for paid-order and customer-state reconciliation.
- `tests/polar-routes.test.js` checks checkout validation and webhook verification behavior. Existing subscription and function-count tests were updated.
- `package.json`, `package-lock.json`, `.env.example`, and `README.md` record the dependency and configuration.

## Environment

Set `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER`, `POLAR_ORG_ID`, `POLAR_PRODUCT_ID`, and `SITE_URL` in Vercel before deploying. The local `.env` is ignored by Git and is not transferred to Vercel. Use `production` for `POLAR_SERVER`. The SDK requires Node.js 22 or newer. The webhook secret must match the endpoint above.

## Verify before merging

- [ ] Confirm the $15/year Polar subscription product and how existing one-time buyers keep Pro access. Update `POLAR_PRODUCT_ID` and the public upgrade links together if the product changes.
- [ ] Configure the Vercel environment keys and deploy these routes before expecting webhook deliveries.
- [ ] Verify `/checkout?products=f89c5925-7362-40aa-9ce3-e69ff81005b5` redirects to Polar. This currently selects the one-time product and is for route verification only.
- [ ] Send a signed Polar webhook test to `/api/webhook/polar`; an invalid signature must receive 403.
- [ ] Run `npm ci` and `npm test`.
- [ ] Decide how paid events map to app users and implement durable, idempotent access reconciliation. The webhook handlers currently acknowledge events but do not grant Pro access; the existing subscription lookup remains the access check.

For local routing, use `npx vercel dev`; a static file server does not run the API functions. Do not use a real charge for testing. A 100% discount code can be entered on Polar checkout after the annual product is resolved; no new production discount was created during this setup.
