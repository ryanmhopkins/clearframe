# ClearFrame for macOS

A separate native SwiftUI client. The root web app and its deployment are unchanged.

## Open and run

Open `ClearFrame.xcodeproj` in Xcode 26 or later and choose the ClearFrame scheme. The app targets macOS 14 or later. For a local unsigned build:

```sh
xcodebuild -project macos/ClearFrame.xcodeproj -scheme ClearFrame -configuration Debug -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build
```

## Current behavior

- Drag in or choose JPEG and PNG files, up to 256 MB each.
- Scan complete metadata blocks and choose which to remove per photo.
- Apply a preset across the batch. Private details is the default; color and provenance data stay selected for retention by default.
- Clean locally without re-encoding image content. Save one photo or a batch to a chosen folder. Originals are never overwritten.
- Re-scan each output before presenting it for saving. A failed photo is shown as an error.
- First-run onboarding accepts free or existing web Pro accounts through an emailed link. The account token and pending device secret are stored in Keychain; photos and metadata are never sent to the account service.
- Free users can save 10 individual photos per local day. Pro unlocks unlimited exports, batch save, and advanced presets.
- StoreKit 2 offers monthly and annual subscriptions and a Restore Purchases action. Existing paid web accounts are checked by the new Mac account endpoint.

Removing an EXIF block also removes orientation and embedded thumbnail data. Removing display metadata can change appearance. Removing Content Credentials can invalidate provenance. The app does not decode every individual EXIF field, verify signatures, remove visible content, or remove filesystem timestamps from a saved file.

## Store preparation

The Xcode target has App Sandbox, user-selected read/write file access, and outgoing network access for account status and StoreKit. Automatic signing is enabled, with no developer team or certificates set. Before distribution:

1. Confirm the bundle identifier in the target settings and select the appropriate Apple Developer team.
2. Create the app record, screenshots, privacy details, and category in App Store Connect. Create one auto-renewable subscription group with `app.getclearframe.mac.pro.monthly` at **US $3/month** and `app.getclearframe.mac.pro.annual` at **US $29/year**. Set prices for other storefronts as desired. These IDs are proposed identifiers in `Info.plist`; confirm they are available before release.
3. Deploy the new `/api/mac/*` endpoints before testing email sign-in against the live site. They use the existing `SESSION_SECRET`, email sender, and Polar configuration. The existing web sign-in and checkout routes are unchanged.
4. Test a real free email sign-in and an existing paid web account. The emailed link must be opened on the Mac that requested it. The custom `clearframe://auth` callback is verified against that Mac's pending secret. This sign-in does not create a web session or a Polar subscription.
5. Test both StoreKit products, restore, renewals, cancellations, and expiration in App Store Connect sandbox. App Store purchases currently unlock the **Mac app only**; syncing them to the web account requires a separate verified server integration.
6. Run archive, sandboxed file access, and App Store validation on a signed build. Supply App Review with a working account or demo mode and full subscription test access.

This first native build supports JPEG and PNG. The web app's WebP, GIF, HEIC, AVIF, TIFF, and RAW formats still need native engines and preservation tests before they can be advertised in the Mac app.
