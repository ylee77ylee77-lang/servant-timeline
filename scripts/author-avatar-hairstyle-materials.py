"""Author source-locked, colorable hairstyle artwork for P4 visual review.

Each output is one complete illustrated source with a matched two-channel
material coverage map. These are not interchangeable 3D hair layers.
No source image or public directory is changed by this authoring tool.
"""
import argparse
import base64
import importlib.util
import io
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SPEC = importlib.util.spec_from_file_location(
    "source_lock", Path(__file__).with_name("author-avatar-hairstyle-candidates.py"))
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Missing pinned source authoring tool")
art = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(art)
S = 512
NAMES = ("male-short", "male-side", "female-bob", "female-bun")
Y, X = np.indices((S, S), dtype=np.float32)

# Candidate-specific outer limits. Actual hairline/skin ownership is
# resolved from the registered image, not from an old hairstyle's mask.
# Head/neck envelope prevents beige sweater or charcoal hoodie recoloring.
SKIN_ENVELOPES = {
    "male-short": [(106,190),(140,123),(170,86),(250,69),(324,87),(366,132),
        (406,191),(410,252),(376,288),(345,314),(333,367),(348,402),
        (319,427),(266,440),(216,430),(177,401),(193,367),(189,320),
        (154,290),(106,284),(95,236)],
    "male-side": [(106,190),(140,120),(170,90),(250,67),(324,83),(366,126),
        (406,191),(410,252),(376,288),(345,314),(333,367),(348,402),
        (319,427),(266,440),(216,430),(177,401),(193,367),(189,320),
        (154,290),(106,284),(95,236)],
    "female-bob": [(112,213),(145,152),(193,100),(250,76),(314,88),(365,139),
        (412,205),(412,264),(374,291),(341,330),(320,353),(320,388),
        (347,416),(313,439),(271,448),(229,441),(206,423),(218,388),
        (216,352),(175,317),(142,279),(111,262)],
    "female-bun": [(112,213),(145,145),(190,99),(250,76),(318,88),(368,137),
        (415,207),(413,268),(376,289),(342,330),(320,353),(320,388),
        (347,416),(313,439),(271,448),(229,441),(206,423),(218,388),
        (216,352),(175,317),(141,279),(111,262)],
}
# Restrict hair to the actual plausible hair footprint. Gray hood and
# sweater must never be classified as hair. Source appearance, not only
# the envelope, determines ownership within these bounds.
HAIR_LIMITS = {
    "male-short": [(0,0),(512,0),(512,202),(407,214),(382,241),(360,248),
        (150,248),(129,220),(0,196)],
    "male-side": [(0,0),(512,0),(512,202),(407,214),(382,241),(360,248),
        (150,248),(129,220),(0,196)],
    "female-bob": [(0,0),(512,0),(512,388),(386,388),(340,377),
        (222,377),(148,402),(0,402)],
    "female-bun": [(0,0),(512,0),(512,310),(406,336),(363,350),
        (344,371),(177,370),(140,351),(0,320)],
}
PROTECTED = {
    "male": [(211,204),(190,205),(307,202),(326,204),(300,156),(182,169),(257,292),(259,304)],
    "female": [(213,216),(190,219),(312,210),(336,208),(306,161),(225,169),(263,304),(263,317)],
}
SKIN_POINTS = {
    "male": [(212,177),(232,177),(300,145),(200,180),(210,223),(309,222),(286,215),(260,279)],
    "female": [(240,176),(304,151),(307,175),(219,191),(213,239),(309,231),(287,219),(260,289)],
}
ORIGINAL = {"male": {"hair": "#674637", "skin": "#EDB18D"},
            "female": {"hair": "#784E3B", "skin": "#F2BC9C"}}


def poly(points):
    result = np.zeros((S,S), np.uint8)
    cv2.fillPoly(result, [np.asarray(points, np.int32)], 255)
    return result


def smooth(a,b,v):
    t=np.clip((v-a)/(b-a),0,1)
    return t*t*(3-2*t)


