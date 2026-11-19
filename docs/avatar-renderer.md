# 3D avatar renderer — stable artwork contract (v2)

This feature has exactly **one** renderer: `AvatarRenderer`. Every consumer (avatar editor,
profile, service list and communications) receives a normalized `avatar_config` and delegates
to it through `SystemAvatar` or directly. Avoid separate CSS stacking implementations.

## Full-canvas layered composition

All 12 transparent WebP assets under `public/avatar/scenes/v2/` are **512×512** with a
shared, fixed origin (0,0). They are authored **already in their final location**. The
React renderer knows nothing about animal offsets, responsive breakpoints or source crop
coordinates. It draws only these fixed five layers, in this order:

1. Dynamic pastel gradient, bounded by the circular avatar clip.
2. Pre-rendered 3D person (male/female, with or without correctly aligned glasses).
3. Animal's **behind** artwork, bounded by that same circular clip.
4. The white circular frame, in front of the animal's body.
5. Animal's **front** artwork (paws, talons or a touching ear) in front of the frame.

The shared artboard means every layer scales by the same factor at 48px, 72px, 112px,
256px and other sizes. No per-device CSS offsets and no independent animal badges.

## Replacing or adding an animal

The designer supplies two 512×512 transparent, **pixel-aligned** WebP layers named
`<animal>-behind.webp` and `<animal>-front.webp`. The behind layer contains the entire
animal at its art-directed position, while the front layer contains **only** anatomy that
visibly overlaps the frame (sheep/lion forepaws, eagle talons, doe ear). The white ring
must cover the rest. Full-canvas layers are part of the artwork specification—not a
positioning patch. Verify the two files over the exact ring geometry (cx=256,cy=256,
r=236,stroke=16) **before** adding the animal to `AVATAR_COMPANIONS`.

Preview the combinations against both male and female portraits, with and without glasses,
and at least two background colours and two sizes. Ensure that paws or talons visibly
contact the white rim, no animal is floating off-canvas, no animal hides the eyes, nose or
mouth, and each image has a transparent background. The current optional animals are:
綿羊, 母鹿, 獅子, 老鷹.

The current photo-to-three image-generation flow remains disabled until a suitable
provider and free-usage controls are reviewed. Do not enable paid APIs in client code.

## Data and rollout

There is **no schema migration**: the renderer reads existing `profiles.avatar_config`
through `normalizeAvatarConfig`, and legacy dog/cat/bird entries fall back safely to none.
The Supabase API, RLS and authorization remain unchanged. Keep PR #23 in Draft until
mobile visual acceptance; do not merge directly to production `main`.