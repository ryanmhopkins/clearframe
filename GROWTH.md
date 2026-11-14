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
