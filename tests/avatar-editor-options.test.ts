import test from "node:test";
import assert from "node:assert/strict";
import {normalizeAvatarConfig} from "../lib/profile/avatar.ts";
import {getAvatarEditorGroups,groupAvatarEditorFeatures,toggleAvatarEditorFeature,toggleAvatarEditorColor,selectAvatarEditorRole,type AvatarEditorExpansion} from "../lib/profile/avatar-editor-options.ts";
import {getAvatarOutfitOptions,getAvatarOutfitChannels,selectAvatarFormalOutfit,setAvatarOutfitColor} from "../lib/profile/avatar-formal-outfit.ts";
import {getAvatarLensPlan,selectAvatarLegacyEyewear} from "../lib/profile/avatar-eyewear.ts";
import {AVATAR_LENS_DEFAULT_COLOR} from "../lib/profile/avatar-lens.ts";
import {getAvatarIndependentOptions,selectAvatarIndependent} from "../lib/profile/avatar-independent.ts";
import {getAvatarHairstyleOptions,selectAvatarHairstyle} from "../lib/profile/avatar-hairstyle.ts";
import {getAvatarScene} from "../lib/profile/avatar-scene.ts";
import {getAvatarIndependent} from "../lib/profile/avatar-independent.ts";
import {getAvatarMaterialChannels} from "../lib/profile/avatar-materials.ts";

test("one main feature and one of its own color controls can be open",()=>{
  let current:AvatarEditorExpansion={group:null,color:null};
  for(const [group,part] of [["face","skin"],["hairstyle","hair"],["eyewear","frame"],["outfit","clothing"]] as const){
    current=toggleAvatarEditorFeature(current,group);
    assert.deepEqual(current,{group,color:null});
    current=toggleAvatarEditorColor(current,part);
    assert.deepEqual(current,{group,color:part});
  }
  assert.equal(toggleAvatarEditorColor(current,"lens"),current);
  assert.deepEqual(toggleAvatarEditorColor(current,"lining"),{group:"outfit",color:"lining"});
  assert.deepEqual(toggleAvatarEditorColor(current,"clothing"),{group:"outfit",color:null});
  assert.deepEqual(toggleAvatarEditorFeature(current,"outfit"),{group:null,color:null});
  assert.deepEqual(toggleAvatarEditorFeature(current,"pet"),{group:"pet",color:null});
});

test("role, face and hair descriptions match their registered assets without changing IDs",()=>{
  for(const style of ["masculine","feminine"] as const){
    const base=normalizeAvatarConfig({style,glasses:true,lens:{color:"#ABCDEF",transparency:65},background:"mint",pet:"eagle"});
    const groups=getAvatarEditorGroups(base,getAvatarMaterialChannels(base).length>0);
    assert.equal(groups[0].title,"角色");
    assert.equal(groups.at(-1)?.title,"動物");
    assert.equal(new Set(groups.map(g=>g.id)).size,groups.length);
    const face=groups.find(g=>g.id==="face")!;
    assert.deepEqual(face.choices.map(c=>c.label),["活潑型","自然型"]);
    assert.equal(face.choices.find(c=>c.selected)?.id,"original");
    const hair=groups.find(g=>g.id==="hairstyle")!;
    assert.equal(hair.choices.find(c=>c.id==="original")?.label,style==="masculine"?"蓬鬆捲髮":"波浪長髮");
    const next=face.choices.find(c=>c.id==="independent")!.next;
    assert.equal(getAvatarIndependent(next)?.id,style==="masculine"?"male-b":"female-b");
    assert.deepEqual(next.lens,base.lens);
    const nextGroups=getAvatarEditorGroups(next,true);
    const nextHair=nextGroups.find(g=>g.id==="hairstyle")!;
    assert.equal(nextHair.choices.find(c=>c.selected)?.label,style==="masculine"?"立體蓬髮":"自然中長髮");
    assert.equal(nextGroups.find(g=>g.id==="face")?.choices.find(c=>c.selected)?.label,"自然型");
    for(const option of nextHair.choices){
      assert.equal(getAvatarIndependent(option.next)?.id,option.id);
      assert.equal(getAvatarScene(option.next).portrait,getAvatarIndependent(option.next)?.src);
      assert.deepEqual(option.next.lens,base.lens);
    }
    const back=nextGroups.find(g=>g.id==="face")!.choices.find(c=>c.id==="original")!.next;
    assert.deepEqual(back,base);
    const opposite=selectAvatarEditorRole(next,style==="masculine"?"feminine":"masculine");
    assert.deepEqual(opposite.lens,base.lens);
    assert.equal(opposite.pet,"eagle");
    assert.equal(opposite.background,"mint");
    assert.equal(opposite.independentPortrait,undefined);
  }
});

