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

Removing an EXIF block also removes orientation and embedded thumbnail data. Removing display metadata can change appearance. Removing Content Credentials can invalidate provenance. The app does not decode every individual EXIF field, verify signatures, remove visible content, or remove filesystem timestamps from a saved file.

## Store preparation

The Xcode target has App Sandbox and user-selected read/write file access. Automatic signing is enabled, with no developer team or certificates set. Before distribution:

1. Confirm the bundle identifier in the target settings and select the appropriate Apple Developer team.
2. Create the app record, screenshots, privacy details, category, and subscription in App Store Connect.
3. Add a `ClearFrameProProductID` string to the target's Info settings for the actual StoreKit product. `ProStore` is a purchase and entitlement boundary; its UI and feature gating are intentionally not enabled until that product is configured and tested.
4. Decide whether and how existing web Pro subscribers can access Mac features under App Store policy. No Polar credentials or web entitlement calls are included.
5. Run archive, sandboxed file access, StoreKit sandbox purchase/restore, and App Store validation on a signed build.

This first native build supports JPEG and PNG. The web app's WebP, GIF, HEIC, AVIF, TIFF, and RAW formats still need native engines and preservation tests before they can be advertised in the Mac app.
