"""Create source-locked hairstyle review art from the existing approved portraits.

This is an OFFLINE art-authoring experiment, not the runtime renderer. All four
donors are flattened candidate illustrations; no complete 3D rig, unseen scalp,
or clean hair/face layer is implied. Keep the original expression/identity pixels
exactly in the protected face region, align candidate hair around them, and
export real comparison artwork. No candidate is automatically registered.
"""
from pathlib import Path
import argparse
import base64
import hashlib
import io
import json
import math

import cv2
import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SIZE = 512
ART = ROOT / "docs/avatar-art-direction"
SOURCE = ROOT / "public/avatar/scenes/v2"
MASKS = ROOT / "public/avatar/materials/v1"
CANDIDATES = {"male": ("short", "side"), "female": ("bob", "bun")}
# Interior face anchors and a deliberately conservative original expression
# footprint. Feather outside these polygons, never across the exact core.
FACE = {
    "male": {
        "match": (169, 171, 347, 319),
        "points": [(210, 204, 21, 17), (308, 202, 21, 17), (258, 290, 33, 13)],
        "core": [(177, 183), (200, 172), (237, 171), (253, 152), (276, 145),
                 (314, 148), (337, 163), (347, 190), (348, 237), (332, 280),
                 (310, 309), (272, 334), (239, 334), (208, 312), (183, 281),
                 (168, 248), (168, 212)],
    },
    "female": {
        "match": (177, 185, 349, 327),
        "points": [(213, 216, 21, 17), (312, 210, 21, 17), (263, 304, 33, 13)],
        "core": [(183, 207), (209, 182), (230, 173), (254, 153), (282, 148),
                 (311, 153), (336, 173), (350, 194), (354, 229), (349, 258),
                 (332, 294), (309, 323), (271, 343), (241, 341), (211, 322),
                 (188, 293), (168, 255), (170, 228)],
    },
}
HASHES = {
    "male": "7f9899e7024c6090692585ba2fd26fd1430c2760b4d6b531d20ac5e1c7f36e59",
    "female": "e95c91cfd17ebc4965c8acfc74d8d4d19d787a5b91a99c46c425221f17b126a2",
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    im = Image.open(path).convert("RGBA")
    if im.size != (SIZE, SIZE):
        im = im.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    return np.array(im)


def gray(image):
    # Composite to a constant neutral field for registration; never include
    # arbitrary hidden RGB from fully transparent pixels.
    alpha = image[:, :, 3:4].astype(np.float32) / 255
    rgb = image[:, :, :3].astype(np.float32) * alpha + 128 * (1 - alpha)
    return cv2.cvtColor(rgb.astype(np.uint8), cv2.COLOR_RGB2GRAY)


def align(original, donor, spec):
    # Register an entire expression patch at multiple scales rather than
    # assuming that two independently generated faces share a camera.
    x0, y0, x1, y1 = spec["match"]
    target = gray(original)
    incoming = gray(donor)
    template = target[y0:y1, x0:x1]
    best = None
    for scale in np.linspace(.78, 1.28, 51):
        h, w = max(1, round(SIZE * scale)), max(1, round(SIZE * scale))
        sample = cv2.resize(incoming, (w, h), interpolation=cv2.INTER_CUBIC)
        match = cv2.matchTemplate(sample, template, cv2.TM_CCOEFF_NORMED)
        yy, xx = np.indices(match.shape)
        # Face remains roughly centered. Penalize implausible transformations
        # (but allow the documented shifts in the candidate portraits).
        dx = x0 - xx + (w - SIZE) / 2
        dy = y0 - yy + (h - SIZE) / 2
        valid = (np.abs(dx) <= 75) & (np.abs(dy) <= 80)
        scores = np.where(valid, match, -2)
        y, x = np.unravel_index(np.argmax(scores), scores.shape)
        score = float(scores[y, x])
        if best is None or score > best[0]:
            best = (score, w / SIZE, h / SIZE, x0 - int(x), y0 - int(y))
    assert best is not None
    score, sx, sy, tx, ty = best
    matrix = np.array([[sx, 0, tx], [0, sy, ty]], dtype=np.float32)

    def warp(mat):
        # Warp premultiplied RGBA, avoiding dark seams at the silhouette.
        src = donor.astype(np.float32) / 255
        src[:, :, :3] *= src[:, :, 3:4]
        dst = cv2.warpAffine(src, mat, (SIZE, SIZE), flags=cv2.INTER_CUBIC,
                             borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
        dst = np.clip(dst, 0, 1)
        alpha = dst[:, :, 3:4]
        rgb = np.divide(dst[:, :, :3], alpha, out=np.zeros_like(dst[:, :, :3]), where=alpha > 1e-5)
        return np.rint(np.concatenate([np.clip(rgb, 0, 1), alpha], axis=2) * 255).astype(np.uint8)

    first = warp(matrix)
    observed, expected, scores = [], [], []
    registered = gray(first)
    for x, y, hw, hh in spec["points"]:
        margin = 20
        patch = target[y-hh:y+hh+1, x-hw:x+hw+1]
        window = registered[y-hh-margin:y+hh+margin+1, x-hw-margin:x+hw+margin+1]
        matches = cv2.matchTemplate(window, patch, cv2.TM_CCOEFF_NORMED)
        _, quality, _, loc = cv2.minMaxLoc(matches)
        observed.append([x + loc[0] - margin, y + loc[1] - margin])
        expected.append([x, y])
        scores.append(float(quality))
    observed = np.asarray(observed, dtype=np.float32)
    expected = np.asarray(expected, dtype=np.float32)
    # A small similarity refinement keeps the donor geometry coherent.
    correction, _ = cv2.estimateAffinePartial2D(observed, expected, method=cv2.LMEDS)
    used = False
    if correction is not None:
        k = math.hypot(correction[0, 0], correction[1, 0])
        angle = math.degrees(math.atan2(correction[1, 0], correction[0, 0]))
        predicted = cv2.transform(observed[None, :, :], correction)[0]
        pre = float(np.mean(np.linalg.norm(observed-expected, axis=1)))
        post = float(np.mean(np.linalg.norm(predicted-expected, axis=1)))
        if .91 <= k <= 1.09 and abs(angle) <= 5 and min(scores) >= .25 and post < pre:
            matrix = (correction @ np.vstack((matrix, [0, 0, 1]))).astype(np.float32)
            used = True
    result = warp(matrix)
    # Re-measure anchors in the final image; no optimistic registration claim.
    final = gray(result)
    offsets = []
    for x, y, hw, hh in spec["points"]:
        margin = 20
        patch = target[y-hh:y+hh+1, x-hw:x+hw+1]
        window = final[y-hh-margin:y+hh+margin+1, x-hw-margin:x+hw+margin+1]
        _, quality, _, loc = cv2.minMaxLoc(cv2.matchTemplate(window, patch, cv2.TM_CCOEFF_NORMED))
        offsets.append({"anchor": [x, y], "offset": [loc[0]-margin, loc[1]-margin], "score": round(float(quality), 4)})
    return result, {"template_score": round(score, 4), "affine": matrix.tolist(),
                    "refined": used, "final_anchors": offsets}


def face_lock(original, coverage, donor, spec):
    polygon = np.zeros((SIZE, SIZE), dtype=np.uint8)
    cv2.fillPoly(polygon, [np.asarray(spec["core"], dtype=np.int32)], 255)
    # The pinned v2 coverage is a material map, not a complete image alpha.
    # Preserve the original expression, but exclude source hair from the core.
    # A v2 material map is designed for recoloring, not geometric ownership.
    # Lock the actual source landmark footprints explicitly, including dark
    # lashes/lips, rather than inferring them from a hair tint classification.
    landmarks = np.zeros((SIZE, SIZE), dtype=np.uint8)
    for x, y, hw, hh in spec["points"]:
        cv2.ellipse(landmarks, (x, y), (hw, hh), 0, 0, 360, 255, -1)
    # Source rasters can have near-opaque alpha (e.g. 254) within the face.
    # Preserve those RGBA values exactly too; only genuinely transparent
    # source pixels are ineligible for a locked facial expression.
    visible = original[:, :, 3] >= 245
    eligible = visible & (coverage[:, :, 0] <= 8)
    core = ((polygon > 0) & eligible) | ((landmarks > 0) & visible)
    for x, y, _, _ in spec["points"]:
        assert core[y, x], f"protected landmark {(x,y)} not on source face: alpha={original[y,x,3]} material={coverage[y,x].tolist()}"
    distance = cv2.distanceTransform((~core).astype(np.uint8), cv2.DIST_L2, 5)
    fade = np.clip(1 - distance / 17, 0, 1)
    fade = fade * fade * (3 - 2 * fade)
    # Never introduce old hair or transparent edge colors during the blend.
    source_hair = coverage[:, :, 0].astype(np.float32) / 255
    weight = fade * (1 - source_hair) * (original[:, :, 3].astype(np.float32) / 255)
    weight *= (donor[:, :, 3] > 200)
    weight[core] = 1

    # Match the donor's skin locally around the new hairline. Only a limited
    # chroma adjustment in skin-like pixels near the identity transition;
    # no global recolor of hair or clothing.
    source_rgb = original[:, :, :3].astype(np.float32)
    donor_rgb = donor[:, :, :3].astype(np.float32)
    skin = core & (coverage[:, :, 1] >= 240) & (donor[:, :, 3] >= 245)
    skin &= (donor_rgb[:, :, 0] - donor_rgb[:, :, 2] > 28) & (donor_rgb[:, :, 0] > 145)
    assert np.count_nonzero(skin) > 500, "insufficient comparable skin samples"
    delta = np.clip(np.median(source_rgb[skin] - donor_rgb[skin], axis=0), -26, 26)
    # The adjustment is only for the blend seam, tapering before exposed hair.
    donor_skin = ((donor_rgb[:, :, 0] - donor_rgb[:, :, 2] > 28) &
                  (donor_rgb[:, :, 0] > 145) & (donor_rgb[:, :, 1] > 85)).astype(np.float32)
    correction = np.clip(1 - distance / 35, 0, 1) * donor_skin
    corrected = np.clip(donor_rgb + correction[:, :, None] * delta, 0, 255)
    # Correct alpha compositing, with original opaque core kept bit-identical.
    oa = original[:, :, 3].astype(np.float32) / 255
    da = donor[:, :, 3].astype(np.float32) / 255
    a = oa * weight + da * (1 - weight)
    numerator = source_rgb * (oa*weight)[:, :, None] + corrected * (da*(1-weight))[:, :, None]
    rgb = np.divide(numerator, a[:, :, None], out=np.zeros_like(numerator), where=a[:, :, None] > 1e-6)
    result = np.concatenate([np.rint(np.clip(rgb, 0, 255)).astype(np.uint8), np.rint(a*255).astype(np.uint8)[:, :, None]], axis=2)
    result[core] = original[core]
    assert np.array_equal(result[core], original[core]), "protected face pixels changed"
    assert np.count_nonzero(core) > 12000
    # Significant changes away from the face are expected. A candidate is not
    # useful if it merely reproduces the original image.
    changed = np.any(result != original, axis=2)
    return result, core, {"protected_pixels": int(core.sum()), "protected_changed_pixels": int(np.count_nonzero(changed & core)),
                          "outside_core_changed_pixels": int(np.count_nonzero(changed & ~core)),
                          "skin_seam_rgb_correction": [float(v) for v in delta]}


def tile(array, size, bg="#E8E2F0"):
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(canvas).ellipse((20, 20, 492, 492), fill=bg)
    canvas.alpha_composite(Image.fromarray(array).resize((472, 472), Image.Resampling.LANCZOS), (20, 28))
    clip = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(clip).ellipse((20, 20, 492, 492), fill=255)
    canvas.putalpha(ImageChops.multiply(canvas.getchannel("A"), clip))
    ImageDraw.Draw(canvas).ellipse((20, 20, 492, 492), outline="white", width=16)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path(".avatar-hairstyle-review"))
    args = parser.parse_args()
    output = args.output.resolve()
    if (ROOT / "public") in (output, *output.parents):
        parser.error("Never write review artwork into public/")
    output.mkdir(parents=True, exist_ok=True)
    cv2.setNumThreads(1)
    metadata = json.loads((ART / "generation.json").read_text())
    donor_hashes = {entry["file"]: entry["sha256"] for entry in metadata["assets"]}
    review = Image.new("RGB", (5 * 208 + 24, 2 * 260 + 24), "#F8F6FA")
    labels = ImageDraw.Draw(review)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 14)
    except OSError:
        font = ImageFont.load_default()
    reports = []
    for row, (gender, choices) in enumerate(CANDIDATES.items()):
        path = SOURCE / f"{gender}.webp"
        assert sha(path) == HASHES[gender], "source portrait changed"
        original = load(path)
        coverage = np.array(Image.open(MASKS / f"{gender}.png").convert("RGB"))
        assert coverage.shape == (512, 512, 3)
        samples = [("Original", original)]
        for style in choices:
            name = f"{gender}-{style}"
            donor_path = ART / f"{name}-candidate.png"
            assert sha(donor_path) == donor_hashes[donor_path.name], "candidate source changed"
            registered, registration = align(original, load(donor_path), FACE[gender])
            result, core, metrics = face_lock(original, coverage, registered, FACE[gender])
            out = output / f"{name}-locked.webp"
            Image.fromarray(result).save(out, "WEBP", lossless=True, method=6, exact=True)
            decoded = load(out)
            assert np.array_equal(decoded[core], original[core]), "codec changed face pixels"
            assert np.array_equal(decoded[:, :, 3], result[:, :, 3])
            Image.fromarray((core * 255).astype(np.uint8)).save(output / f"{name}-face-lock.png")
            Image.fromarray(registered).save(output / f"{name}-aligned-donor.png")
            samples += [(f"{style} donor", registered), (f"{style} locked", result)]
            item = {"name": name, "source_sha256": sha(path), "donor_sha256": sha(donor_path),
                    "registration": registration, **metrics, "webp_bytes": out.stat().st_size,
                    "webp_sha256": sha(out), "mobile_budget_met": out.stat().st_size < 180 * 1024,
                    "visual_approval": False, "runtime_registered": False}
            reports.append(item)
            print("AVATAR_ART_CASE " + json.dumps(item), flush=True)
        for col, (label, value) in enumerate(samples):
            x, y = 12 + col*208, 12 + row*260
            portrait = tile(value, 184)
            review.paste(portrait, (x+12, y), portrait)
            labels.text((x+10, y+190), f"{gender} / {label}", font=font, fill="#433D4E")
            # A realistic small avatar review next to each full-size candidate.
            thumb = tile(value, 48)
            review.paste(thumb, (x+80, y+208), thumb)
    review.save(output / "hairstyle-review.jpg", quality=94)
    report = {"scope": "offline candidate source art; not interchangeable layers or runtime approval",
              "cases": reports, "candidate_count": len(reports), "protected_face_gate_passed": all(r["protected_changed_pixels"] == 0 for r in reports),
              "visual_gate": "manual review required: alignment, seams, hairline, ears, neck, clothing, occlusion, materials"}
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n")
    # Small, non-sensitive preview for connector-based visual inspection.
    # The full-resolution artwork and report are uploaded separately.
    small = review.copy()
    small.thumbnail((900, 500))
    buffer = io.BytesIO()
    small.save(buffer, "JPEG", quality=79)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    for index in range(0, len(encoded), 1000):
        print("AVATAR_REVIEW_JPEG %05d %s" % (index // 1000, encoded[index:index+1000]))
    print("AVATAR_REVIEW_DONE " + json.dumps({"cases": len(reports), "protected_face_gate_passed": report["protected_face_gate_passed"]}))


if __name__ == "__main__":
    main()
