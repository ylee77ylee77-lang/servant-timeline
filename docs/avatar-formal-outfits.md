# Formal outfit preview — first batch

Branch: feature/avatar-formal-outfits. Scope: formal clothing for the two
current approved character identities and their existing hairstyles, keeping
the original casual outfits as the default. Male: dress shirt, suit and tie,
open-collar blazer. Female: blouse, tailored jacket, modest dress.

The new garment is independently drawn as a shaded vector layer behind a
source-specific head/hair/neck cutout; it does not paint a suit over the old
hoodie. Its artwork is 2D, not a recovered 3D mesh. The current six visible
hair choices and legacy black / glasses source variants are registered by
exact source path. No source URLs from user data. The existing shared
renderer and fixed preview remain in use. Only explicit selection stores
the optional formalOutfit object. Existing outfit and portrait preferences
are retained. The existing color wheel handles clothing, lining and tie
only where applicable, with independent resets. No database migration or
new runtime dependency.

Shared-renderer verification produces a six-row actual visual comparison
(original / three formal options), and tests 36 outfit/size combinations,
including pixel-exact face region above the neckline and independently
visible color channels. It is a draft visual trial: check hair edges,
shoulder silhouette, neckline, lighting and small-size legibility; the
vector garment may need further artistic refinement. Not iPhone approval.

The additional casual garments and the second face identity per gender
remain separate scope. Do not merge before the visual review and real
registration/profile save/reopen. No change to production.
