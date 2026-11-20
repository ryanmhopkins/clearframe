# ClearFrame growth operations

## Offer and customer

A browser-based photo metadata cleaner for photographers preparing repeated public or client deliveries. Free supports common formats and 10 photo downloads per local day. Pro is $29/year for folders, presets, supported RAW formats, and unlimited downloads. Preserve existing pricing and format limitations.

## Acquisition

- Primary entry page: https://getclearframe.app/batch-remove-photo-metadata
- Free activation: choose photos, review metadata, export a cleaned copy.
- Upgrade: existing Polar checkout, followed by email sign-in.
- Owned distribution: project README and the creator's portfolio.
- Use descriptive source/medium/campaign tags on public links. Do not put personal details in URL parameters.
- Publish useful, original workflow material. Avoid duplicate landing pages, invented testimonials, fake engagement, or bulk unsolicited messages. Follow each community's promotion rules.

## Measurement

The operating target is $365/year in net contribution, averaged over time. Annual payments are cash receipts, not monthly recurring revenue. At $29/year, one sale contributes $2.42/month in gross normalized subscription revenue while active. Use actual processor fees, refunds, and attributable operating costs before claiming profit. A target of 15 new annual sales per month is an experiment, not a forecast. Do not infer traffic or sales from a working website.

The existing anonymous analytics tracks allowlisted landing-page paths, scans, exports, and checkout starts. Pricing and batch-guide checkout clicks use the existing `pricing` placement. It never receives photo bytes or filenames. Checkout starts are not purchases. Paid orders and refunds must be verified from the payment provider or its receipts; report unknown when access is missing.

## Operating loop

1. Check production home, pricing, batch guide, and sign-in. Check the actual configured product checkout sparingly; an unparameterized `/checkout` deliberately returns 400.
2. Check repository deployment status and CI. Fix observed regressions before adding acquisition work.
3. Review available, authorized conversion and paid-order evidence. Keep gross sales, fees, refunds, and normalized revenue separate.
4. Ship one concrete free acquisition or conversion improvement based on the largest observed gap. Verify claims against current implementation. Keep a durable record in Git history.
5. Use branches and PRs; run relevant tests, merge when passing, and verify the deployed result. No force pushes.
6. Spend no money and introduce no new recurring charges. Do not change billing configuration or expose credentials. Escalate only a demonstrated access or identity task that cannot be completed automatically.

## Initial verification

The public production upgrade link reached a Polar-hosted checkout displaying ClearFrame Pro at $29/year. This verifies checkout availability, not payment settlement, post-payment email delivery, or customer activation. No real purchase was made and no revenue baseline has been verified.

## 2026-11-14 — Activation clarity

Production home, pricing, sign-in, and batch guide returned HTTP 200; latest main CI passed. The post-checkout note incorrectly implied an email was already sent, although the request endpoint only sends after form submission. Corrected that instruction, documented the verified 15-minute single-use link behavior, and added recovery/support paths. No billing or authentication behavior changed. Revenue, refunds, fees, costs and conversion counts remain unknown; a limited Polar receipt search returned no matching messages, which is not proof of zero sales. Checkout was verified on November 13; do not create another session before November 20 unless diagnosing a reported failure. External channel access remains blocked as previously documented; no account checks or promotional submissions were repeated.

## 2026-11-15 — Try without a personal photo

Added a locally generated synthetic sample with explicitly fictional EXIF author/description/software fields. Visitors can inspect and clean it through the same scanner and download flow; sample exports retain the existing daily allowance. No external service, new cost, real customer image, or special paid access is involved. Hypothesis: a sample lowers the effort of first use; conversion impact remains unmeasured. All four entry pages returned HTTP 200. No matching recent Polar receipts were found; paid revenue, refunds, processor fees, attributable costs and net profit remain unknown. External account checks were not repeated.

## 2026-11-16 — Exclude built-in demo activity

The synthetic sample initially emitted the same scan/export events as visitor-supplied photos. Exclude only the in-memory file objects created by the sample entry point from scan/export telemetry, including mixed ZIP batches. Do not inspect or transmit filenames to classify samples. Normal files with the same filename still count, and sample exports still use the ordinary download allowance. Existing historical events cannot distinguish demos and must not be treated as confirmed customer activation. No new telemetry fields or identifiers are introduced. This improves measurement correctness, not demonstrated conversion. Recent receipt lookup returned no matches; revenue, refunds, actual fees, attributable costs and profit remain unknown. External channel access was not retried.

## 2026-11-17 — Visitor-initiated sharing

Added a share control to the cleaner: a user gesture opens the device share sheet where supported, otherwise copies the fixed public homepage URL. If copying fails, a selected read-only link supports manual copying. Canceling the share sheet performs no fallback copy. No photo bytes, metadata, current query parameters, account data or new analytics events are included. This enables visitor referrals without access to the owner's social accounts; no referral results are claimed. Latest main CI passed; public entry pages checked. Recent Polar receipt lookup returned no matches, leaving revenue, refunds, fees, costs and profit unknown. No checkout session or blocked marketing account was retried.

## 2026-11-18 — Owned-site walkthrough

Published https://ryanmhopkins.com/clearframe-walkthrough.html and linked it from the maker homepage (portfolio PR #3). The article identifies the maker relationship and explains the fictional sample, cleaning, verification, limitations and current plans. Deployment and live links were verified. No external submission or conversion gain was claimed.

## 2026-11-19 — Repeatable production checks

Added `npm run check:live`: twelve bounded, read-only production page/asset checks with timeouts, content-type and content markers, plus sign-in noindex verification. Run it during future operating checks; it does not schedule work, create checkout sessions, submit forms, upload photos or ingest analytics. A failure is a diagnostic signal, not proof the site is down; retry a transient failure once and investigate. Latest main CI passed and entry pages returned 200. Recent Polar receipt lookup returned no matches; gross receipts, refunds, actual fees, attributable costs and net profit remain unknown. PostHog was discovered as an available but unconnected integration; access is still required before reading conversion results. External marketing-account checks were not repeated.

## 2026-11-20 — Plan comparison clarity

Replaced separate Free/Pro feature lists with a responsive semantic comparison table. Distinguish free multi-file/ZIP exports from Pro folder selection and saved presets; show common/extended formats, exact supported RAW formats, download limits and account requirements together. Preserve $29/year checkout, annual renewal and cancellation copy. This is a clarity experiment, not evidence of higher conversion. Production checks and latest main CI passed. Recent Polar receipt search found no matches; revenue, refunds, processor fees, attributable costs and profit remain unknown. No marketing-account retries or new costs.

Weekly checkout check on November 20: configured product endpoint returned HTTP 302 to an approved Polar host. No payment was submitted. Next routine checkout check is November 27; checkout availability is not payment settlement or activation verification.
