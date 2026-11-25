# P6: independent character master artwork — candidate only

Replaces the geometric face deformation proposal in PR #66. Two independently
generated characters, with no deformation of the released v2 source art.
The selected concept is separated into two 512×512 transparent WebP masters
using a traced silhouette and foreground segmentation, then uniformly scaled
and translated to approximate the existing portrait canvas. Local checks
confirmed decoded RGBA, transparent corners, opaque subject and 48/80/256px
circular previews. The male and female files are 46,420 and 50,524 bytes.

| Male B | Female B |
| --- | --- |
| ![Male B](male-b.webp) | ![Female B](female-b.webp) |

These are shaded 2D portrait candidates, not 3D rigs. Their original hair and
clothing are baked into each master. No claim is made that hair, eyes,
eyewear, or garments are interchangeable yet. Keep files outside public/,
leave the existing runtime family catalog unchanged and do not expose
unverified options. Do not register these under dormant family IDs.

## Remaining release gates
1. Prepare three identity-locked hairstyles per new character with aligned
   art, and source-specific hair/skin coverage that excludes the eyes, brows,
   mouth and clothing; verify color bleed and exact reset.
2. Fit the original, round, and square eyewear to the new eye landmarks.
3. Author individual neckline/hair cutouts and test every existing formal and
   casual outfit plus clothing color channels. Preserve the original outfit.
4. Verify the real shared renderer, full-size and 48/80/104/256px output,
   all five backgrounds and four companions, registration/profile editing,
   persistence/reopen, and legacy records. Use the existing editor and sticky
   preview; do not weaken the existing numeric rendering gates.
5. Visual review and authorized device acceptance before enabling the new
   choices or merging.

No app runtime, database, permissions, or production change in this trial.
The manifest pins the exact candidate files. The node tests verify file
integrity, WebP alpha metadata and dimensions; local decoded-image and visual
checks are separate, not an iPhone or browser-renderer test.

## Independent material candidates

Two RGB ownership masks are pinned under `materials/`. Each is traced for its
own source (not reused from v2), with narrow source-aware edge refinement
and explicit protected eye/brow/mouth and clothing landmarks. The old shared
renderer and old test gates are unchanged. Local Python color simulation
showed independent hair/skin tinting, exact preservation outside the active
mask, and 16 protected 3×3 patches. This simulation is not actual React SVG
rendering. The existing Node verification now additionally exercises the actual
AvatarMaterialFilter on these two candidate sources in 12 cases and exports
`independent-material-review.png`. CI result is pending at commit time.

Visual blocker: deep-skin samples still show pale borders around some eyes
and lips. Keep this candidate-only; do not register in runtime until refined
and approved. The 2D masters still need identity-locked hairstyle assets,
source-specific eyewear and outfit fitting, and browser/device validation.
No profile fields, runtime UI, or production behavior change.
