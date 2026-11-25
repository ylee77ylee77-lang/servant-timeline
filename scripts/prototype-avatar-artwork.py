"""P2 developer-only artwork feasibility study; never edits approved v2 assets.

Usage: python scripts/prototype-avatar-artwork.py
Requires Pillow and numpy, as the existing artwork verification does.
The source portraits are flattened rasters. This script tests *color-only*
retouching and differential eyewear isolation, not new interchangeable hair
geometry. Generated images are QA artifacts, not an approved runtime catalog.
"""
from pathlib import Path
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/avatar/scenes/v2"
OUT = ROOT / ".avatar-p2-qa"
SIZE = 512

# Hand-reviewed conservative artboard regions for the EXISTING portraits only.
# These contours deliberately stay off eyes, eyebrows, ears, cheeks and neck.
# They must not be treated as landmarks for a different character or new hair.
HAIR_REGIONS = {
    "male": [
        [(0, 0), (512, 0), (512, 145), (409, 167), (383, 195),
         (372, 209), (367, 231), (360, 224), (360, 190), (347, 168),
         (332, 147), (321, 130), (306, 115), (284, 108), (259, 106),
         (249, 124), (238, 145), (222, 155), (205, 159), (186, 157),
         (170, 167), (159, 184), (154, 206), (151, 235), (145, 231),
         (139, 207), (123, 193), (101, 187), (80, 166), (0, 154)],
    ],
    "female": [
        [(0, 0), (512, 0), (512, 430), (410, 430), (382, 425),
         (354, 414), (349, 395), (350, 373), (360, 344), (379, 315),
         (394, 286), (408, 260), (406, 238), (400, 217), (382, 207),
         (366, 193), (354, 173), (343, 151), (330, 130), (313, 112),
         (290, 101), (265, 99), (246, 112), (231, 135), (216, 157),
         (200, 180), (187, 201), (172, 220), (157, 237), (140, 250),
         (127, 262), (124, 280), (137, 299), (157, 314), (175, 337),
         (194, 362), (213, 377), (216, 403), (209, 424), (199, 446),
         (184, 467), (178, 490), (188, 512), (0, 512)],
    ],
}
EYE_REGION = {"male": (137, 168, 383, 267), "female": (143, 171, 392, 274)}
PROTECTED = {
    "male": [(176, 177, 338, 340), (221, 340, 296, 401)],
    "female": [(180, 177, 349, 345), (230, 354, 325, 407)],
}


def rgba(name):
    image = Image.open(SOURCE / f"{name}.webp").convert("RGBA")
    assert image.size == (SIZE, SIZE), name
    assert image.getchannel("A").getextrema() == (0, 255), name
    return np.array(image)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def hair_mask(name, pixels):
    region = Image.new("L", (SIZE, SIZE), 0)
    draw = ImageDraw.Draw(region)
    for polygon in HAIR_REGIONS[name]:
        draw.polygon(polygon, fill=255)
    # Feather inward and protect bright skin/clothing; no geometry changes.
    soft = np.asarray(region.filter(ImageFilter.MinFilter(5)).filter(
        ImageFilter.GaussianBlur(2.0)), dtype=np.float32) / 255.0
    rgb = pixels[:, :, :3].astype(np.float32)
    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    weight = soft * (1 - smoothstep(150, 204, luma))
    weight *= pixels[:, :, 3].astype(np.float32) / 255.0
    for x1, y1, x2, y2 in PROTECTED[name]:
        weight[y1:y2, x1:x2] = 0
    return weight


def recolor(name, pixels, weight):
    original = pixels[:, :, :3].astype(np.float32)
    luma = original @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    # Keep strand shading/highlights; neutralize warm brown to soft black.
    target = (luma[:, :, None] * np.array([0.75, 0.73, 0.73], dtype=np.float32)
              + 0.27 * (original - luma[:, :, None]))
    result = pixels.copy()
    result[:, :, :3] = np.clip(np.rint(original + (target - original) * weight[:, :, None]), 0, 255).astype(np.uint8)
    assert np.array_equal(pixels[:, :, 3], result[:, :, 3]), name
    for x1, y1, x2, y2 in PROTECTED[name]:
        assert np.array_equal(pixels[y1:y2, x1:x2], result[y1:y2, x1:x2]), f"{name} changed protected face"
    changed = np.max(np.abs(result[:, :, :3].astype(int) - pixels[:, :, :3].astype(int)), axis=2) > 2
    assert not np.any(changed & (weight == 0)), f"{name} altered pixels outside matte"
    return result, int(changed.sum())