def top_clearance(image):
    # Same inset and white rim as the shared renderer. Only the upper
    # silhouette is measured; the shoulders intentionally meet the rim.
    opaque = (image[:,:,3] >= 128) & (Y < 125)
    if not opaque.any():
        raise AssertionError("No top hair silhouette")
    radial=np.hypot(20+472*X/S-256,28+472*Y/S-256)
    return float(228-np.max(radial[opaque]))


def compact_bun(donor, affine, aligned):
    # Render from the uncut donor, not from the already clipped registered
    # bitmap. A smooth monotonic y remap compresses just the upper hair
    # volume. At y=130 the transform and its derivative are identity.
    matrix=np.asarray(affine,np.float32)
    src_y,src_x=np.where(donor[:,:,3]>=128)
    src_top=float(src_y.min())
    coords=np.stack([src_x,src_y,np.ones_like(src_x)],axis=0)
    transformed=matrix@coords
    top=float(transformed[1].min())
    premul=donor.astype(np.float32)/255
    premul[:,:,:3]*=premul[:,:,3:4]
    inv=cv2.invertAffineTransform(matrix)
    for target in (32,38,44,50,56,62):
        shift=max(0,target-top)
        if shift==0 and top_clearance(aligned)>=4:
            return aligned,{"donor_top":src_top,"aligned_top":top,"target_top":target,
                            "upper_compaction":False,"upper_clearance":top_clearance(aligned)}
        pivot=130.
        q=np.clip((pivot-Y)/(pivot-target),0,1)
        mapped=Y-shift*q*q
        mapped=np.where(Y<target,top+(Y-target)*(1+2*shift/(pivot-target)),mapped)
        mx=(inv[0,0]*X+inv[0,1]*mapped+inv[0,2]).astype(np.float32)
        my=(inv[1,0]*X+inv[1,1]*mapped+inv[1,2]).astype(np.float32)
        result=cv2.remap(premul,mx,my,cv2.INTER_CUBIC,borderMode=cv2.BORDER_CONSTANT,borderValue=(0,0,0,0))
        result=np.clip(result,0,1)
        a=result[:,:,3:4]
        rgb=np.divide(result[:,:,:3],a,out=np.zeros_like(result[:,:,:3]),where=a>1e-5)
        rgba=np.rint(np.concatenate([np.clip(rgb,0,1),a],axis=2)*255).astype(np.uint8)
        # Below the upper hair edit the previously registered art is exact.
        rgba[Y>=pivot]=aligned[Y>=pivot]
        clearance=top_clearance(rgba)
        if clearance>=4:
            return rgba,{"donor_top":src_top,"aligned_top":top,"target_top":target,
                         "upper_compaction":True,"upper_clearance":clearance,
                         "donor_has_top_edge":src_top<=1}
    raise AssertionError("Cannot fit the bun within the existing circle without stronger deformation")


def encode_portrait(array, core, path):
    # Lossless WebP first. If necessary quantize only NON-identity RGB
    # values by a small bounded step. Alpha and protected face are exact.
    visible=array[:,:,3]>0
    baseline=array.copy()
    for step in (1,2,3,4,5,6):
        image=baseline.copy()
        target=(~core)&visible
        if step>1:
            values=image[:,:,:3][target].astype(np.float32)
            image[:,:,:3][target]=np.clip(np.rint(values/step)*step,0,255).astype(np.uint8)
        image[:,:,:3][~visible]=0
        Image.fromarray(image).save(path,"WEBP",lossless=True,method=6,exact=False)
        decoded=art.load(path)
        assert np.array_equal(decoded[:,:,3],baseline[:,:,3]),"alpha changed"
        assert np.array_equal(decoded[core],baseline[core]),"identity changed"
        error=np.abs(decoded[:,:,:3].astype(np.int16)-baseline[:,:,:3].astype(np.int16))
        maximum=int(error[visible].max())
        mae=float(error[visible].mean())
        if path.stat().st_size<180*1024:
            assert maximum<=3 and mae<=1.6,"excessive quantization"
            return decoded,{"bytes":path.stat().st_size,"sha256":art.sha(path),
                            "quantization_step":step,"max_rgb_error":maximum,
                            "mean_rgb_error":round(mae,4),"alpha_exact":True,"identity_exact":True}
    raise AssertionError("Cannot meet 180 KiB lossless source budget")


