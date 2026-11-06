# ClearFrame

A local-first metadata scanner and selective cleaner for JPEG, PNG, WebP, GIF, HEIC, HEIF, AVIF, and TIFF photos. ClearFrame Pro adds RAW (DNG, CR2, NEF, and ARW), folder cleaning, and presets.

## Interface

A minimal charcoal interface with a single upload area, per-photo cleaning controls, and a separate Photo details tab. Optional credential and display settings expand on demand. Keyboard navigation and reduced-motion preferences are supported.

## Inspect and clean

- View available decoded EXIF, GPS, camera/lens, exposure, date, author, copyright, IPTC, XMP, thumbnail, and ICC tags, alongside basic file information.
- Inventory JPEG application/comment segments, PNG ancillary chunks, WebP metadata/unknown chunks, and trailing data. Unknown or proprietary blocks are listed even when their contents cannot be decoded.
- Select individual metadata blocks, **Select all**, or **Deselect all** for the current image. Selections persist when switching images.
- Download one image or export the batch as a ZIP using each image's selections. Duplicate filenames receive numbered prefixes in ZIP exports.
- Color/display metadata and detected credentials are kept by default. Essential image, transparency, animation, and JPEG Adobe color-transform data are preserved.

JPEG, PNG, WebP, and GIF cleaning operates on whole blocks, not individual EXIF tags. Removing an EXIF block removes all its tags, including GPS, orientation, and embedded thumbnails. Removing orientation or color profiles can change display even though encoded pixels are not recompressed. Removing credentials discards provenance; any metadata edit may invalidate a signature. Credentials are not cryptographically verified.

The scanner does not promise to decode every proprietary tag or detect data hidden in image pixels. Dimensions, encoded image content, file-system dates, and visible content are not removable metadata. JPEG, PNG, WebP, and GIF cleaning removes whole metadata blocks. HEIC, HEIF, AVIF, TIFF, and RAW cleaning removes listed groups and standard fields, and keeps maker notes, calibration, previews, and required rendering data. See [FORMAT-SUPPORT.md](FORMAT-SUPPORT.md).

## Privacy

Scanning and cleaning run in the browser. Photo bytes are not uploaded. Scripts, fonts, JSZip 3.10.1, exifr 7.1.3, and the ExifTool photo engine are served by this site. The page does not load Google Fonts or a public CDN. The photo engine (`vendor/exiftool/zeroperl-mqcadjqm.wasm`, about 25 MB) is already self-hosted. The browser downloads it from this origin only when a HEIC, HEIF, AVIF, TIFF, or RAW file is added.

Opening the site still contacts the host that serves these files. `how-privacy-works.html` states the limits and how to check them in the browser network tab. Plain-language drafts of the privacy policy, terms of use, and contact page are `privacy.html`, `terms.html`, and `contact.html`. The contact address appears only on the contact page.

The free home page does not call `/api` and does not ask anyone to sign in. JPEG, PNG, WebP, GIF, HEIC, HEIF, AVIF, and TIFF cleaning stays in that page. ClearFrame Pro (folder selection, presets with apply-to-all, and RAW) is loaded only after passwordless email sign-in, from `GET /api/pro/module`, which checks the session cookie. Photos and metadata are still not uploaded.

When analytics is on, the browser also sends anonymous counts directly to `https://us.i.posthog.com`. Analytics data is processed in the United States. That request does not include photos, file names, or metadata, and it does not call `/api`. Cleaning a photo still does not upload it. Turning analytics off, or sending Do Not Track, stops the counts, and cleaning then makes no analytics request. While analytics is on, it stores nothing except brief test writes that the library deletes right away. The choice to turn analytics off is stored only after that choice.

## Pro sign-in

Paid customers sign in at `/signin`. The server checks for an active Polar subscription, then emails one sign-in link. The browser talks to this site and, when analytics is on, to `https://us.i.posthog.com` (`connect-src 'self' https://us.i.posthog.com`). Copy `.env.example` to `.env` and set:

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | Signs the 15-minute link and the 30-day session cookie |
| `POLAR_ACCESS_TOKEN` | Production organization access token for customers, subscriptions, checkouts, and customer sessions |
| `POLAR_WEBHOOK_SECRET` | Secret for the verified Polar webhook endpoint |
| `POLAR_SERVER` | Polar SDK environment (`production` for the live site) |
| `POLAR_ORG_ID` | Organization id |
| `POLAR_PRODUCT_ID` | ClearFrame Pro product id |
| `SITE_URL` | Public origin used in the sign-in link, such as `https://getclearframe.app` |
| `EMAIL_API_KEY` | Bearer token for a Resend-compatible `POST /emails` API |
| `EMAIL_FROM` | From address the email API accepts |

When `EMAIL_API_KEY` is unset, the sign-in link is printed in the server log instead of being sent. There is no license-key field. Pro is $29 per year through Polar. The upgrade links open `/checkout`, which creates a hosted checkout for the annual product. Polar hosts billing management. See `POLAR_SETUP.md` for deployment steps.

## Run locally

Open `index.html` in a browser or serve this directory with any static file server:

```sh
python3 -m http.server 8080
```

## Tests

```sh
npm ci
npm test
```

The tests cover metadata inventories, selection persistence and exports, malformed containers, progressive JPEG scans, compressed PNG text, EXIF decoding, WebP sizes/flags, and safe rendering of embedded text. Test-only dependencies are not needed to run the app.

Container references: [PNG specification](https://www.w3.org/TR/png-3/), [WebP specification](https://developers.google.com/speed/webp/docs/riff_container), [exifr](https://github.com/MikeKovarik/exifr).
