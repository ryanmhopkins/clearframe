# Photo format support

ClearFrame cleans JPEG, PNG, WebP and GIF using byte-level container editing.
HEIC/HEIF, AVIF, classic TIFF, DNG, CR2, NEF and ARW use vendored ExifTool 13.59
in a lazily loaded browser worker. The engine download is approximately 25 MB,
served by ClearFrame; image bytes are not uploaded. No runtime npm/CDN dependency
is used for the extended engine. ZIP export uses JSZip 3.10.1 vendored at `vendor/jszip/`. Fonts are self-hosted in `fonts/`. No runtime CDN request is required.

## Removal boundaries

- JPEG/PNG/WebP: existing metadata block selections.
- GIF: comments, XMP, ICC and other non-rendering extensions; preserve palettes,
  image frames, graphics-control blocks, text rendering, transparency and looping.
- Extended formats: GPS, XMP, IPTC, ICC and a conservative allowlist of standard
  personal EXIF fields (author, captions, dates, owner and standard serial numbers).
- RAW maker notes, calibration, previews and proprietary settings remain intact.
  They may contain identifying information. “Select all” means all offered options,
  not every piece of metadata in the file. This is stated in the cleaning UI and FAQ.
- No conversion, re-encoding or pixel watermark removal. Browser previews depend
  on browser format support; lack of a preview does not prevent cleaning.
- BigTIFF, CR3, RAF, RW2, PEF and other unlisted RAW types are not supported.
- 256 MB per file; browser memory can impose a lower practical batch limit.

## Output validation

Extended exports re-read the output before downloading. They reject changes to
retained selectable fields or protected image properties and reject any selected
field/group that remains. Classic TIFF/RAW image strips, tiles, embedded JPEGs and
JPEG tables receive a SHA-256 comparison, including all linked image IFDs. HEIF/AVIF
use ExifTool's encoded-image-data digest, plus protected property comparisons.
Relocated offsets, container sizes, filesystem pseudo-tags and derived composite
values are excluded from property comparisons. No global `-all=` or `-m` is used.
The specific ExifTool notice about not decoding large arrays is allowed; the arrays
remain in the file. Other structural warnings fail closed.

Operations run serially inside the worker to avoid ExifTool interpreter races.
A failed photo aborts the ZIP rather than silently omitting it. Unselected exports
are byte-identical. Worker startup/errors/timeouts are surfaced and reset releases
its photo state. Each queued export uses a snapshot of the photo's selection.

## Verification

`npm test` covers the original formats, animated GIF preservation, every extended
format, selective removal, deselect-all, malformed input and failed export behavior.
Committed real CC0 camera fixtures cover DNG, NEF and ARW; small ExifTool fixtures
also exercise CR2, HEIF and DNG. Additional manual verification used a CC0 Canon EOS 40D CR2 (raw.pixls.us sample
2102), a full Nikon NEF from rawpy's public corpus and libheif's example.heic.
Independent LibRaw decoding compared both sensor arrays and rendered pixels for
CR2, NEF, ARW and DNG. Pillow/libheif compared HEIC pixels; sharp compared AVIF,
TIFF and animated GIF pixels, GIF frame timing, looping and transparency.
Browser checks cover worker loading, mixed batches, individual/ZIP export and
fallback previews. These are regression checks, not a guarantee for every camera,
proprietary tag, malformed container or future format revision.