def connected(seed, allowed):
    # Flood only within actual source pixels, not transparent padding.
    count,labels=cv2.connectedComponents(allowed.astype(np.uint8),connectivity=8)
    labels_used=np.unique(labels[seed&allowed])
    labels_used=labels_used[labels_used!=0]
    if not len(labels_used):
        raise AssertionError("Material seed has no connected region")
    return np.isin(labels,labels_used)


# Source-specific feature contours reviewed against the rendered candidates.
# Protect newly exposed brows even where the original hairstyle hid them.
BROWS = {
    "male": [
        [(165,180),(171,167),(184,156),(201,150),(219,149),(234,151),(240,155),(240,164),(218,166),(193,168),(176,175)],
        [(276,155),(283,148),(302,146),(320,148),(335,155),(346,166),(349,175),(332,168),(308,163),(280,165)],
    ],
    "female": [
        [(204,174),(208,167),(219,162),(229,162),(235,165),(238,174),(226,174),(214,175)],
        [(282,164),(292,157),(307,154),(324,154),(336,158),(346,165),(350,175),(332,169),(308,166),(283,171)],
    ],
}
# The neck boundary follows each new garment, not the old v2 mask.
NECK = {
    "male-short": [(194,326),(328,326),(330,367),(341,394),(329,403),(312,415),(291,425),(270,432),(251,430),(229,422),(206,409),(185,394),(193,371)],
    "male-side": [(194,326),(328,326),(330,367),(342,394),(329,403),(311,416),(291,426),(268,432),(250,431),(228,422),(206,408),(185,394),(193,370)],
    "female-bob": [(217,340),(320,340),(320,378),(326,399),(341,414),(326,425),(305,434),(277,438),(252,436),(230,432),(210,424),(203,418),(215,398),(219,378)],
    "female-bun": [(218,340),(319,340),(320,378),(327,398),(344,416),(325,430),(305,437),(276,441),(248,438),(226,433),(207,423),(218,399),(220,377)],
}
EAR_INTERIORS = {
    "male-short": [[(118,210),(132,204),(145,221),(151,250),(143,273),(130,274),(118,264),(113,239)],[(370,213),(384,206),(394,218),(396,242),(388,263),(375,273),(362,262),(363,239)]],
    "male-side": [[(118,210),(132,204),(145,221),(151,250),(143,273),(130,274),(118,264),(113,239)],[(370,213),(384,206),(394,218),(396,242),(388,263),(375,273),(362,262),(363,239)]],
    "female-bob": [[(143,245),(155,241),(166,256),(170,272),(164,282),(153,276),(144,263)],[(377,219),(389,218),(398,234),(396,253),(387,267),(375,270),(368,255)]],
    "female-bun": [[(128,232),(139,221),(151,230),(155,254),(147,268),(136,265),(129,251)],[(377,216),(390,213),(398,231),(394,254),(384,267),(373,264),(367,245)]],
}


def soft_interior(points, feather=3):
    region=poly(points)
    distance=cv2.distanceTransform((region>0).astype(np.uint8),cv2.DIST_L2,5)
    return smooth(0,feather,distance)


