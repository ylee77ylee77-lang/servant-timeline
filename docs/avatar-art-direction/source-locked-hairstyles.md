# P4 — source-locked hairstyle artwork trial

PR #63's application and database checks passed at bf8fc70. This separate
offline art pass uses the four existing high-detail hairstyle donors, aligns
them to the approved v2 source by the eyes and mouth, and preserves a verified
opaque expression core from the original pixels. The donor may provide newly
visible scalp, ears, neck and clothing that cannot be recovered from a
flattened original. The artist must inspect the hairline, seams and all
newly visible regions; exact protected pixels do not prove the entire face,
ear, body or illumination is unchanged.

Outputs: four actual 512px transparent lossless WebP art candidates,
registered donor PNGs, exact face-lock masks, comparison sheet at 184px and
48px, and measured registration/codec/source-integrity results. The separate
read-only GitHub Actions job uploads these files. Source hashes are pinned;
no runtime asset or app behavior is changed. This is an alternative art
authoring experiment to assess whether a common identity can be preserved
using the detailed source illustrations; the result is not a modular 3D rig
or a production hair/skin coverage map. Do not register the candidates
automatically, even if the numeric face-lock check passes.

The four complete character families and their reusable material/eyewear
layers remain the final release goal. Decide between authored per-hairstyle
source art and interchangeable layers only after reviewing actual art,
without duplicating full portraits per color or eyewear choice.
