"""Validate authored 3D avatar artwork (developer-only; no production dependency).

Usage: python3 scripts/verify-avatar-artwork.py
Requires Pillow and numpy. Verifies all canvas dimensions, transparency, and
measurable front-layer overlap with the fixed white frame, then writes a QA contact sheet.
"""
from pathlib import Path
import math
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'public/avatar/scenes/v2'
KINDS = ('sheep','doe','lion','eagle')
ARTBOARD = 512
OUT = ROOT / '.avatar-qa'
OUT.mkdir(exist_ok=True)

for name in ('male','female','male-glasses','female-glasses'):
    im=Image.open(ART/f'{name}.webp').convert('RGBA')
    assert im.size==(ARTBOARD,ARTBOARD), f'{name}: wrong artboard dimensions'
    assert im.getchannel('A').getextrema()==(0,255), f'{name}: missing alpha channel'

Y,X=np.ogrid[:512,:512]
R=np.sqrt((X-256)**2+(Y-256)**2)
FRAME=(R>=228)&(R<=244)
FACE=(X>=225)&(X<=355)&(Y>=155)&(Y<=355)
for name in KINDS:
    back=Image.open(ART/f'{name}-behind.webp').convert('RGBA')
    front=Image.open(ART/f'{name}-front.webp').convert('RGBA')
    assert back.size==front.size==(ARTBOARD,ARTBOARD)
    assert back.getchannel('A').getextrema()[0]==0 and front.getchannel('A').getextrema()[0]==0, f'{name}: opaque background'
    fa=np.array(front.getchannel('A'))>40
    ba=np.array(back.getchannel('A'))>40
    ring_pixels=np.count_nonzero(fa&FRAME)
    assert ring_pixels>=80, f'{name}: front anatomy does not touch the white rim'
    assert np.count_nonzero(ba&FACE)<400, f'{name}: companion hides the face'
    print(name, 'front-on-ring pixels:', ring_pixels)

# QA previews intentionally reuse identical layer dimensions/order (not CSS or separate layouts).
colors={'lavender':'#e8daf9','peach':'#fbe2d6','mint':'#d9f2e4','sky':'#d5e9ff','sand':'#f5e4c9'}
qa=Image.new('RGB',(5*240,2*258),'#f8f7fa')
for row,person in enumerate(('male','female-glasses')):
    for col,(animal,color) in enumerate(zip((*KINDS,None),colors.values())):
        canvas=Image.new('RGBA',(512,512))
        layer=Image.new('RGBA',(512,512))
        ImageDraw.Draw(layer).ellipse((20,20,492,492),fill=color)
        canvas.alpha_composite(layer)
        clip=Image.new('L',(512,512),0);ImageDraw.Draw(clip).ellipse((20,20,492,492),fill=255)
        for name in (person, *([f'{animal}-behind'] if animal else [])):
            obj=Image.open(ART/f'{name}.webp').convert('RGBA'); alpha=obj.getchannel('A')
            from PIL import ImageChops
            obj.putalpha(ImageChops.multiply(alpha,clip));canvas.alpha_composite(obj)
        white=Image.new('RGBA',(512,512));ImageDraw.Draw(white).ellipse((20,20,492,492),outline='white',width=16)
        canvas.alpha_composite(white)
        if animal: canvas.alpha_composite(Image.open(ART/f'{animal}-front.webp').convert('RGBA'))
        small=canvas.resize((217,217),Image.Resampling.LANCZOS)
        x=col*240+11;y=row*258+10
        qa.paste(small,(x,y),small)
        ImageDraw.Draw(qa).text((x+8,y+225),f'{person}/{animal or "none"}',fill='#55446d')
qa.save(OUT/'avatar-scenes.jpg',quality=90)
print('QA contact sheet:',OUT/'avatar-scenes.jpg')