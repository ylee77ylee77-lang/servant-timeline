import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { normalizeAvatarConfig } from "../lib/profile/avatar.ts";
import { AVATAR_INDEPENDENT_SOURCES, getAvatarIndependentOptions, selectAvatarIndependent } from "../lib/profile/avatar-independent.ts";
import { getAvatarScene } from "../lib/profile/avatar-scene.ts";
import { getAvatarEyewearPlan, selectAvatarLegacyEyewear } from "../lib/profile/avatar-eyewear.ts";
import { getAvatarMaterialChannels, getAvatarMaterialPlan } from "../lib/profile/avatar-materials.ts";
import { getAvatarOutfitOptions, getAvatarFormalOutfitPlan, selectAvatarFormalOutfit } from "../lib/profile/avatar-formal-outfit.ts";

test("explicit b1 selection round trips all compatible choices without altering dormant legacy settings",()=>{
 for(const style of ["masculine","feminine"] as const){
  const base=normalizeAvatarConfig({style,glasses:true,portraitVersion:"v2-tone",hairColor:"dark",eyewearVersion:"v1",glassesStyle:"square",portraitFamily:{id:style==="masculine"?"male-b":"female-b",hair:"long",glassesStyle:"round"},background:"mint",pet:"eagle",materialColors:{hair:"#765432",skin:"#986448",frame:"#B88E55"}});
  const oldScene=getAvatarScene(base);
  assert.ok(!oldScene.portrait?.includes("/b1/"));
  assert.equal(getAvatarIndependentOptions(style).length,3);
  for(const source of getAvatarIndependentOptions(style)){
   const chosen=selectAvatarIndependent(base,source.id);
   assert.deepEqual(selectAvatarIndependent(chosen,"original"),base);
   for(const frame of ["none","classic","round","square"] as const){
    const withFrame=selectAvatarLegacyEyewear(chosen,frame);
    const saved=normalizeAvatarConfig(JSON.parse(JSON.stringify(withFrame)));
    assert.deepEqual(saved,withFrame);
    assert.equal(getAvatarScene(saved).portrait,source.src);
    assert.equal(getAvatarEyewearPlan(saved)?.choice??"none",frame);
    assert.deepEqual(getAvatarMaterialChannels(saved).map(c=>c.part),frame==="none"?["hair","skin"]:["hair","skin","frame"]);
    assert.equal(getAvatarMaterialPlan(source.src,saved.materialColors)?.coverageUri,source.coverageUri);
    assert.equal(getAvatarMaterialPlan(source.src,{frame:"#112233"}),null);
    for(const outfit of getAvatarOutfitOptions(style)){
     const dressed=selectAvatarFormalOutfit(saved,outfit.id);
     assert.ok(getAvatarFormalOutfitPlan(dressed,source.src));
     assert.deepEqual(normalizeAvatarConfig(JSON.parse(JSON.stringify(dressed))),dressed);
     assert.deepEqual(selectAvatarFormalOutfit(dressed,"original"),saved);
    }
    for(const displayMode of ["name","default"] as const)assert.equal(getAvatarScene({...saved,displayMode}).portrait,null);
   }
  }
 }
});
test("invalid independent versions, inherited keys and cross-style choices are rejected",()=>{
 for(const independentPortrait of [{id:"male-b"},{version:"b0",id:"male-b"},{version:"b1",id:"female-b"},{version:"b1",id:"__proto__"},{version:"b1",id:"https://example.invalid"},Object.create({version:"b1",id:"male-b"})]){
  assert.equal(normalizeAvatarConfig({style:"masculine",independentPortrait}).independentPortrait,undefined);
 }
});
test("public b1 source and masks are pinned; clothing composition preserves alpha and head",async()=>{
 for(const source of AVATAR_INDEPENDENT_SOURCES){
  const load=(url:string,sha:string)=>{
   const bytes=readFileSync(path.join(process.cwd(),"public",url.slice(1)));
   assert.equal(createHash("sha256").update(bytes).digest("hex"),sha);
   return bytes;
  };
  const art=load(source.src,source.sourceSha256), material=load(source.coverageUri,source.coverageSha256), head=load(source.headUri,source.headSha256), garment=load(source.garmentUri,source.garmentSha256);
  assert.ok(art.length<180*1024&&material.length<24*1024&&head.length+garment.length<24*1024);
  const decode=async(bytes:Buffer)=>{
   const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   assert.deepEqual([info.width,info.height,info.channels],[512,512,4]);return data;
  };
  const [a,h,g]=await Promise.all([art,head,garment].map(decode));
  await decode(material);
  for(let p=0;p<512*512;p++){
   const i=p*4,alpha=a[i+3]/255,k=h[i+3]/255,fill=g[i+3]/255;
   assert.ok(Math.abs(255*(alpha*k+fill*(1-alpha*k)-alpha))<=0.501);
   if(p<512*390){assert.equal(h[i+3],255);assert.equal(g[i+3],0);}
   if(alpha===0)assert.equal(g[i+3],0);
  }
 }
});
