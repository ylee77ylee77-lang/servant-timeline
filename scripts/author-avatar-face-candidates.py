#!/usr/bin/env python3
"""P6 face geometry candidates. Offline authoring only; no runtime paths are registered."""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SIZE = 512
# Exact released art and its existing registered material-ownership atlas.
SOURCES = {
    "male": ("v2/male.webp", "v1/male.png", "7f9899e7024c6090692585ba2fd26fd1430c2760b4d6b531d20ac5e1c7f36e59"),
    "male-glasses": ("v2/male-glasses.webp", "v1/male-glasses.png", "ff9d0e8c53fc5f1168d9e9cc40ebb0f040dc2154225a06a5c99e1364a9ba3cc5"),
    "male-dark": ("v2-tones/male-dark.webp", "v1/male.png", "9a6089d396f8223cdf2a53dfa0b2e7ce8b820892c1fdc2d377fc43bf6da6f07c"),
    "male-dark-glasses": ("v2-tones/male-dark-glasses.webp", "v1/male-glasses.png", "1a1d90c455e0af0dbf8466fe506ba04880435888481351e62c0c347d98db4a1a"),
    "male-short": ("v3/hairstyles/male-short.webp", "v3/hairstyles/male-short.png", "7eac00218d55eea3c127fbacba7367e295dc612bbf664170d1c14fa8fe7a8eaf"),
    "male-side": ("v3/hairstyles/male-side.webp", "v3/hairstyles/male-side.png", "0616e60f5be4cdc094db211a9ebbf62c289b517311a5a7330c614c3cd06211f3"),
    "female": ("v2/female.webp", "v1/female.png", "e95c91cfd17ebc4965c8acfc74d8d4d19d787a5b91a99c46c425221f17b126a2"),
    "female-glasses": ("v2/female-glasses.webp", "v1/female-glasses.png", "a14b3ce493f0d161cd6257d8f334531bc921bc341cf45a46481695ffee80bfb0"),
    "female-dark": ("v2-tones/female-dark.webp", "v1/female.png", "1cfe3de969b0cefb6273d855b0042975dba9d6f9488c28414139b79def9cb4b7"),
    "female-dark-glasses": ("v2-tones/female-dark-glasses.webp", "v1/female-glasses.png", "bc058ce99e0c0627cfc18f5fb77687672ed9e9b1e13fd5699aa779fe212c659a"),
    "female-bob": ("v3/hairstyles/female-bob.webp", "v3/hairstyles/female-bob.png", "fbd3d966ae8759eaace7dff2fae87e06c531f4288013dd66a6ded2c566c83f4d"),
    "female-bun": ("v3/hairstyles/female-bun.webp", "v3/hairstyles/female-bun.png", "4f63b6743ae41fe0e61c01bd39083033de36c7d0ea58cc117f026041420e8e68"),
}
# Inverse sampling scales. The eye band is exactly affine; independent
# eyewear can use the reciprocal forward transform before final composition.
# Jaw and mouth geometry transitions smoothly back to the original neckline.
PROFILES = {
    "male": {"id": "defined", "cx": 259, "cy": 205, "eye_x": 1.07, "eye_y": 1.20,
             "jaw_x": -.12, "jaw_start": 275, "jaw_peak": 299, "end": 317, "jaw_y": -3.5},
    "female": {"id": "oval", "cx": 264, "cy": 216, "eye_x": .97, "eye_y": 1.16,
               "jaw_x": .15, "jaw_start": 275, "jaw_peak": 329, "end": 375, "jaw_y": -6},
}

def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()

def smooth(a, b, t):
    k = np.clip((t-a)/(b-a), 0, 1)
    return k*k*(3-2*k)

def maps(gender):
    p = PROFILES[gender]
    y, x = np.mgrid[:SIZE, :SIZE].astype(np.float32)
    window = smooth(64, 135, x) * (1-smooth(390, 456, x))
    eye = smooth(108, 150, y)*(1-smooth(275, p["end"], y))
    jaw = smooth(p["jaw_start"], p["jaw_peak"], y)*(1-smooth(p["jaw_peak"], p["end"], y))
    mx = x+(x-p["cx"])*window*((p["eye_x"]-1)*eye+p["jaw_x"]*jaw)
    my = y+window*((y-p["cy"])*(p["eye_y"]-1)*eye+p["jaw_y"]*jaw)
    mx, my = mx.astype(np.float32), my.astype(np.float32)
    fixed = (mx == x) & (my == y)
    # No folded/inverted mesh: positive Jacobian throughout the grid.
    dmx_dy, dmx_dx = np.gradient(mx)
    dmy_dy, dmy_dx = np.gradient(my)
    jac = dmx_dx*dmy_dy-dmx_dy*dmy_dx
    assert float(jac.min()) > .18, "non-invertible face mapping"
    assert fixed[:108].all() and fixed[p["end"]:].all(), "head top or original clothing changed"
    # All vector eyewear bounds are in the affine region.
    sl = np.s_[150:275, 135:391]
    assert np.max(abs(mx[sl]-(p["cx"]+(x[sl]-p["cx"])*p["eye_x"]))) < .001
    assert np.max(abs(my[sl]-(p["cy"]+(y[sl]-p["cy"])*p["eye_y"]))) < .001
    return mx, my, fixed, float(jac.min())

def remap(a, mx, my):
    return cv2.remap(a, mx, my, cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)

