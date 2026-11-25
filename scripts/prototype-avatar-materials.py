"""Offline material-channel proof for the unapproved P2 geometry rig.

Tests material ownership and fixed geometry, not production artwork or a
browser color picker. All outputs stay outside public runtime assets.
"""
from pathlib import Path
import argparse
import importlib.util
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SPEC = importlib.util.spec_from_file_location(
    "avatar_rig", Path(__file__).with_name("prototype-avatar-rig.py")
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Missing avatar geometry prototype")
rig = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rig)

# These are review samples, not an exhaustive or final user-facing palette.
SAMPLE = 512
CHANNELS = ("hair", "skin", "frame")
CASES = (
    ("original", {}),
    ("hair-black", {"hair": "#252326"}),
    ("hair-violet", {"hair": "#80618F"}),
    ("skin-light", {"skin": "#F5D7BD"}),
    ("skin-deep", {"skin": "#885139"}),
    ("frame-gold", {"frame": "#B88E55"}),
    ("frame-blue", {"frame": "#496C94"}),
    ("combined", {"hair": "#654539", "skin": "#BC855E", "frame": "#746198"}),
)


def rgb(value):
    """Strict RGB input; no CSS, URLs, alpha, or unvalidated strings."""
    if not isinstance(value, str) or len(value) != 7 or value[0] != "#":
        raise ValueError("Expected #RRGGBB")
    if any(c not in "0123456789abcdefABCDEF" for c in value[1:]):
        raise ValueError("Expected #RRGGBB")
    return tuple(int(value[i:i + 2], 16) / 255 for i in (1, 3, 5))


def body_groups(gender, skin):
    skin_parts = []
    body = rig.face_body(gender, skin=skin, skin_actors=skin_parts)
    # VTK actors are identified by their original object identity.
    skin_ids = {id(part) for part in skin_parts}
    protected = [part for part in body if id(part) not in skin_ids]
    assert skin_parts and protected
    return body, skin_parts, protected


def render_hair(style, color):
    rear, front = rig.hairstyles(style, color)
    return rig.render_raw(rear + front, SAMPLE)


def render_skin(gender, color):
    _, parts, _ = body_groups(gender, color)
    return rig.render_raw(parts, SAMPLE)


def render_frame(color):
    return rig.render_raw(rig.glasses("round", color=color), SAMPLE)


def material_owners(groups):
    depths = np.stack([group[1] for group in groups])
    owners = np.argmin(depths, axis=0)
    visible = np.isfinite(depths.min(axis=0))
    return owners, visible


def unchanged_geometry(original, changed, label):
    assert np.array_equal(original[0][:, :, 3], changed[0][:, :, 3]), label + ": alpha changed"
    assert np.array_equal(original[1], changed[1]), label + ": depth changed"


def changed_fraction(a, b):
    occupied = (a[:, :, 3] > 0) | (b[:, :, 3] > 0)
    return float(np.count_nonzero(np.any(a != b, axis=2))) / max(1, np.count_nonzero(occupied))


