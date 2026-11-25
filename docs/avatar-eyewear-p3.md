# P3 — independent eyewear artwork (draft)

Four choices: none, original, round, square. Round/square are independent
shaded vector artwork on the existing v2 512px plain portraits, with
character-specific alignment. They are 2D accessories, not new 3D meshes.
Existing baked glasses and legacy profiles remain unchanged. An explicit
`eyewearVersion: "v1"` activates the new shapes; old stored glassesStyle
values alone do not change anything. The existing color wheel drives the
frame shading; hair and skin still use the existing plain-source masks.
No new dependencies, API, database migration, or per-device offsets.

The existing rendering proof now additionally checks both frames for both
original people at 48/80/104/256px and writes eyewear-review.png (plain,
round, round gold, square, square blue). Verify changed pixels within the
frame region and preserved eye/mouth centers. Real mobile visual review
and authenticated save/reopen are still required before release.

New faces and hair are separate art work. Existing full-portrait candidates
are not interchangeable hair layers. Do not register them without approved
materials and alignment. Five backgrounds and four companions are unchanged.
