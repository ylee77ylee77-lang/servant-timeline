# Avatar P2 — independent hair, skin and eyewear colors

## Approved product direction

Keep the existing five backgrounds and four companion animals unchanged.
Prioritize recognizable character faces, compatible hairstyles, and three
independent material colors. Target four character families (two male, two
female), three hairstyles per family, and classic/round/square/no glasses.
Only ship art that passes review.

- Hair: convenient swatches plus a user-selected custom RGB color.
- Skin: common natural tones plus fine adjustment within a reviewed natural
  skin-tone gamut; not an unrestricted rainbow picker. The exact gamut and
  swatch set still require visual approval, including a range of deeper tones.
- Frame: convenient swatches plus custom RGB color. Do not recolor lens
  transparency, reflection, eye whites, iris or adjacent skin.
- Keep original color as a reset option, and never change a saved legacy
  avatar automatically. Selecting a color must update a local draft, not
  initiate a network request.

## Source material and output contract

For each approved family use the same camera, face mesh, pose, lighting and
portrait artboard. Assign skin (face, ears, neck), hair (front and rear), and
frame materials explicitly; keep clothing, eyes, eyebrows, lips and lens
reflection outside those color channels. Preserve real shading and highlights,
occlusion and anti-aliased edges. No entire-portrait CSS hue shift, flat colored
overlay, per-device offsets, or generated full portrait per color selection.

The eventual browser implementation should use validated material-specific
coverage masks and neutral diffuse/shading plus preserved highlight information
or an equivalently verified pre-baked material representation. Composite
according to the existing shared portrait layer order. Test its result against
the locked source renderer rather than assuming a flat multiply or hue shift
is accurate. The offline proof below does not yet implement that browser
material representation or free-color UI.

All registered runtime artwork must retain the existing 512 x 512 transparent
artboard and mobile budget. Review thumbnails and full-size views, and test
black/bright hair, light/deep skin, neutral/bright frame colors, and combinations.
The selected RGB must not affect other material regions. No material UI can
appear for a family/hairstyle/frame that lacks an approved material pass.

Future storage: use optional, strictly validated six-digit RGB values in
the existing versioned avatar_config JSONB; omit absent values and preserve
legacy v2 and v2-tone behavior. The exact storage fields and server normalization
are intentionally deferred until material and browser integration are verified.
Keep saved color preferences independent from display mode and other parts.
No schema migration, paid provider, AI call on selection, or new runtime
dependency is part of this proof.

## Reproducible developer-only proof

The original procedural P2 rig was parameterized for skin and frame colors
(hair was already parameterized). Default inputs retain the old geometry
and material values. The material-proof script uses actual depth-buffer
ownership for hair, skin, frame and protected non-colorable parts, not manually
painted skin masks. It compares each selected material to the original source
render at the same camera/pose and rejects any depth, alpha or non-target
color change. It separately checks that splitting the original face/body
into skin and protected parts matches the source within the existing 0.1%
geometry tolerance.

Two provisional source characters, eight cases each, include baseline,
independent hair/skin/frame changes and a combined case. The PNG masks,
RGBA WebPs, report.json and contact sheet are proof outputs only and must
never be registered as production art. These masks are sample-specific
visible ownership diagnostics, not yet reusable runtime material passes.
The prototype has frames but no lens material; lens isolation remains untested.

Run locally with Python, VTK 9.6.2, NumPy 2.3.5, Pillow 12.3.0:

```sh
python scripts/prototype-avatar-materials.py
```

The dedicated read-only GitHub Actions material proof job performs the same
checks and uploads its artifacts. A successful job is evidence of isolated
source-material color control only, not approved visual quality, saved
profile behavior, or iPhone/Safari performance. No application files or
public assets are changed in this step.

## Release gates still open

1. Approve the source art quality against the original v2 portraits.
2. Produce reusable material masks, light/shading information and compatible
   hair/eyewear geometry for each released family.
3. Verify continuous browser-side color controls, neutral reset, exact
   protected-region preservation and performance at 48/80/104/256px.
4. Validate versioned input and save/reopen in registration and settings,
   including hidden display modes; confirm old avatar appearance.
5. Review on iPhone PWA and all avatar surfaces, pass application/security CI,
   then obtain explicit approval before merging the Draft PR.
