# Avatar P2: reusable 3D geometry proof

## Scope and release decision

The existing approved v2 artwork has no editable source rig. This offline
prototype builds new continuous 3D geometry for a shared male/female face and
body, six hairstyles, two hair colors and three eyewear frames. It tests
whether aligned transparent hair and eyewear layers can be produced from
one locked geometry, camera and lighting setup. It does not recreate the
approved v2 artistic identity. The current prototype is intentionally not
registered in the application's artwork catalog: its facial detail, hair
texture and lighting do not yet match the established artwork.

## Reproducibility

Developer-only source: `scripts/prototype-avatar-rig.py`.
Tested locally using Python 3, VTK 9.6.2, NumPy 2.3.5, Pillow 12.3.0 and an
offscreen EGL renderer. No application dependencies, paid services,
runtime rendering, database migration or new account are required.

```sh
python -m pip install vtk==9.6.2 numpy==2.3.5 Pillow==12.3.0
python scripts/prototype-avatar-rig.py --output .avatar-rig-proof
```

Keep the generated output outside public runtime assets. Review the generated
contact-sheet.jpg and report.json. Do not register the files automatically.

## Actual local verification (2026-11-24)

- Male: short, side, wave. Female: bob, long, bun.
- Two hair colors: brown and dark. Eyewear: none, classic, round, square.
- 48 distinct combinations evaluated from the same face and locked camera.
- 32 independent RGBA WebP layer files exported at 512 x 512 pixels,
  including face/body, front/rear hair and eyewear.
- All 32 files opened successfully as 512px RGBA; file sizes 6,498 to 68,622 bytes.
- The exporter uses actual depth buffers rendered at 1024 x 1024 to separate
  the foreground and rear hair and occlude eyewear behind the face.
- After correcting the temple geometry, the maximum raw depth-reference
  compositing mismatch across all 48 cases was 0.00067% of occupied samples;
  the prototype geometry threshold is 0.1%. Geometry gate: passed.
- This is a local geometry test, not a claim of pixel-identical browser
  rendering after resampling. Mobile composition, visual quality, privacy
  modes, save/reopen behavior and actual deployment remain release gates.
- Visual gate: not approved. The current procedural face has a simpler,
  toy-like appearance compared with the existing approved 3D illustrations.

The proof keeps the existing v2 artwork and avatar_config behavior intact.
The next art pass should improve the shared face/skin, hair volumes and
materials, clothing and soft lighting before preparing a complete reviewed
v3 family. Do not expand the live UI with these unapproved candidates.
