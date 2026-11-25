import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAvatarConfig, AVATAR_DEFAULTS } from "../lib/profile/avatar.ts";
import { getAvatarScene } from "../lib/profile/avatar-scene.ts";
import { AVATAR_HAIRSTYLES, selectAvatarHairstyle } from "../lib/profile/avatar-hairstyle.ts";
import { selectClassicHairTone } from "../lib/profile/avatar-portrait.ts";
import { getAvatarFormalOptions, getAvatarFormalOutfitPlan, getAvatarOutfitChannels, selectAvatarFormalOutfit, setAvatarOutfitColor, outfitShades } from "../lib/profile/avatar-formal-outfit.ts";

test("original clothing is untouched; formal options are explicit and restore the old source", () => {
  for (const style of ["masculine","feminine"] as const) {
    const base = normalizeAvatarConfig({ ...AVATAR_DEFAULTS[style], glasses: true, materialColors: { hair: "#84634A", frame: "#93714F" }, pet: "eagle" });
    assert.equal(getAvatarFormalOutfitPlan(base,getAvatarScene(base).portrait),null);
    const variants = [base, selectClassicHairTone(base,"dark"), ...AVATAR_HAIRSTYLES.filter(v=>v.style===style).map(v=>selectAvatarHairstyle(base,v.id))];
    for (const avatar of variants) for (const choice of getAvatarFormalOptions(style)) {
      const selected=selectAvatarFormalOutfit(avatar,choice.id);
      const saved=normalizeAvatarConfig(JSON.parse(JSON.stringify(selected)));
      assert.deepEqual(saved,selected);
      assert.equal(getAvatarScene(saved).portrait,getAvatarScene(avatar).portrait);
      assert.deepEqual(saved.materialColors,avatar.materialColors);
      assert.equal(saved.pet,"eagle");
      assert.ok(getAvatarFormalOutfitPlan(saved,getAvatarScene(saved).portrait));
      assert.deepEqual(selectAvatarFormalOutfit(saved,"original"),avatar);
      for(const displayMode of ["name","default"] as const) {
        const hidden=normalizeAvatarConfig({...saved,displayMode});
        assert.equal(getAvatarFormalOutfitPlan(hidden,getAvatarScene(hidden).portrait),null);
        assert.deepEqual(hidden.formalOutfit,saved.formalOutfit);
      }
    }
  }
});
test("clothing colors stay separate and only applicable channels are accepted",()=>{
  const base=selectAvatarFormalOutfit(AVATAR_DEFAULTS.masculine,"suit-tie");
  const colored=setAvatarOutfitColor(setAvatarOutfitColor(setAvatarOutfitColor(base,"clothing","#112233"),"lining","#ABCDEF"),"tie","#AABBCC");
  assert.deepEqual(getAvatarOutfitChannels(colored).map(c=>c.part),["clothing","lining","tie"]);
  assert.deepEqual(colored.formalOutfit?.colors,{clothing:"#112233",lining:"#ABCDEF",tie:"#AABBCC"});
  assert.equal(colored.materialColors,undefined);
  const shirt=selectAvatarFormalOutfit(colored,"dress-shirt");
  assert.deepEqual(shirt.formalOutfit?.colors,{clothing:"#112233"});
  assert.deepEqual(setAvatarOutfitColor(shirt,"tie","#334455"),shirt);
  assert.deepEqual(setAvatarOutfitColor(shirt,"clothing",null).formalOutfit,{id:"dress-shirt"});
  assert.deepEqual(getAvatarOutfitChannels(shirt).map(c=>c.part),["clothing"]);
  for(const color of ["#000000","#FFFFFF","#AABBCC"] as const) assert.notEqual(outfitShades(color).light,outfitShades(color).deep);
});
test("unsupported, inherited and malicious selections do not select an outfit",()=>{
  for(const formalOutfit of [{id:"unknown"},{id:"formal-dress"},{id:"__proto__"},{id:"https://example.invalid"},{id:"suit-tie",colors:{clothing:"url(x)",lining:"#ABC",tie:"#1234567"}},Object.create({id:"suit-tie"})]) {
    const a=normalizeAvatarConfig({style:"masculine",formalOutfit});
    if(formalOutfit.id==="suit-tie"&&Object.hasOwn(formalOutfit,"id")) assert.deepEqual(a.formalOutfit,{id:"suit-tie"});
    else assert.equal(a.formalOutfit,undefined);
  }
  const a=normalizeAvatarConfig({style:"masculine",formalOutfit:{id:"suit-tie"}});
  assert.equal(getAvatarFormalOutfitPlan(a,"/avatar/scenes/v3/unknown.webp"),null);
  assert.equal(getAvatarFormalOptions("neutral").length,0);
});