def isolate_glasses(name, plain, glasses):
    p = plain[:, :, :3].astype(np.float32) / 255.0
    g = glasses[:, :, :3].astype(np.float32) / 255.0
    delta = g - p
    difference = np.max(np.abs(delta), axis=2)
    overlap = (plain[:, :, 3] >= 254) & (glasses[:, :, 3] >= 254)
    roi = np.zeros((SIZE, SIZE), dtype=bool)
    x1, y1, x2, y2 = EYE_REGION[name]
    roi[y1:y2, x1:x2] = True
    outer = overlap & ~roi
    # Inverse alpha compositing: smallest physically valid opacity for the
    # observed change. This is a diagnostic, not independent eyewear geometry.
    required = np.where(delta >= 0, delta / np.maximum(1 - p, 1e-6),
                        -delta / np.maximum(p, 1e-6))
    a = np.clip(np.max(required, axis=2), 0, 1)
    a *= roi & overlap & (difference > 5 / 255.0)
    # Quantize opacity upward, then solve RGB at that opacity.
    au = np.ceil(a * 255).astype(np.uint8)
    af = au.astype(np.float32) / 255.0
    c = np.clip(p + delta / np.maximum(af[:, :, None], 1e-6), 0, 1)
    overlay = np.zeros_like(plain)
    overlay[:, :, :3] = np.where(au[:, :, None] > 0, np.rint(c * 255), 0).astype(np.uint8)
    overlay[:, :, 3] = au
    reconstructed = np.array(Image.alpha_composite(Image.fromarray(plain), Image.fromarray(overlay)))
    residual = np.abs(reconstructed[:, :, :3].astype(np.float32) - glasses[:, :, :3].astype(np.float32))
    metrics = {
        "outside_eye_mean_rgb_error": round(float(np.mean(np.abs(delta[outer])) * 255), 3),
        "outside_eye_pixels_over_12_rgb_pct": round(float(np.mean(difference[outer] > 12 / 255) * 100), 3),
        "silhouette_alpha_pixels_over_12_pct": round(float(np.mean(np.abs(plain[:, :, 3].astype(int) - glasses[:, :, 3].astype(int)) > 12) * 100), 3),
        "reconstructed_eye_mean_rgb_error": round(float(residual[roi & overlap].mean()), 3) if np.any(roi & overlap) else None,
        "extracted_eye_pixels": int(np.count_nonzero(au)),
    }
    metrics["alignment_threshold_passed"] = (
        metrics["outside_eye_mean_rgb_error"] <= 2.5
        and metrics["outside_eye_pixels_over_12_rgb_pct"] <= 2.0
        and metrics["silhouette_alpha_pixels_over_12_pct"] <= 2.0
        and metrics["reconstructed_eye_mean_rgb_error"] is not None
        and metrics["reconstructed_eye_mean_rgb_error"] <= 2.0
        and metrics["extracted_eye_pixels"] > 100
    )
    return overlay, reconstructed, metrics, difference


def save_webp(array, path):
    Image.fromarray(array).save(path, "WEBP", lossless=True, method=6, exact=False)