def warp_art(a, mx, my, fixed):
    alpha = a[:,:,3:4].astype(np.float32)/255
    premul = np.concatenate((a[:,:,:3].astype(np.float32)*alpha, a[:,:,3:4].astype(np.float32)),axis=2)
    mapped = remap(premul, mx, my)
    opacity = mapped[:,:,3:4]/255
    rgb = np.divide(mapped[:,:,:3], opacity, out=np.zeros_like(mapped[:,:,:3]), where=opacity>0)
    result = np.rint(np.clip(np.concatenate((rgb,mapped[:,:,3:4]),axis=2),0,255)).astype(np.uint8)
    result[fixed] = a[fixed]
    return result

def tile(a, size):
    # Same 512px artboard scale and white circular frame as the app.
    image = Image.fromarray(a, "RGBA").resize((int(size*472/512),)*2,Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA",(size,size),"#D9EEFF")
    canvas.alpha_composite(image,(round(size*20/512),round(size*28/512)))
    mask = Image.new("L",(size,size),0)
    ImageDraw.Draw(mask).ellipse((3,3,size-4,size-4),fill=255)
    out = Image.new("RGB",(size,size),"#F4F1F8")
    out.paste(canvas,(0,0),mask)
    ImageDraw.Draw(out).ellipse((4,4,size-5,size-5),outline="white",width=max(2,round(size*16/512)))
    return out

def emit(label, path):
    data=base64.b64encode(path.read_bytes()).decode("ascii")
    for i in range(0,len(data),3000):
        print(f"P6_ART {label} {i//3000:05d} {data[i:i+3000]}")
    print(f"P6_ART_END {label} {len(data)} {sha(path)}")

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--name",choices=list(SOURCES),required=True)
    ap.add_argument("--output",type=Path,default=Path("avatar-face-review"))
    ap.add_argument("--emit",action="store_true")
    args=ap.parse_args()
    cv2.setNumThreads(1)
    name=args.name
    gender=name.split("-")[0]
    source,mask,expected=SOURCES[name]
    source=ROOT/"public/avatar/scenes"/source
    mask=ROOT/"public/avatar/materials"/mask
    assert sha(source)==expected, "Source changed; re-register before authoring"
    a=np.array(Image.open(source).convert("RGBA"))
    coverage=np.array(Image.open(mask).convert("RGB"))
    assert a.shape==(SIZE,SIZE,4) and coverage.shape==(SIZE,SIZE,3)
    mx,my,fixed,jac=maps(gender)
    candidate=warp_art(a,mx,my,fixed)
    new_coverage=remap(coverage,mx,my)
    new_coverage[fixed]=coverage[fixed]
    # Round-off can add a single unit to independently quantized channels.
    # Normalize only changed pixels if the sum exceeds the original 256 bound.
    sums=new_coverage.astype(np.uint16).sum(axis=2)
    over=(sums>256)&~fixed
    if over.any():
        new_coverage[over]=np.floor(new_coverage[over].astype(np.float32)*255/sums[over,None]).astype(np.uint8)
    assert np.array_equal(candidate[fixed],a[fixed])
    assert np.array_equal(new_coverage[fixed],coverage[fixed])
    assert new_coverage.astype(np.uint16).sum(axis=2).max()<=256
    assert np.count_nonzero(new_coverage[:,:,0]>150)>3000 and np.count_nonzero(new_coverage[:,:,1]>150)>5000
    changed=np.any(np.abs(candidate[:,:,:3].astype(np.int16)-a[:,:,:3].astype(np.int16))>8,axis=2)
    visible=(a[:,:,3]>64)&(candidate[:,:,3]>64)
    face_roi=np.s_[150:310,145:380]
    changed_face=int((changed&visible)[face_roi].sum())
    assert changed_face>1800, "face geometry is not distinguishable"
    output=args.output.resolve()/name
    assert (ROOT/"public").resolve() not in (output,*output.parents), "candidate must not overwrite release assets"
    output.mkdir(parents=True,exist_ok=True)
    portrait=output/f"{name}.webp"
    atlas=output/f"{name}.png"
    Image.fromarray(candidate,"RGBA").save(portrait,lossless=True,exact=True,method=5)
    Image.fromarray(new_coverage,"RGB").save(atlas,compress_level=9)
    decoded=np.array(Image.open(portrait).convert("RGBA"))
    assert np.array_equal(decoded[:,:,3],candidate[:,:,3])
    assert np.array_equal(decoded[candidate[:,:,3]>0],candidate[candidate[:,:,3]>0]), "codec altered visible artwork"
    sheet=Image.new("RGB",(544,378),"#F4F1F8")
    for i,im in enumerate((a,decoded)):
        x=8+264*i
        sheet.paste(tile(im,256),(x,8))
        sheet.paste(tile(im,80),(x+88,270))
        ImageDraw.Draw(sheet).text((x+8,354),("Original" if i==0 else "Candidate "+PROFILES[gender]["id"]),fill="#443B4E")
    review=output/"comparison.jpg"
    sheet.save(review,quality=88)
    profile=PROFILES[gender]
    report={"name":name,"source_sha256":expected,"coverage_source_sha256":sha(mask),
        "portrait_sha256":sha(portrait),"coverage_sha256":sha(atlas),"portrait_bytes":portrait.stat().st_size,
        "changed_face_pixels":changed_face,"minimum_jacobian":jac,"fixed_pixels":int(fixed.sum()),
        "eye_forward_transform":{"cx":profile["cx"],"cy":profile["cy"],"sx":1/profile["eye_x"],"sy":1/profile["eye_y"]},
        "neckline_preserved":True,"visual_acceptance":"NOT_APPROVED","method":"source-derived smooth 2D geometry, not a separate 3D rig"}
    (output/"report.json").write_text(json.dumps(report,indent=2)+"\n")
    print("P6_FACE_PROOF "+json.dumps(report),flush=True)
    if args.emit:
        for key,file in (("portrait",portrait),("coverage",atlas),("review",review)):
            emit(key,file)

if __name__=="__main__":
    main()
