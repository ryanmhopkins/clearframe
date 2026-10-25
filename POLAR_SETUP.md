# Polar production setup

This integration uses the live Polar organization `clearframe` and `https://getclearframe.app`. No test purchase has been made.

## Current state

- ClearFrame Pro annual product: `be456dd9-4508-4b3a-a517-60fae3c9747b`, $29 USD per year. Polar confirmed it has one recurring price.
- Previous product: `f89c5925-7362-40aa-9ce3-e69ff81005b5`, a one-time $15 purchase. Polar reported zero orders and subscriptions for it immediately before it was archived on 2026-10-25.
- Webhook endpoint: `52dc487e-ccca-4dfc-bc8e-00ffaf786727`, targeting `https://getclearframe.app/api/webhook/polar`, with API version `2026-10` and `order.paid` and `customer.state_changed` events. Its signing secret was saved only to the ignored local `.env`.
- Public upgrade links now use the new annual product through `/checkout`. The existing portal route remains in place. Polar also hosts the customer portal and emails customers a link.

## Files

- `server-lib/polar-client.js` holds the shared SDK client.
- `api/checkout.js` creates a hosted checkout and `vercel.json` maps `/checkout` to it. When `SITE_URL` is an absolute http(s) origin, the create call sets `success_url` to `{SITE_URL}/signin?subscribed=1`. Polar’s `CheckoutCreate.success_url` is optional. The `{CHECKOUT_ID}` placeholder is also optional (`checkout_id={CHECKOUT_ID}`), and this route does not send it.
- `api/webhook/polar.js` verifies the raw signed request and has explicit TODOs for paid-order and customer-state reconciliation.
- `tests/polar-routes.test.js` checks checkout validation and webhook verification behavior. Existing subscription and function-count tests were updated.
- `package.json`, `package-lock.json`, `.env.example`, and `README.md` record the dependency and configuration.

## Environment

Production Vercel now has `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_SERVER`, `POLAR_ORG_ID`, `POLAR_PRODUCT_ID`, and `SITE_URL`. The local `.env` is ignored by Git and is not transferred to Vercel. `POLAR_SERVER` is `production`. The SDK requires Node.js 22 or newer. The webhook secret matches the endpoint above.

## Rollout and verification

- [x] Confirm the $29/year product and update `POLAR_PRODUCT_ID` in source examples, tests, and public upgrade links. Polar reported no purchases of the old product.
- [x] Set the production Vercel `POLAR_PRODUCT_ID` to `be456dd9-4508-4b3a-a517-60fae3c9747b` and configure the other Polar environment keys.
- [x] Deploy the routes to `https://getclearframe.app` from merged PR #7.
- [x] Verify the home page links to `/checkout?products=be456dd9-4508-4b3a-a517-60fae3c9747b` and the route redirects to Polar. The catalog product is $29/year; no test purchase has been made.
- [x] Verify an invalid webhook signature receives 403 and a locally signed `customer.state_changed` fixture receives 200 from production. No customer data or access state was changed by the fixture.
- [x] Run `npm test` (48 passing).
- [ ] Decide how paid events map to app users and implement durable, idempotent access reconciliation. The webhook handlers currently acknowledge events but do not grant Pro access; the existing subscription lookup remains the access check.
- [x] Archive the old one-time product after the annual checkout went live.
- [ ] Complete a no-charge checkout with the single-use test discount and verify sign-in and Pro access. The discount ID is `d7ee1235-4857-4f42-901b-46f024efebba`; its code is stored only in the ignored local `.env` as `POLAR_TEST_DISCOUNT_CODE`. It expires on 2026-11-01 and discounts the subscription forever, so cancel the test subscription when finished.

For local routing, use `npx vercel dev`; a static file server does not run the API functions. The live checkout route is `https://getclearframe.app/checkout?products=be456dd9-4508-4b3a-a517-60fae3c9747b`. To test without a charge, enter the single-use discount code on the Polar checkout page. A plain checkout link cannot pre-apply it.

## Product id in the HTML links

`api/checkout.js` accepts only `POLAR_PRODUCT_ID`. That same id is hard-coded in the upgrade links in `index.html`, `signin.html`, and `account.html`, and again in the dialog checkout link in `index.html` and `account.html`. There is no build step. Changing `POLAR_PRODUCT_ID` without updating those five `href`s makes the links return 400.
