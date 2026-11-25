# P2 artwork proof — existing hairstyle and eyewear

This is a developer-only feasibility test using the approved v2 portrait rasters.
The source files are unchanged. The soft-black recolor preserves alpha, facial
landmarks and the existing hairstyle; it is **not** an independently replaceable
hair mesh. The eyewear diagnostic solves a differential alpha composite from the
two existing images and quantifies alignment; it does not invent round or square
frames or certify a true glasses layer.

Run the dedicated read-only GitHub Actions artwork proof job (or locally with
Python, Pillow and NumPy). It produces a contact sheet, per-character numerical
report, masks, sample lossless WebPs and a candidate eyewear difference image.
The only external installation is development-time image QA packages in the
existing CI runner; there is no application package, paid API, account or service.

The visual acceptance gate remains in place. Do not add unreviewed proof images to the
runtime catalog, use them as a hairstyle-independent face/body base, or alter old
accounts. A true layered portrait family still needs clean matching 3D source
artwork and explicit visual/mobile acceptance.

## First checked candidate handoff

The four compressed black-hair candidates passed transparent-canvas, protected-face and
mobile-size checks and were visually inspected in the PR development workflow. They are now
registered separately as fixed-silhouette color variants under `v2-tones`, not as v3 layers.
The original eyewear separation failed the alignment gate and is deliberately not registered.
Final mobile visual approval remains required before merging PR #61.