def make_coverage(name, image, core, old):
    gender=name.split("-")[0]
    rgb=image[:,:,:3].astype(np.float32)
    r,g,b=rgb[:,:,0],rgb[:,:,1],rgb[:,:,2]
    luma=rgb@np.array([.2126,.7152,.0722],np.float32)
    alpha=image[:,:,3]>1
    se=poly(SKIN_ENVELOPES[name])>0
    he=poly(HAIR_LIMITS[name])>0
    # High-confidence skin from actual RGB plus original locked skin.
    warm=smooth(10,28,r-b)*smooth(8,23,r-g)
    skin_like=smooth(113,168,r)*smooth(66,110,g)*warm
    original_skin=(old[:,:,1]>=225)&core
    skin_seed=((skin_like>=.92)&se&alpha)|original_skin
    skin_allowed=((skin_like>.12)&se&alpha)|original_skin
    skin_connected=connected(skin_seed,skin_allowed)
    skin=np.where(skin_connected,skin_like,0)
    # A 2px ownership band is inferred from the actual photo near a
    # confident skin region; retain shaded skin rather than a pale rim.
    strong_skin=(skin>=.8).astype(np.uint8)
    near_skin=cv2.dilate(strong_skin,np.ones((5,5),np.uint8))>0
    skin=np.maximum(skin,np.where(near_skin&se&alpha,smooth(95,153,r)*smooth(9,25,r-b),0))
    # Hair comes from the visible dark warm material attached to the
    # scalp, including dimensional highlights. No all-image hue shift.
    hair_like=(1-smooth(150,201,luma))*smooth(-4,12,r-b)
    hair_seed=(Y<135)&(hair_like>.84)&he&alpha&~(skin>.65)
    hair_allowed=he&alpha&((hair_like>.12)|((r-b>4)&(luma<207)))&~(skin>.78)
    hair_connected=connected(hair_seed,hair_allowed)
    hair=np.where(hair_connected,hair_like,0)
    # Smooth coverage at a true connected hair edge, not arbitrary brow/cloth.
    hair=np.maximum(hair,np.where((cv2.dilate((hair>.7).astype(np.uint8),np.ones((3,3),np.uint8))>0)&he&alpha,
                                  .65*(1-smooth(170,215,luma)),0))
    # Locked face contains the exact same facial RGB as the source. Preserve
    # its source-specific feature holes. The old hair mask is NOT copied
    # outside the locked identity; newly exposed skin is independently traced.
    hair[core]=0
    skin[core]=old[:,:,1][core].astype(np.float32)/255
    # Carry skin color into its shadows while protecting garment eyelets
    # and knit fibers. Apply a narrow feather only inside the traced neck.
    neck=soft_interior(NECK[name],3)
    lower=Y>=376
    skin[lower]=neck[lower]*alpha[lower]
    hair[lower]*=(1-neck[lower])
    for points in EAR_INTERIORS[name]:
        interior=soft_interior(points,3)*alpha
        ear=interior*smooth(95,151,r)*smooth(8,23,r-b)
        skin=np.maximum(skin,ear)
        hair*=1-ear
    if name=="female-bun":
        wisp=poly([(378,249),(395,251),(396,278),(392,303),(383,319),
                   (370,335),(365,348),(367,365),(356,365),(354,348),
                   (360,332),(373,313),(380,292),(379,270)])>0
        weight=wisp*alpha*(1-smooth(152,205,luma))*smooth(-4,12,r-b)
        hair=np.maximum(hair,weight*(1-skin))
    # Preserve dark brow hairs, tint their bright antialiased skin edges.
    for points in BROWS[gender]:
        envelope=cv2.GaussianBlur(poly(points).astype(np.float32)/255,(5,5),.85)
        dark=(1-smooth(77,145,luma))*envelope
        hair*=1-envelope
        skin*=1-dark
        skin=np.maximum(skin,envelope*smooth(142,188,luma)*alpha)
    # Protect the exact original feature pixels and their antialiased holes
    # on the same facial artboard, including lashes and lips.
    for x,y in PROTECTED[gender]:
        assert core[y,x] or (old[y,x,0]==0 and old[y,x,1]==0), "feature not on locked source"
        # Tiny exact guard around feature sample; larger feature boundary is
        # provided by the verified locked source's green channel.
        skin[y-1:y+2,x-1:x+2]=0
        hair[y-1:y+2,x-1:x+2]=0
    # Avoid overlapping channels. RGB encodes material ownership, not alpha.
    skin=np.clip(skin,0,1)*alpha
    hair=np.clip(hair,0,1)*alpha*(1-skin)
    coverage=np.zeros((S,S,3),np.uint8)
    coverage[:,:,1]=np.rint(skin*255).astype(np.uint8)
    coverage[:,:,0]=np.minimum(np.rint(hair*255),255-coverage[:,:,1]).astype(np.uint8)
    for x,y in PROTECTED[gender]:
        assert coverage[y,x].max()==0
    # Explicit garments and background remain protected at sample points.
    for x,y in [(256,480),(300,500),(20,20),(492,18),(460,490)]:
        assert coverage[y,x].max()==0
    assert np.count_nonzero(coverage[:,:,0]>180)>6000,"insufficient hair ownership"
    assert np.count_nonzero(coverage[:,:,1]>180)>14000,"insufficient skin ownership"
    # Both visible brow centers must be protected on the new source.
    brow_centers=[(208,158),(306,156)] if gender=="male" else [(225,169),(310,162)]
    for x,y in brow_centers:
        assert coverage[y,x,0]<=3,"hair color entered an eyebrow"
        assert coverage[y,x,1]<=12,"skin color entered an eyebrow"
    assert np.max(coverage.astype(np.int16).sum(axis=2))<=255
    assert not np.any(coverage[~alpha])
    return coverage


