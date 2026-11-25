# Lens tint and transparency

- Optional normalized avatar_config.lens color and 0–100 transparency, step 5. Fully transparent default renders no new SVG element. Reset only affects lenses; removing glasses retains preferences. Registration/profile use the same existing normalizer and editor; no migration or authorization changes.
- Full HSV picker and an independent transparency slider, shown only while supported glasses are worn. At 100% the color is retained but invisible. Separate reset restores transparent default.
- Original baked classic frames retain their raster artwork and receive tint within the traced lens holes, using red/blue coverage to protect hair and rims. Independent frames use the existing source-aligned lens interiors, beneath the rim, with existing hair occlusion. Shading is illustrative, not a physical optical simulation.
- Tests cover 42 source/frame combinations, 84 actual shared-renderer cases at 48/256px, clear pixel equality, alpha and region isolation, two colors, transparency differences and selected outfit/companion combinations. Comparison: four rows (legacy male, new male, legacy female, new female), three columns per frame (clear, 75%, 0%). Existing checks remain.
- Pending complete CI and iPhone preview acceptance, including save/reopen in registration and profile.
