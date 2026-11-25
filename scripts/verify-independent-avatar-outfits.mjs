/** Offline candidate fit proof using the released React garment artwork.
 * Exact pixel composition is deliberately confined to the QA harness; the
 * application has not registered or enabled the new portraits.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { getAvatarOutfitOptions } from "../lib/profile/avatar-formal-outfit.ts";
import { getAvatarCandidateOutfitFit } from "../lib/profile/avatar-outfit-fit.ts";
import { avatarMaterialTransfer } from "../lib/profile/avatar-materials.ts";
import { getCandidateEyewearPlan } from "./avatar-candidate-eyewear-fits.mjs";

const h=React.createElement, S=512;
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const uri=png=>"data:image/png;base64,"+png.toString("base64");
const IDS=["male-b","male-b-short","male-b-side","female-b","female-b-bob","female-b-bun"];
const SIZES=[48,80,104,256];
const COLOR_TRIAL={clothing:"#D57C45",lining:"#2F847D",tie:"#E4B23F"};
async function rgba(input,size=S){
  const {data,info}=await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.deepEqual([info.width,info.height,info.channels],[size,size,4]);
  return data;
}
function png(raw){return sharp(raw,{raw:{width:S,height:S,channels:4}}).png().toBuffer();}
function diff(a,b,i){return Math.max(...[0,1,2].map(c=>Math.abs(a[i+c]-b[i+c])));}
async function keepMask(fit){
  const paths=fit.headCutout.map(d=>`<path d="${d}" fill="white"/>`).join("");
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="black"/>${paths}</svg>`);
  return sharp(svg).greyscale().raw().toBuffer();
}
function composite(source,garment,keep,label){
  assert.equal(keep.length,S*S);
  const result=Buffer.from(source);
  let protectedPixels=0,replaced=0,changed=0;
  for(let p=0;p<S*S;p++){
    const i=4*p,k=keep[p];
    if(p<S*390)assert.equal(k,255,label+": head cutout crosses face/upper neck");
    if(k===255 || source[i+3]===0){if(k===255&&source[i+3]>0)protectedPixels++;continue;}
    assert.equal(garment[i+3],255,label+": garment does not cover source shoulder/neckline");
    for(let c=0;c<3;c++)result[i+c]=Math.round((source[i+c]*k+garment[i+c]*(255-k))/255);
    if(k===0 && source[i+3]>200)replaced++;
    if(diff(source,result,i)>8)changed++;
  }
  for(let p=0;p<S*S;p++){
    const i=4*p;
    assert.equal(result[i+3],source[i+3],label+": changed source alpha");
    if(keep[p]===255)for(let c=0;c<4;c++)assert.equal(result[i+c],source[i+c],label+": protected head changed");
  }
  assert.ok(replaced>25000&&changed>10000&&protectedPixels>40000,label+": incomplete clothing replacement");
  return {raw:result,protectedPixels,replaced,changed};
}

export async function verifyIndependentOutfits(root,output,loadComponent,svgFor){
  const dir=path.join(root,"docs/avatar-face-masters");
  const masters=JSON.parse(await fs.readFile(path.join(dir,"materials","manifest.json"),"utf8"));
  const variants=JSON.parse(await fs.readFile(path.join(dir,"hairstyle-materials","manifest.json"),"utf8"));
  assert.equal(masters.status,"candidate-only");
  assert.equal(variants.status,"candidate-only");
  const {AvatarFormalOutfitArtwork}=loadComponent(path.join(root,"components/profile/AvatarFormalOutfit.tsx"));
  const {AvatarEyewear}=loadComponent(path.join(root,"components/profile/AvatarEyewear.tsx"));
  const {AVATAR_PORTRAIT_BOUNDS:b,AVATAR_FRAME:f}=loadComponent(path.join(root,"lib/profile/avatar-scene.ts"));
  assert.deepEqual([b.x,b.y,b.size],[20,28,472]);
  assert.deepEqual([f.cx,f.cy,f.radius],[256,256,236]);
  async function artwork(plan,fit){
    const svg=renderToStaticMarkup(h("svg",{xmlns:"http://www.w3.org/2000/svg",width:S,height:S,viewBox:`${b.x} ${b.y} ${b.size} ${b.size}`},
      h(AvatarFormalOutfitArtwork,{plan,fit,id:"candidate-outfit"})));
    return rgba(Buffer.from(svg));
  }
  async function scene(sourceUri,size,eyewear){
    const svg=renderToStaticMarkup(h("svg",{xmlns:"http://www.w3.org/2000/svg",width:size,height:size,viewBox:"0 0 512 512"},
      h("defs",null,h("clipPath",{id:"candidate-circle"},h("circle",{cx:f.cx,cy:f.cy,r:f.radius}))),
      h("circle",{cx:f.cx,cy:f.cy,r:f.radius,fill:"#DCE9F7"}),
      h("g",{clipPath:"url(#candidate-circle)"},
        h("image",{href:sourceUri,x:b.x,y:b.y,width:b.size,height:b.size}),
        eyewear?h(AvatarEyewear,{plan:eyewear,id:"candidate-frame"}):null),
      h("circle",{cx:f.cx,cy:f.cy,r:f.radius,fill:"none",stroke:"#fff",strokeWidth:f.stroke})));
    return sharp(Buffer.from(svg)).png().toBuffer();
  }
  function checkScene(before,after,size,label){
    let changed=0;
    const margin=2*512/size*S/b.size;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=(y*size+x)*4,sy=((y+.5)*512/size-b.y)*S/b.size;
      assert.equal(before[i+3],after[i+3],label+": circular alpha changed");
      if(sy<390-margin)assert.ok(diff(before,after,i)<=1,label+": changed head at display size");
      if(diff(before,after,i)>8)changed++;
    }
    assert.ok(changed>0,label+": no visible change");
    return changed;
  }
  const sourceCases=[],sizeCases=[],channelCases=[],combinedCases=[],tiles=[];
  async function tile(image,row,col,label){
    const thumb=await sharp(image).resize(192,192).flatten({background:"#F2EEF7"}).png().toBuffer();
    tiles.push({input:thumb,left:col*200+4,top:row*218+26});
    tiles.push({input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="26"><text x="5" y="17" font-family="sans-serif" font-size="11" fill="#484151">${label}</text></svg>`),left:col*200,top:row*218});
  }
  for(const [row,id] of IDS.entries()){
    const base=id.startsWith("male-b")?"male-b":"female-b",original=id===base;
    const fit=getAvatarCandidateOutfitFit(id),spec=masters.sources[base],registered=original?spec:variants.variants[id];
    assert.ok(fit&&spec&&registered);
    assert.equal(fit.style,base==="male-b"?"masculine":"feminine");
    const art=await fs.readFile(path.join(dir,original?id+".webp":"hairstyles/"+id+".webp"));
    assert.equal(hash(art),registered.sourceSha256);
    const raw=await rgba(art),keep=await keepMask(fit),artUri=uri(await png(raw));
    const plain=new Map();
    for(const size of SIZES){
      const image=await scene(artUri,size);
      plain.set(size,await rgba(image,size));
      if(size===256)await tile(image,row,0,id+" original");
    }
    const choices=getAvatarOutfitOptions(fit.style);
    assert.equal(choices.length,5);
    for(const [col,choice] of choices.entries()){
      const label=id+"/"+choice.id;
      const plan={id:choice.id,style:choice.style,colors:{...choice.originals},cutout:fit.headCutout};
      const dressed=composite(raw,await artwork(plan,fit),keep,label);
      const dressedUri=uri(await png(dressed.raw));
      const group=choice.id.startsWith("casual-")?"casual":"formal";
      sourceCases.push({id,outfit:choice.id,group,protectedPixels:dressed.protectedPixels,replaced:dressed.replaced,changed:dressed.changed});
      let reference;
      for(const size of SIZES){
        const image=await scene(dressedUri,size),after=await rgba(image,size);
        const changed=checkScene(plain.get(size),after,size,label+"/"+size);
        sizeCases.push({id,outfit:choice.id,group,size,changed});
        if(size===256){reference=after;await tile(image,row,col+1,choice.id);}
      }
      for(const part of Object.keys(choice.originals)){
        const tintedPlan={...plan,colors:{...plan.colors,[part]:COLOR_TRIAL[part]}};
        const tinted=composite(raw,await artwork(tintedPlan,fit),keep,label+"/"+part);
        let changed=0;
        for(let p=0;p<S*S;p++){
          const i=4*p;
          if(keep[p]===255)assert.equal(diff(dressed.raw,tinted.raw,i),0,label+": recolor changed head");
          if(raw[i+3]>200 && diff(dressed.raw,tinted.raw,i)>8)changed++;
        }
        assert.ok(changed>100,label+"/"+part+": color has no independent effect");
        const visible=checkScene(reference,await rgba(await scene(uri(await png(tinted.raw)),256),256),256,label+"/"+part);
        channelCases.push({id,outfit:choice.id,part,changed,visible});
      }
    }
    // All three person color channels plus a fitted jacket use the actual
    // existing material and eyewear components in this candidate harness.
    const mask=await fs.readFile(original?path.join(output,base+"-refined-mask.png"):path.join(dir,"hairstyle-materials",id+".png"));
    if(!original)assert.equal(hash(mask),registered.maskSha256);
    const maskUri=uri(mask);
    const tintPlan={coverageUri:maskUri,frameGuard:false,channels:[
      {part:"hair",tables:avatarMaterialTransfer(spec.originals.hair,"#A06EE8","hair")},
      {part:"skin",tables:avatarMaterialTransfer(spec.originals.skin,"#986448","skin")},
    ]};
    const personTint=await sharp(svgFor(artUri,tintPlan)).png().toBuffer();
    const eyes=getCandidateEyewearPlan(base,"round","#B88E55",maskUri);
    const choice=choices.find(c=>c.id===(base==="male-b"?"suit-tie":"tailored-suit"));
    assert.ok(choice);
    const allColors=Object.fromEntries(Object.keys(choice.originals).map(part=>[part,COLOR_TRIAL[part]]));
    const combined=composite(await rgba(personTint),await artwork({id:choice.id,style:choice.style,colors:allColors,cutout:fit.headCutout},fit),keep,id+"/combined");
    const before=await rgba(await scene(uri(personTint),256,eyes),256);
    const after=await rgba(await scene(uri(await png(combined.raw)),256,eyes),256);
    combinedCases.push({id,changed:checkScene(before,after,256,id+"/combined")});
    // Selecting original requires no garment processing and returns the same
    // original source; the candidate harness does not persist any choices.
    assert.deepEqual(await rgba(await scene(artUri,256),256),plain.get(256),id+": original reset differs");
  }
  assert.equal(sourceCases.length,30);
  assert.equal(sizeCases.length,120);
  assert.equal(sizeCases.filter(c=>c.group==="formal").length,72);
  assert.equal(sizeCases.filter(c=>c.group==="casual").length,48);
  assert.equal(channelCases.length,45);
  assert.equal(combinedCases.length,6);
  assert.equal(getAvatarCandidateOutfitFit("unregistered"),null);
  await sharp({create:{width:1200,height:218*6,channels:3,background:"#F2EEF7"}})
    .composite(tiles).png().toFile(path.join(output,"independent-outfit-review.png"));
  console.log("INDEPENDENT_OUTFIT_PROOF "+JSON.stringify({sources:sourceCases.length,sizes:sizeCases.length,colors:channelCases.length,combined:combinedCases.length,visualAcceptance:"NOT_APPROVED"}));
  return {sourceCases,sizeCases,channelCases,combinedCases,visualAcceptance:"NOT_APPROVED",runtimeRegistration:false};
}
