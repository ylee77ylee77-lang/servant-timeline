/** Render the real existing AvatarEyewear component against candidate portraits.
 * Test harness only: not an interactive AvatarRenderer registration.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { avatarMaterialTransfer } from "../lib/profile/avatar-materials.ts";
import { B_EYEWEAR_FITS, B_EYEWEAR_CHOICES, getCandidateEyewearPlan } from "./avatar-candidate-eyewear-fits.mjs";

const h=React.createElement;
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const uri=bytes=>"data:image/png;base64,"+bytes.toString("base64");
const SIZES=[48,80,104,256];
const IDS=["male-b","male-b-short","male-b-side","female-b","female-b-bob","female-b-bun"];
const COLORS={classic:"#B88E55",round:"#B88E55",square:"#496C94"};
async function pixels(png,size){
  const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([info.width,info.height,info.channels],[size,size,4]);
  return data;
}
function delta(a,b,i){return Math.max(...[0,1,2].map(c=>Math.abs(a[i+c]-b[i+c])));}

export async function verifyIndependentEyewear(root,output,loadComponent,svgFor){
  const dir=path.join(root,"docs/avatar-face-masters");
  const masters=JSON.parse(await fs.readFile(path.join(dir,"materials","manifest.json"),"utf8"));
  const variants=JSON.parse(await fs.readFile(path.join(dir,"hairstyle-materials","manifest.json"),"utf8"));
  assert.equal(masters.status,"candidate-only");
  assert.equal(variants.status,"candidate-only");
  const {AvatarEyewear}=loadComponent(path.join(root,"components/profile/AvatarEyewear.tsx"));
  const {AVATAR_PORTRAIT_BOUNDS:b,AVATAR_FRAME:f}=loadComponent(path.join(root,"lib/profile/avatar-scene.ts"));
  assert.deepEqual([b.x,b.y,b.size],[20,28,472]);
  assert.deepEqual([f.cx,f.cy,f.radius],[256,256,236]);
  function render(art,plan,size,sourceCoordinates=false){
    const frame=plan?h(AvatarEyewear,{plan,id:"candidate-frame"}):null;
    const portrait=art?h("image",{href:art,x:b.x,y:b.y,width:b.size,height:b.size}):null;
    const viewBox=sourceCoordinates?`${b.x} ${b.y} ${b.size} ${b.size}`:"0 0 512 512";
    const children=sourceCoordinates?[portrait,frame]:[
      h("defs",{key:"defs"},h("clipPath",{id:"candidate-circle"},h("circle",{cx:f.cx,cy:f.cy,r:f.radius}))),
      h("circle",{key:"bg",cx:f.cx,cy:f.cy,r:f.radius,fill:"#DCE9F7"}),
      h("g",{key:"portrait",clipPath:"url(#candidate-circle)"},portrait,frame),
      h("circle",{key:"rim",cx:f.cx,cy:f.cy,r:f.radius,fill:"none",stroke:"#fff",strokeWidth:f.stroke}),
    ];
    return sharp(Buffer.from(renderToStaticMarkup(h("svg",{xmlns:"http://www.w3.org/2000/svg",width:size,height:size,viewBox},...children)))).png().toBuffer();
  }
  const sizeCases=[], sourceCases=[], combinedCases=[], tiles=[];
  async function tile(png,row,col,label){
    const thumb=await sharp(png).resize(192,192).flatten({background:"#F2EEF7"}).png().toBuffer();
    tiles.push({input:thumb,left:col*200+4,top:row*218+26});
    tiles.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="26"><text x="5" y="17" font-family="sans-serif" font-size="11" fill="#484151">${label}</text></svg>`),left:col*200,top:row*218});
  }
  for(const [row,id] of IDS.entries()){
    const base=id.startsWith("male-b")?"male-b":"female-b";
    const original=id===base;
    const spec=masters.sources[base];
    const registered=original?spec:variants.variants[id];
    assert.ok(spec&&registered);
    const art=await fs.readFile(path.join(dir,original?id+".webp":"hairstyles/"+id+".webp"));
    assert.equal(hash(art),registered.sourceSha256);
    // Base masks were regenerated and verified earlier in this same run.
    const mask=await fs.readFile(original?path.join(output,base+"-refined-mask.png"):path.join(dir,"hairstyle-materials",id+".png"));
    if(!original)assert.equal(hash(mask),registered.maskSha256);
    const coverage=await pixels(mask,512);
    const artUri=uri(await sharp(art).png().toBuffer());
    const maskUri=uri(mask);
    const sourcePlain=await pixels(await render(artUri,null,512,true),512);
    const eyes=B_EYEWEAR_FITS[base].eyes;
    const baselines=new Map();
    for(const size of SIZES){
      const png=await render(artUri,null,size);
      baselines.set(size,await pixels(png,size));
      if(size===256)await tile(png,row,0,id+" none");
    }
    const materialPlan={coverageUri:maskUri,frameGuard:false,channels:[
      {part:"hair",tables:avatarMaterialTransfer(spec.originals.hair,"#A06EE8","hair")},
      {part:"skin",tables:avatarMaterialTransfer(spec.originals.skin,"#986448","skin")},
    ]};
    const tintedPortrait=uri(await sharp(svgFor(artUri,materialPlan)).png().toBuffer());
    const tintedBase=await pixels(await render(tintedPortrait,null,256),256);
    for(const [col,choice] of B_EYEWEAR_CHOICES.entries()){
      const plan=getCandidateEyewearPlan(base,choice,undefined,maskUri);
      const colored=getCandidateEyewearPlan(base,choice,COLORS[choice],maskUri);
      const reset=getCandidateEyewearPlan(base,choice,undefined,maskUri);
      assert.deepEqual(reset,plan);
      const frame=await pixels(await render(null,plan,512,true),512);
      const frameOpen=await pixels(await render(null,getCandidateEyewearPlan(base,choice,undefined,undefined),512,true),512);
      const sourceWithFrame=await pixels(await render(artUri,plan,512,true),512);
      const sourceWithTint=await pixels(await render(artUri,colored,512,true),512);
      let occluded=0, visible=0, recolored=0, alphaDelta=0;
      for(let y=0;y<512;y++)for(let x=0;x<512;x++){
        const i=(y*512+x)*4;
        alphaDelta=Math.max(alphaDelta,Math.abs(sourceWithFrame[i+3]-sourcePlain[i+3]),Math.abs(sourceWithTint[i+3]-sourcePlain[i+3]));
        if(frame[i+3]>8)visible++;
        if(delta(sourceWithFrame,sourceWithTint,i)>8)recolored++;
        if(frameOpen[i+3]>8 && x>0&&x<511&&y>0&&y<511){
          // Test the interior of the hair ownership region, not a
          // fractional or resampled edge pixel.
          let hairCore=true;
          for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(coverage[((y+dy)*512+x+dx)*4]!==255)hairCore=false;
          if(hairCore){assert.ok(frame[i+3]<=1,id+"/"+choice+": frame leaks through hair");occluded++;}
        }
      }
      assert.ok(visible>1000&&recolored>1000,id+"/"+choice+": missing frame or color");
      assert.ok(alphaDelta<=1,id+"/"+choice+": source transparency changed");
      for(const [x,y] of eyes)for(let dy=-5;dy<=5;dy++)for(let dx=-8;dx<=8;dx++){
        const i=((y+dy)*512+x+dx)*4;
        assert.ok(frame[i+3]<=1,id+"/"+choice+": frame crossed pupil patch");
        assert.ok(delta(sourceWithFrame,sourcePlain,i)<=1&&delta(sourceWithTint,sourcePlain,i)<=1,id+"/"+choice+": clear lens changed source eye");
      }
      for(const [x,y] of spec.protected.slice(4))for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const i=((y+dy)*512+x+dx)*4;
        assert.ok(delta(sourceWithFrame,sourcePlain,i)<=1&&delta(sourceWithTint,sourcePlain,i)<=1,id+"/"+choice+": mouth/clothing changed");
      }
      sourceCases.push({id,choice,visible,recolored,occluded,alphaDelta,protectedPupilPixels:374});
      for(const size of SIZES){
        const png=await render(artUri,plan,size);
        const tintPng=await render(artUri,colored,size);
        const plain=baselines.get(size);
        const a=await pixels(png,size),c=await pixels(tintPng,size);
        let added=0,tinted=0;
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          const i=(y*size+x)*4;
          const sx=((x+.5)*512/size-b.x)*512/b.size,sy=((y+.5)*512/size-b.y)*512/b.size;
          const margin=2*512/size*512/b.size;
          assert.equal(a[i+3],plain[i+3],id+"/"+choice+"/"+size+": circular alpha changed");
          assert.equal(c[i+3],a[i+3],id+"/"+choice+"/"+size+": color changed alpha");
          if(sx<137-margin||sx>379+margin||sy<165-margin||sy>256+margin){
            assert.ok(delta(plain,a,i)<=1&&delta(a,c,i)<=1,id+"/"+choice+"/"+size+": frame affected unrelated area");
          }
          if(delta(plain,a,i)>8)added++;
          if(delta(a,c,i)>8)tinted++;
        }
        assert.ok(added>0&&tinted>0,id+"/"+choice+"/"+size+": frame or tint not visible");
        if(size>=104)for(const [x,y] of eyes){
          const px=Math.floor((b.x+x*b.size/512)*size/512),py=Math.floor((b.y+y*b.size/512)*size/512),i=(py*size+px)*4;
          assert.ok(delta(plain,a,i)<=1&&delta(plain,c,i)<=1,id+"/"+choice+"/"+size+": pupil changed");
        }
        sizeCases.push({id,choice,size,added,tinted,passed:true});
        if(size===256){
          await tile(png,row,col+1,id+" "+choice);
          if(choice!=="classic")await tile(tintPng,row,choice==="round"?4:5,id+" "+(choice==="round"?"gold":"blue"));
          const resetPng=await render(artUri,reset,size);
          assert.deepEqual(await pixels(resetPng,size),a,id+"/"+choice+": reset mismatch");
        }
      }
      const combined=await pixels(await render(tintedPortrait,colored,256),256);
      let visibleCombined=0;
      for(let y=0;y<256;y++)for(let x=0;x<256;x++){
        const i=(y*256+x)*4;
        const sx=((x+.5)*2-b.x)*512/b.size,sy=((y+.5)*2-b.y)*512/b.size;
        assert.equal(combined[i+3],tintedBase[i+3],id+"/"+choice+": combined alpha");
        if(sx<132||sx>384||sy<160||sy>261)assert.ok(delta(combined,tintedBase,i)<=1,id+"/"+choice+": combined affected other materials");
        if(delta(combined,tintedBase,i)>8)visibleCombined++;
      }
      for(const [x,y] of eyes){
        const px=Math.floor((b.x+x*b.size/512)/2),py=Math.floor((b.y+y*b.size/512)/2),i=(py*256+px)*4;
        assert.ok(delta(combined,tintedBase,i)<=1,id+"/"+choice+": combined eye changed");
      }
      assert.ok(visibleCombined>0);
      combinedCases.push({id,choice,visibleCombined,passed:true});
    }
  }
  assert.equal(sizeCases.length,72);
  assert.equal(sourceCases.length,18);
  assert.equal(combinedCases.length,18);
  assert.ok(sourceCases.reduce((n,c)=>n+c.occluded,0)>0,"No hair/frame occlusion was exercised");
  await sharp({create:{width:1200,height:218*6,channels:3,background:"#F2EEF7"}}).composite(tiles).png().toFile(path.join(output,"independent-eyewear-review.png"));
  console.log("INDEPENDENT_EYEWEAR_PROOF "+JSON.stringify({sizes:sizeCases.length,source:sourceCases.length,combined:combinedCases.length,visualAcceptance:"NOT_APPROVED"}));
  return {sizeCases,sourceCases,combinedCases,visualAcceptance:"NOT_APPROVED",runtimeRegistration:false};
}
