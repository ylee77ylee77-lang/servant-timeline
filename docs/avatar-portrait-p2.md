# Avatar P2 — versioned portrait artwork

## Release scope

The approved v2 portraits are complete pre-rendered images, not independent meshes or hair layers.
P2 keeps those files unchanged. Existing users do not automatically switch because the legacy
`hair` and `hairColor` fields were already stored but not rendered by v2. No database migration,
provider, paid service, dependency, or per-device layout change is required.

This foundation implements the shared catalog, resolver, opt-in and catalog-driven editor.
**No new v3 artwork is registered yet.** The production catalog starts empty. The existing
editor remains visible with its original two glasses states until a complete approved family
is registered. Test fixture artwork paths are never available at runtime.

## Authoring contract

Create the source model/scene with a locked camera, pose, proportions, lighting, materials,
and facial landmarks for each character family. Keep the established soft-lit 3D style.
Author all layers on the same 512 × 512 transparent canvas, not tightly cropped individual images.
Use the existing renderer portrait inset (20,28,472) at all sizes; no per-device positions.

Export per family to `public/avatar/scenes/v3/<family>/`:

- one face/body base without baked-in hairstyle or glasses
- one front hair render for each released hair and color (back hair layer only if needed)
- one matching classic glasses layer; optional round and square glasses, prealigned to the same face
- transparency and real shading in each WebP, maximum 180 KiB per file

The canonical order is back hair → face/body → glasses → front hair. Background, animal and white
rim remain independent and unchanged. Back hair must be occluded by the body; the front hair
can occlude glasses naturally. If a hairstyle changes face alignment or cannot cleanly occlude the
glasses, revise the source model rather than applying offsets or overlaying a second full portrait.

Initial art direction: masculine short/side/wave, feminine bob/long/bun; dark and brown for each;
classic, round and square eyewear, plus the existing no-glasses state. Those are target choices,
not shipped images. Do not claim any option is available until its actual artwork passes review.

## Integration

Register only approved complete families in `AVATAR_LAYERED_PORTRAITS`.
The shared `getAvatarPortraitOptions` filters the controls to the assets present in the catalog.
The selected hair determines the allowed colors. The canonical `getAvatarPortraitPlan` resolves
incompatible selections to the family default without constructing paths from user input.

The user explicitly selects the new portrait version. Missing/invalid version, an unregistered family,
or an old saved profile preserves the legacy look. Switching back to the classic portrait retains the
stored hair/color choices; display modes and icon preferences remain independent.
The authenticated profile save and optional registration already use `normalizeAvatarConfig`.
All avatars continue through the one shared renderer, including communication and roster surfaces.

## Release gate for real artwork

1. Inspect a contact sheet at 48, 80, 104 and 256 px for both backgrounds and all companions.
2. Compare face landmarks, camera, pose, hairline and glasses alignment; no clipping or visible seams.
3. Verify transparency, actual 512px canvas, file budgets and every registered path with `npm test`.
4. Exercise all registered hair/color/glasses combinations; check no stale selections after a style change.
5. Test registration, collapsed profile heading, sticky preview, cancel/save/reopen, service dashboard
   and communication avatars on actual mobile browsers. Confirm no new network requests on picker taps.
6. Keep the existing production appearance unless explicit opt-in; verify lint, unit tests, build, and
   database CI before human visual approval and PR merge.