test("all outfit, background, companion and eyewear text choices keep original selections",()=>{
  const base=normalizeAvatarConfig({style:"feminine",glasses:true,lens:{transparency:35},pet:"lion",background:"sky"});
  const groups=getAvatarEditorGroups(base,true);
  assert.equal(groups.find(g=>g.id==="outfit")?.choices.length,6);
  assert.equal(groups.find(g=>g.id==="outfit")?.choices.find(c=>c.id==="original")?.label,"休閒服");
  assert.equal(groups.find(g=>g.id==="background")?.choices.length,5);
  assert.equal(groups.find(g=>g.id==="pet")?.choices.length,5);
  assert.equal(groups.find(g=>g.id==="eyewear")?.choices.length,4);
  for(const group of groups){
    assert.ok(group.choices.length===0||group.choices.filter(c=>c.selected).length===1,group.id);
  }
  const hidden=groups.find(g=>g.id==="eyewear")!.choices.find(c=>c.id==="none")!.next;
  assert.equal(hidden.glasses,false);
  assert.deepEqual(hidden.lens,base.lens);
  const neutral=getAvatarEditorGroups(normalizeAvatarConfig({style:"neutral"}),false);
  assert.equal(neutral.find(g=>g.id==="role")?.choices.filter(c=>c.selected).length,0);
  assert.equal(neutral.find(g=>g.id==="eyewear")?.emptyText,"請先選擇角色。");
});

test("seven feature cards own all applicable channels across old and independent portraits, frames and outfits",()=>{
  for(const style of ["masculine","feminine"] as const){
    const base=normalizeAvatarConfig({style,glasses:true,lens:{color:"#ABCDEF",transparency:65},materialColors:{hair:"#112233",skin:"#AABBCC",frame:"#654539"}});
    const portraits=[base,...getAvatarHairstyleOptions(style).map(option=>selectAvatarHairstyle(base,option.id)),...getAvatarIndependentOptions(style).map(option=>selectAvatarIndependent(base,option.id))];
    for(const portrait of portraits){
      for(const frame of ["none","classic","round","square"] as const){
        const framed=selectAvatarLegacyEyewear(portrait,frame);
        for(const id of ["original" as const,...getAvatarOutfitOptions(style).map(option=>option.id)]){
          const avatar=selectAvatarFormalOutfit(framed,id);
          const material=getAvatarMaterialChannels(avatar);
          const lens=getAvatarLensPlan(avatar,getAvatarScene(avatar).portrait);
          const outfit=getAvatarOutfitChannels(avatar);
          const channels=[...material,...(lens?[{part:"lens" as const,original:AVATAR_LENS_DEFAULT_COLOR}]:[]),...outfit];
          const features=groupAvatarEditorFeatures(getAvatarEditorGroups(avatar,material.length>0),channels);
          assert.deepEqual(features.map(group=>group.id),["role","face","hairstyle","eyewear","outfit","background","pet"]);
          assert.deepEqual(features.map(group=>group.title),["角色","臉型","髮型","眼鏡","服裝","背景","動物"]);
          assert.deepEqual(features.find(group=>group.id==="face")?.colorChannels.map(c=>c.part),["skin"]);
          assert.deepEqual(features.find(group=>group.id==="hairstyle")?.colorChannels.map(c=>c.part),["hair"]);
          assert.deepEqual(features.find(group=>group.id==="eyewear")?.colorChannels.map(c=>c.part),frame==="none"?[]:["frame","lens"]);
          assert.deepEqual(features.find(group=>group.id==="outfit")?.colorChannels,outfit);
          assert.deepEqual(features.flatMap(group=>group.colorChannels.map(c=>c.part)).sort(),channels.map(c=>c.part).sort());
          assert.deepEqual(avatar.lens,base.lens);
          assert.deepEqual(avatar.materialColors,base.materialColors);
          for(const group of features)for(const choice of group.choices){
            assert.equal(typeof choice.label,"string");
          }
        }
      }
    }
  }
});

test("legacy fixed hair-tone fallback stays inside the hairstyle card",()=>{
  const avatar=normalizeAvatarConfig({style:"masculine"});
  const raw=getAvatarEditorGroups(avatar,false);
  const features=groupAvatarEditorFeatures(raw,[]);
  assert.equal(features.length,7);
  assert.equal(features.find(group=>group.id==="hairstyle")?.secondaryChoices?.title,"髮色");
  assert.deepEqual(features.find(group=>group.id==="hairstyle")?.secondaryChoices?.choices.map(c=>c.label),["深棕色","黑色"]);
});

test("switching compatible styles preserves saved colors without adding unsupported outfit channels",()=>{
  const base=normalizeAvatarConfig({style:"masculine",glasses:true,lens:{color:"#AA88CC",transparency:65},materialColors:{hair:"#654539",skin:"#AABBCC",frame:"#987654"}});
  const suit=setAvatarOutfitColor(setAvatarOutfitColor(setAvatarOutfitColor(selectAvatarFormalOutfit(base,"suit-tie"),"clothing","#345678"),"lining","#ABCDEF"),"tie","#123456");
  const shirt=selectAvatarFormalOutfit(suit,"dress-shirt");
  assert.deepEqual(shirt.formalOutfit?.colors,{clothing:"#345678"});
  const hairstyle=selectAvatarIndependent(shirt,"male-b-short");
  const hidden=selectAvatarLegacyEyewear(hairstyle,"none");
  const restored=selectAvatarLegacyEyewear(hidden,"round");
  for(const avatar of [shirt,hairstyle,hidden,restored]){
    assert.deepEqual(avatar.lens,base.lens);
    assert.deepEqual(avatar.materialColors,base.materialColors);
    assert.deepEqual(avatar.formalOutfit?.colors,{clothing:"#345678"});
  }
});