def tint(image, coverage, original, colors):
    rgb=image[:,:,:3].astype(np.float32)/255
    gray=rgb@np.array([.2126,.7152,.0722],np.float32)
    result=rgb.copy()
    # Match the current runtime transfer tables (33 samples).
    table_x=np.linspace(0,1,33)
    for part,color in colors.items():
        index=0 if part=="hair" else 1
        weights=coverage[:,:,index].astype(np.float32)/255
        srgb=np.asarray([int(original[part][i:i+2],16)/255 for i in (1,3,5)])
        dst=np.asarray([int(color[i:i+2],16)/255 for i in (1,3,5)])
        source=np.clip(srgb@np.array([.2126,.7152,.0722]),1/255,254/255)
        change=np.zeros_like(rgb)
        for c in range(3):
            mid=.025+.92*dst[c]
            if part=="skin":
                table=table_x*dst[c]/max(1/255,srgb[c])
                v=rgb[:,:,c]
            else:
                table=np.where(table_x<=source,mid*table_x/source,
                               mid+(1-mid)*np.power(np.maximum(0,(table_x-source)/(1-source)),1.65))
                v=gray
            change[:,:,c]=np.interp(v,table_x,np.clip(table,0,1))
        result+=(change-rgb)*weights[:,:,None]
    out=image.copy()
    out[:,:,:3]=np.rint(np.clip(result,0,1)*255).astype(np.uint8)
    return out


