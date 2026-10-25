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

## Access check

Pro access is decided in `server-lib/polar.js` when someone asks for a sign-in link, opens that link, or presents a session cookie whose last check is due again. The check does not use webhooks.

- Active or trialing access continues while `current_period_end` is still in the future. Cancel at period end leaves the subscription `active` until that time, and access continues until then.
- A renewal that fails is `past_due`. Access then lasts 24 hours from `past_due_at`, the timestamp Polar gives for when the subscription entered `past_due`. The instant that is 24 hours after `past_due_at` ends access. `current_period_end` is not the grace anchor: Polar moves the billing period forward when a cycle starts, before the renewal payment succeeds, so that timestamp can already be the new unpaid period. If `past_due_at` is missing, access is denied. A `past_due` subscription whose period end is still in the future is still limited to that 24-hour window.
- Every other status, including `canceled`, `unpaid`, `paused`, `incomplete`, and a literal `revoked` value, denies access. Polar's revoke event leaves the subscription `canceled`; there is no separate revoked status.
- A refund removes access even when Polar leaves the subscription active. The check lists orders for the customer and product. The current payment is the newest settled order on that subscription, skipping `draft`, `pending`, and `void`. Access is denied when that order's status is `refunded` or `partially_refunded`, or when `refunded_amount` or `refunded_tax_amount` is greater than 0. A refund of an older order does not remove access after a later settled order is paid and not refunded. No settled order is not treated as a refund. The refunds list is not called.
- Pro files are checked on every request, but the check trusts the signed cookie until it is due again. The cookie is trusted for 24 hours after a successful check (`ent`). A `past_due` grant also stores `until`, the grace deadline in unix seconds, inside that same signed cookie. The next request at or after `until` checks Polar again, so the cookie cannot keep access past the grace end. A refund, a cancellation, or a period ending has no earlier deadline stored, so each is noticed on the next check, at most 24 hours later. A new sign-in checks immediately; a failed sign-in does not clear a cookie that is still inside its trust window. The cookie's `Max-Age` of 30 days rolls forward on each successful check and does not by itself extend a failed check. If Polar returns an error, including an order list that cannot be finished, that request is denied and the cookie is left in place.

## Product id in the HTML links

`api/checkout.js` accepts only `POLAR_PRODUCT_ID`. That same id is hard-coded in the upgrade links in `index.html`, `signin.html`, and `account.html`, and again in the dialog checkout link in `index.html` and `account.html`. There is no build step. Changing `POLAR_PRODUCT_ID` without updating those five `href`s makes the links return 400.
