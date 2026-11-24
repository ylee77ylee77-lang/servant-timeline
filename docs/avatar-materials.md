# Avatar P2 — independent hair, skin and eyewear colors

## Approved product direction

Keep the existing five backgrounds and four companion animals unchanged.
Prioritize recognizable character faces, compatible hairstyles, and three
independent material colors. Target four character families (two male, two
female), three hairstyles per family, and classic/round/square/no glasses.
Only ship art that passes review.

- Hair: 360-degree continuous HSV color wheel and independent brightness slider.
- Skin: a continuous warm-color disc and brightness slider limited to a reviewed
  natural skin-tone gamut, including deeper tones. The initial numerical range
  is provisional and requires review against real source materials.
- Frame: 360-degree continuous HSV color wheel and independent brightness slider.
  Do not recolor lens transparency, reflection, eye whites, iris or adjacent skin.
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

## Shared color-wheel interaction foundation

`lib/profile/avatar-color-wheel.ts` defines one deterministic coordinate-to-color
mapping for rendered pixels, pointer interaction, and keyboard movement. Hair
and frame use full HSV hue/saturation; skin uses a warm Cartesian disc without
an abrupt hue-wrap seam. Brightness remains separate, retaining the chosen
position even at black. The skin disc's range is an unapproved first design,
not a dermatological or final art palette.

`components/profile/AvatarColorControls.tsx` is a controlled, reusable picker:
collapsed color dots, one open section, pointer capture for touch dragging,
keyboard arrow support, native brightness slider and reset to the source color.
The canvas only redraws for brightness/channel changes; changing the selection
moves the marker and calls the parent's local-draft callback. A null draft
means original source color. Merely opening or closing the picker never changes
any color. No fixed-color grid is required. No new dependency, API call, or
profile data change is involved. The component is deliberately not mounted in
registration or profile settings until compatible material rendering is ready.

`tests/avatar-color-wheel.test.ts` covers hue primaries, RGB roundtrip, black
and restore, bounded skin gamut, invalid coordinates, and exact agreement
between wheel pixels and selection math. Physical touch, browser integration,
production art, persisted RGB roundtrip and rendering performance remain gates.