def emit(label, path):
    data=base64.b64encode(path.read_bytes()).decode("ascii")
    for index in range(0,len(data),3000):
        print(f"P4_ART {label} {index//3000:05d} {data[index:index+3000]}")
    print(f"P4_ART_END {label} {len(data)} {art.sha(path)}")


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--name",choices=NAMES,required=True)
    p.add_argument("--output",type=Path,default=Path(".avatar-hairstyle-material-review"))
    p.add_argument("--emit",action="store_true")
    args=p.parse_args()
    name=args.name
    gender=name.split("-")[0]
    output=args.output.resolve()
    if (art.ROOT/"public").resolve() in (output,*output.parents):
        p.error("Review output must not go into public/")
    output.mkdir(parents=True,exist_ok=True)
    cv2.setNumThreads(1)
    path=art.SOURCE/f"{gender}.webp"
    donor_path=art.ART/f"{name}-candidate.png"
    assert art.sha(path)==art.HASHES[gender]
    data=json.loads((art.ART/"generation.json").read_text())
    expected=next(x["sha256"] for x in data["assets"] if x["file"]==donor_path.name)
    assert art.sha(donor_path)==expected
    original=art.load(path)
    old=np.array(Image.open(art.MASKS/f"{gender}.png").convert("RGB"))
    donor=art.load(donor_path)
    aligned,registration=art.align(original,donor,art.FACE[gender])
    fitting={"upper_compaction":False,"upper_clearance":top_clearance(aligned)}
    if name=="female-bun":
        aligned,fitting=compact_bun(donor,registration["affine"],aligned)
    result,core,face=art.face_lock(original,old,aligned,art.FACE[gender])
    portrait=output/f"{name}.webp"
    result,encoding=encode_portrait(result,core,portrait)
    assert np.array_equal(result[core],original[core])
    mask=make_coverage(name,result,core,old)
    mask_path=output/f"{name}.png"
    Image.fromarray(mask,"RGB").save(mask_path,compress_level=9)
    assert mask_path.stat().st_size<64*1024,"coverage too large"
    checks=[]
    colors=[("Original",{}),("Hair purple",{"hair":"#80618F"}),("Hair silver",{"hair":"#C5C7CB"}),
            ("Skin deep",{"skin":"#885139"}),("Skin light",{"skin":"#F5D7BD"}),
            ("Combined",{"hair":"#554368","skin":"#A96A48"})]
    sheet=Image.new("RGB",(3*266+16,2*295+16),"#FAF8FC")
    draw=ImageDraw.Draw(sheet)
    font=ImageFont.truetype("DejaVuSans.ttf",14)
    for i,(label,selected) in enumerate(colors):
        rendered=tint(result,mask,ORIGINAL[gender],selected) if selected else result
        changed=np.any(rendered[:,:,:3]!=result[:,:,:3],axis=2)
        allowed=np.zeros((S,S),bool)
        for part in selected:
            allowed|=mask[:,:,0 if part=="hair" else 1]>0
        assert not np.any(changed&~allowed),label+": unrelated pixels"
        assert np.array_equal(rendered[:,:,3],result[:,:,3])
        if selected:
            assert changed.sum()>1000
        for x,y in PROTECTED[gender]:
            assert np.array_equal(rendered[y,x],result[y,x]),label+": protected feature changed"
        checks.append({"case":label,"changed_pixels":int(changed.sum()),"outside_changed":0,"alpha_exact":True})
        x=8+(i%3)*266
        y=8+(i//3)*295
        tile=art.tile(rendered,244)
        sheet.paste(tile,(x+10,y),tile)
        draw.text((x+10,y+248),label,font=font,fill="#4B4356")
        small=art.tile(rendered,40)
        sheet.paste(small,(x+212,y+251),small)
    review=output/f"{name}-colors.jpg"
    sheet.save(review,quality=88)
    # Full-size source and explicit mask overlay for art QA.
    overlay=result.copy()
    overlay[:,:,:3]=np.rint(.45*result[:,:,:3]+.55*mask).astype(np.uint8)
    diagnostic=Image.new("RGB",(1024,512),"#EAE2ED")
    for i,im in enumerate((result,overlay)):
        rgba=Image.fromarray(im)
        diagnostic.paste(rgba,(512*i,0),rgba)
    for i in range(0,512,32):
        d=ImageDraw.Draw(diagnostic)
        d.line((i,0,i,512),fill="#C4BDD0",width=1)
        d.text((i+1,1),str(i),font=font,fill="#574B64")
        d.line((0,i,512,i),fill="#C4BDD0",width=1)
        d.text((1,i+2),str(i),font=font,fill="#574B64")
    diag_path=output/f"{name}-coverage.jpg"
    diagnostic.save(diag_path,quality=86)
    report={"name":name,"source":encoding,"coverage":{"bytes":mask_path.stat().st_size,"sha256":art.sha(mask_path),
             "hair_pixels":int(np.count_nonzero(mask[:,:,0]>180)),"skin_pixels":int(np.count_nonzero(mask[:,:,1]>180))},
             "originals":ORIGINAL[gender],"fit":fitting,"registration":registration,"face":face,
             "checks":checks,"visual_gate":"candidate only; human visual QA required"}
    (output/f"{name}.json").write_text(json.dumps(report,indent=2)+"\n")
    print("P4_ART_REPORT "+json.dumps(report),flush=True)
    if args.emit:
        for key,file in (("portrait",portrait),("coverage",mask_path),("review",review),("diagnostic",diag_path)):
            emit(key,file)


if __name__=="__main__":
    main()
