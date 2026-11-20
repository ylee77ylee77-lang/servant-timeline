# 3D avatar renderer — stable artwork contract (v2)

This feature has exactly **one** renderer: `AvatarRenderer`. Every consumer (avatar editor,
profile, service list and communications) receives a normalized `avatar_config` and delegates
to it through `SystemAvatar` or directly. Avoid separate CSS stacking implementations.

## Full-canvas layered composition

All 8 existing transparent WebP assets under `public/avatar/scenes/v2/` are **512×512** with a
shared, fixed origin (0,0). They are authored **already in their final location**. The
React renderer knows nothing about animal offsets, responsive breakpoints or source crop
coordinates. It draws only these fixed four layers, in this order:

1. Dynamic pastel gradient, bounded by the circular avatar clip.
2. Pre-rendered 3D person (male/female, with or without correctly aligned glasses).
3. Animal's **existing behind** artwork (head and upper body), bounded by that same circular clip.
4. The white circular frame, in front of the lower animal body. **No paw, foot, talon or other foreground layer.**

The shared artboard means every layer scales by the same factor at 48px, 72px, 112px,
256px and other sizes. No per-device CSS offsets and no independent animal badges.

## No new images and no feet

This revision **reuses only the four existing** `<animal>-behind.webp` files.
The now-unused `<animal>-front.webp` files are deleted from the branch, as those
contained the paws, claws or other elements extending across the frame.
Neither the person images nor the animal images are repainted, regenerated, or
recropped. The shared circular clip and white frame naturally hide the lower
animal body. Only the head / upper body remains visible near the lower-left side
of the person, keeping the face unobscured.

Do not reintroduce per-device offsets or separate animal badges. All pages must
continue to use the single `AvatarRenderer`; no individual CSS fixes or separate
artwork collections for different display sizes. Test at 48px, 112px and 256px.
Current animals: 綿羊, 母鹿, 獅子, 老鷹.

The current photo-to-three image-generation flow remains disabled until a suitable
provider and free-usage controls are reviewed. Do not enable paid APIs in client code.

## Data and rollout

There is **no schema migration**: the renderer reads existing `profiles.avatar_config`
through `normalizeAvatarConfig`, and legacy dog/cat/bird entries fall back safely to none.
The Supabase API, RLS and authorization remain unchanged. Keep PR #23 in Draft until
mobile visual acceptance; do not merge directly to production `main`.
## Unconfigured accounts

The existing `neutral` value is a not-yet-selected status. The renderer displays
a neutral inline placeholder rather than assigning a male or female 3D portrait
until the volunteer explicitly chooses a base character. This adds no image files
and requires no database migration.


## Shared portrait headroom and sticky preview

All existing 3D portrait images share `AVATAR_PORTRAIT_BOUNDS` within the
512×512 artboard, giving both genders and glasses variants consistent headroom.
This is a single renderer-level composition rule, not per-image/device offsets.
The full-canvas animal layers are unchanged.

In the editing view, the live preview sticks to the settings scroll container,
remaining 104px at every scroll position. It stays inside
the editor and does not become a global fixed overlay. The animal picker
shows a common crop into each **existing animal file**, plus a short name; no
new images or long technical explanations are shown.

## P1: display preferences and collapsed settings

The profile avatar settings card defaults to collapsed on each mount and opens
on user request. A single `displayMode` field in the existing JSONB
`avatar_config` selects `custom`, `default` or `name`. Missing or invalid
legacy values normalize to `custom`. Switching modes preserves the stored
3D character settings and does not delete assets. The `SystemAvatar` facade
passes the existing profile display name through the canonical renderer for
name-mark mode in the settings page, chat list, chat header, incoming calls and
active calls. Missing names use the neutral system icon. No schema migration,
new image assets, image-generation service or storage API is needed.


## Registration and profile share avatar controls

Registration and authenticated profile settings use the same `AvatarDisplayModeSelector`,
`AvatarLivePreview`, `AvatarEditor`, and `AvatarRenderer`. Each settings panel
starts collapsed. Registration mounts its 104px live preview at the top of the form
only while avatar options are expanded; because it is a direct child of the form's
scroll container, the preview remains visible through the whole registration flow.
The editor suppresses its own preview inside registration to avoid duplicates.
Existing registration `avatarConfig` submission remains unchanged.

The default/person-shaped placeholder now uses a visible purple silhouette instead
of near-white artwork against a pale gradient. No new image assets or paid services.


## Six system icons and six soft grayscale-tinged color themes

Display mode names are **大頭貼**, **圖示**, and **姓名識別**. The icon choices
are 十字架、聖經、禱告、天使、棕樹枝、教會, displayed as six compact
illustration cards with no lengthy technical descriptions. The six **色調**
options are 暖灰、冷灰、炭灰、米灰、藍灰、薰衣草灰, intentionally soft
with warmer or cooler gray undertones.

The 教會 artwork is generated from the user-provided 夏凱納 building silhouette,
not a generic church; it is a single transparent raster mask tinted by the same
palette used for the other icons. The six symbolic icons live in one
SystemIconArtwork renderer, and the AvatarIconPicker is used in both registration
and the authenticated profile settings. Save the chosen icon and tone in the
existing JSONB avatar_config as validated iconType and iconTone values, defaulting
to cross and lavender for old profiles. No schema migration, paid image service,
role permission change, or new API endpoint is necessary.
