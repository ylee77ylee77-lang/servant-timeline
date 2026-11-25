import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAvatarConfig } from "../lib/profile/avatar.ts";
import { getAvatarLensPlan, getAvatarEyewearPlan, selectAvatarLegacyEyewear } from "../lib/profile/avatar-eyewear.ts";
import { getAvatarLensSettings, normalizeAvatarLens, resetAvatarLens, setAvatarLensColor, setAvatarLensTransparency, getAvatarLensShades } from "../lib/profile/avatar-lens.ts";
import { getAvatarScene } from "../lib/profile/avatar-scene.ts";
import { getAvatarHairstyleOptions, selectAvatarHairstyle } from "../lib/profile/avatar-hairstyle.ts";
import { getAvatarIndependentOptions, selectAvatarIndependent } from "../lib/profile/avatar-independent.ts";
import { selectClassicHairTone } from "../lib/profile/avatar-portrait.ts";
import { selectAvatarFormalOutfit } from "../lib/profile/avatar-formal-outfit.ts";

test("lens preferences are optional, strict, independent and persist across JSON round trips", () => {
  const base = normalizeAvatarConfig({ style:"feminine", glasses:true, materialColors:{frame:"#B88E55",hair:"#654539"}, pet:"eagle" });
  assert.equal(base.lens,undefined);
  assert.equal(getAvatarLensSettings(base).transparency,100);
  const colored = setAvatarLensColor(base,"#dd7788");
  assert.equal(colored.lens?.color,"#DD7788");
  assert.equal(getAvatarLensSettings(colored).opacity,0);
  const tinted = setAvatarLensTransparency(colored,73);
  assert.deepEqual(tinted.lens,{color:"#DD7788",transparency:75});
  assert.deepEqual(normalizeAvatarConfig(JSON.parse(JSON.stringify(tinted))),tinted);
  assert.deepEqual(tinted.materialColors,base.materialColors);
  assert.equal(tinted.pet,"eagle");
  assert.equal(getAvatarLensSettings(setAvatarLensTransparency(tinted,0)).opacity,1);
  assert.equal(getAvatarLensSettings(setAvatarLensTransparency(tinted,100)).opacity,0);
  assert.equal(setAvatarLensTransparency(tinted,100).lens?.color,"#DD7788");
  assert.deepEqual(setAvatarLensColor(tinted,null).lens,{transparency:75});
  assert.deepEqual(resetAvatarLens(tinted),base);
  for(const invalid of [null,[],{}, {color:"url(x)",transparency:"25"}, {color:"#123456\n",transparency:NaN}, {transparency:Infinity},{transparency:-1},{transparency:101},Object.create({color:"#ABCDEF",transparency:0})]) {
    assert.equal(normalizeAvatarLens(invalid),undefined);
  }
  assert.equal(normalizeAvatarConfig({style:"neutral",lens:{color:"#ABCDEF",transparency:0}}).lens,undefined);
  for(const value of [NaN,Infinity,-1,101]) assert.equal(setAvatarLensTransparency(tinted,value),tinted);
  for(const color of ["#000000","#FFFFFF","#A2468C"] as const) for(const shade of Object.values(getAvatarLensShades(color))) assert.match(shade,/^#[A-Fa-f0-9]{6}$/);
});

test("all 42 registered source/frame combinations support isolated lens geometry and keep old frames", () => {
  let count=0,baked=0;
  for(const style of ["masculine","feminine"] as const){
    const base=normalizeAvatarConfig({style,materialColors:{frame:"#B88E55"},background:"mint"});
    const sources=[base,normalizeAvatarConfig(selectClassicHairTone(base,"dark")),...getAvatarHairstyleOptions(style).map(v=>selectAvatarHairstyle(base,v.id)),...getAvatarIndependentOptions(style).map(v=>selectAvatarIndependent(base,v.id))];
    for(const source of sources)for(const choice of ["classic","round","square"] as const){
      const framed=selectAvatarLegacyEyewear(source,choice);
      const scene=getAvatarScene(framed);
      const lens=getAvatarLensPlan(framed,scene.portrait);
      assert.ok(lens,style+"/"+choice);
      assert.equal(lens.paths.length,2);
      assert.equal(lens.opacity,0);
      const tinted=setAvatarLensTransparency(setAvatarLensColor(framed,"#BB0044"),40);
      const plan=getAvatarLensPlan(tinted,scene.portrait);
      assert.equal(plan?.opacity,.6);
      assert.equal(plan?.color,"#BB0044");
      assert.deepEqual(plan?.paths,lens.paths);
      assert.deepEqual(getAvatarEyewearPlan(tinted),getAvatarEyewearPlan(framed));
      assert.equal(getAvatarScene(tinted).portrait,scene.portrait);
      assert.equal(getAvatarLensPlan(tinted,"https://example.invalid/a.webp"),null);
      const hidden=selectAvatarLegacyEyewear(tinted,"none");
      assert.equal(getAvatarLensPlan(hidden,getAvatarScene(hidden).portrait),null);
      assert.deepEqual(hidden.lens,tinted.lens);
      assert.deepEqual(selectAvatarLegacyEyewear(hidden,choice),tinted);
      for(const displayMode of ["default","name"] as const) assert.equal(getAvatarLensPlan({...tinted,displayMode},scene.portrait),null);
      const dressed=selectAvatarFormalOutfit(tinted,style==="masculine"?"blazer":"tailored-suit");
      assert.deepEqual(dressed.lens,tinted.lens);
      assert.deepEqual(normalizeAvatarConfig(JSON.parse(JSON.stringify(dressed))),normalizeAvatarConfig(dressed));
      count++; if(lens.baked)baked++;
    }
  }
  assert.equal(count,42);assert.equal(baked,4);
});