def build_family(gender, style, output):
    body, skin_parts, protected_parts = body_groups(gender, rig.SKIN)
    protected = rig.render_raw(protected_parts, SAMPLE)
    baseline = [
        render_hair(style, rig.BROWN),
        rig.render_raw(skin_parts, SAMPLE),
        render_frame((.15, .12, .105)),
        protected,
    ]
    # Validate splitting the existing face/body into two material-owned groups.
    whole_face = rig.render_raw(body, SAMPLE)[0]
    split_face = rig.reference_z([baseline[1], protected])
    split_error = changed_fraction(whole_face, split_face)
    assert split_error <= .001, f"{gender}: material split differs from original face: {split_error:.6%}"
    reference = rig.reference_z(baseline)
    owners, visible = material_owners(baseline)
    owner_masks = {channel: visible & (owners == index) for index, channel in enumerate(CHANNELS)}
    for channel, mask in owner_masks.items():
        assert np.count_nonzero(mask) > 100, gender + ": missing visible " + channel
        Image.fromarray((mask * 255).astype(np.uint8)).save(output / f"{gender}-{channel}-mask.png")
    cases = []
    tiles = []
    cache = {}
    for name, selected in CASES:
        groups = list(baseline)
        allowed = np.zeros(visible.shape, dtype=bool)
        for channel, value in selected.items():
            index = CHANNELS.index(channel)
            key = (channel, value)
            if key not in cache:
                color = rgb(value)
                cache[key] = (
                    render_hair(style, color) if channel == "hair" else
                    render_skin(gender, color) if channel == "skin" else
                    render_frame(color)
                )
            groups[index] = cache[key]
            unchanged_geometry(baseline[index], groups[index], gender + "/" + name + "/" + channel)
            allowed |= owner_masks[channel]
        combined = rig.reference_z(groups)
        assert np.array_equal(combined[:, :, 3], reference[:, :, 3]), name + ": composite alpha changed"
        changed = np.any(combined[:, :, :3] != reference[:, :, :3], axis=2)
        assert not np.any(changed & ~allowed), name + ": unrelated pixels changed"
        counts = {
            channel: int(np.count_nonzero(changed & owner_masks[channel]))
            for channel in CHANNELS
        }
        for channel in selected:
            assert counts[channel] > 100, name + ": no meaningful color change for " + channel
        filename = f"{gender}-{name}.webp"
        image = rig.export_rgba(combined, output / filename)
        assert image.size == (512, 512) and image.mode == "RGBA"
        decoded = np.asarray(Image.open(output / filename).convert("RGBA"))
        assert np.array_equal(decoded[:, :, 3], combined[:, :, 3]), filename + ": export changed alpha"
        cases.append({
            "name": name, "selected": selected,
            "changed_visible_pixels": counts, "outside_material_changed_pixels": 0,
            "depth_unchanged": True, "alpha_unchanged": True,
        })
        tiles.append((f"{gender} / {name}", rig.tile(image, 184)))
    return {
        "gender": gender, "hair_style": style,
        "face_split_error_pct": 100 * split_error,
        "visible_material_pixels": {k: int(np.count_nonzero(v)) for k, v in owner_masks.items()},
        "cases": cases,
    }, tiles


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(".avatar-material-proof"))
    args = parser.parse_args()
    if (Path(__file__).resolve().parents[1] / "public").resolve() in (
        args.output.resolve(), *args.output.resolve().parents
    ):
        parser.error("Proof artwork must not be written to public/")
    args.output.mkdir(parents=True, exist_ok=True)
    # Validate parser without accepting arbitrary CSS values.
    assert rgb("#000000") == (0, 0, 0)
    assert rgb("#ffffff") == (1, 1, 1)
    for bad in ("red", "#fff", "#GG0000", "#12345678", "url(x)", " #123456", None):
        try:
            rgb(bad)
        except ValueError:
            continue
        raise AssertionError("Invalid color accepted")
    families, tiles = [], []
    for gender, style in (("male", "side"), ("female", "long")):
        report, images = build_family(gender, style, args.output)
        families.append(report)
        tiles.extend(images)
    sheet = Image.new("RGB", (4 * 204 + 24, 4 * 216 + 24), "#F9F6FA")
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 12)
    except OSError:
        font = ImageFont.load_default()
    for index, (label, image) in enumerate(tiles):
        x, y = 12 + (index % 4) * 204, 12 + (index // 4) * 216
        sheet.paste(image, (x + 10, y), image)
        draw.text((x + 5, y + 189), label, font=font, fill="#4F4559")
    sheet.save(args.output / "contact-sheet.jpg", quality=94)
    report = {
        "scope": "offline unapproved geometry/material proof; not browser recoloring",
        "canvas": SAMPLE, "material_channels": list(CHANNELS),
        "combinations": len(tiles), "geometry_gate_passed": True,
        "outside_material_changed_pixels": 0,
        "visual_gate": "not approved; source rig art quality and production materials remain gated",
        "families": families,
    }
    (args.output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
