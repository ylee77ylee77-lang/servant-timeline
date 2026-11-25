# P4: character family foundation (draft)

The previous v3 catalog was limited to one source family per gender. This
revision reserves two stable IDs per gender, stores an explicit portraitFamily
selection and maintains the legacy portrait/eyewear fields independently.
Removing the family restores the original source. Colors, glasses visibility,
background, animal and display mode remain shared. No database migration.

A registered family must provide three compatible hairstyles, three frames and
individual 512px source-specific color coverage for each layer, with source
and mask SHA-256. One shaded base artwork per hair replaces fixed color grids.
The shared renderer uses the existing color wheels and fixed layer order.
Unregistered IDs and old dormant v3 fields cannot activate a different face.

The existing procedural geometry and full-portrait visual candidates have not
passed the artistic/geometry gate. The catalog remains empty; no new facial
artwork is exposed yet. The next source art pass must provide the four complete
aligned families, coverage verification and actual mobile visual acceptance.
Original five backgrounds, four animals, sticky preview and released eyewear
choices remain unchanged. This draft must not merge before review.

## Actual art trial

See [four expression-locked hairstyle candidates](avatar-character-art-review.md). The protected-face check passes; the full art/material/size/release gates remain open.