def save_candidate_variant(name, label, array):
    """High-quality pre-rendered color variant, preserving the exact alpha matte."""
    directory = OUT / "candidate-portraits"
    directory.mkdir(exist_ok=True)
    path = directory / f"{name}-{label}.webp"
    Image.fromarray(array).save(path, "WEBP", quality=94, method=6, alpha_quality=100)
    data = path.read_bytes()
    decoded = np.asarray(Image.open(path).convert("RGBA"))
    assert decoded.shape == array.shape, path.name
    assert np.array_equal(decoded[:, :, 3], array[:, :, 3]), f"{path.name}: alpha changed"
    assert len(data) < 180 * 1024, f"{path.name}: exceeds mobile asset budget"
    assert data[:4] == b"RIFF" and data[8:16] == b"WEBPVP8X", path.name
    opaque = array[:, :, 3] == 255
    error = np.abs(decoded[:, :, :3].astype(np.float32) - array[:, :, :3].astype(np.float32))
    mean_error = float(error[opaque].mean())
    assert mean_error < 3.0, f"{path.name}: unacceptable compression error"
    print(f"AVATAR_VARIANT_META:{path.name}:{len(data)}:{hashlib.sha256(data).hexdigest()}:{mean_error:.3f}")


def thumb(array, width, bg="#E9DFF4"):
    # Mirror the runtime circular clip and shared safe portrait bounds.
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((20, 20, 492, 492), fill=bg)
    inset = Image.fromarray(array).resize((472, 472), Image.Resampling.LANCZOS)
    canvas.alpha_composite(inset, (20, 28))
    clip = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(clip).ellipse((20, 20, 492, 492), fill=255)
    from PIL import ImageChops
    canvas.putalpha(ImageChops.multiply(canvas.getchannel("A"), clip))
    ImageDraw.Draw(canvas).ellipse((20, 20, 492, 492), outline="white", width=16)
    return canvas.resize((width, width), Image.Resampling.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCE.glob("*.webp")}
    report = {"scope": "proof only; locked existing hair silhouette; no registered assets", "characters": {}}
    # A compact sheet for visual review: original, color test, glasses original,
    # glasses color test, isolated eyewear diagnostic. Never used by runtime.
    tile = 152
    qa = Image.new("RGB", (5 * tile + 24, 2 * (tile + 28) + 24), "#FAF8FC")
    draw = ImageDraw.Draw(qa)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 11)
    except OSError:
        font = ImageFont.load_default()
    for row, name in enumerate(("male", "female")):
        plain = rgba(name)
        glasses = rgba(name + "-glasses")
        weights = hair_mask(name, plain)
        overlay, reconstructed, metrics, difference = isolate_glasses(name, plain, glasses)
        dark, count = recolor(name, plain, weights)
        # Keep the existing frame details intact in the recolored glasses render.
        x1, y1, x2, y2 = EYE_REGION[name]
        glass_weight = hair_mask(name, glasses)
        glass_weight[y1:y2, x1:x2] *= (1 - smoothstep(5 / 255, 20 / 255, difference[y1:y2, x1:x2]))
        dark_glasses, count_glasses = recolor(name, glasses, glass_weight)
        assert count > 8000, f"{name}: insufficient hair pixels"
        save_candidate_variant(name, "dark", dark)
        save_candidate_variant(name, "dark-glasses", dark_glasses)
        for label, value in (("dark", dark), ("dark-glasses", dark_glasses), ("eyewear-diagnostic", overlay), ("reconstructed", reconstructed)):
            save_webp(value, OUT / f"{name}-{label}.webp")
        Image.fromarray(np.rint(weights * 255).astype(np.uint8), mode="L").save(OUT / f"{name}-hair-mask.png")
        report["characters"][name] = {
            "recolored_pixels": count,
            "recolored_glasses_pixels": count_glasses,
            "alpha_unchanged": True,
            "protected_face_unchanged": True,
            "eyewear": metrics,
        }
        for col, (label, value) in enumerate((
            ("Original", plain), ("Soft black test", dark), ("Original glasses", glasses),
            ("Black + glasses", dark_glasses), ("Eyewear diagnostic", overlay),
        )):
            x = 12 + col * tile
            y = 12 + row * (tile + 28)
            small = thumb(value, tile - 8)
            qa.paste(small, (x + 4, y), small)
            draw.text((x + 6, y + tile - 2), f"{name}: {label}", font=font, fill="#51445F")
    assert all(hashlib.sha256((SOURCE / key).read_bytes()).hexdigest() == h for key, h in hashes.items())
    (OUT / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    qa.save(OUT / "contact-sheet.jpg", quality=92)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
