import test from "node:test";
import assert from "node:assert/strict";
import {normalizeAvatarConfig} from "../lib/profile/avatar.ts";
import {getAvatarEditorGroups,toggleAvatarOption,selectAvatarEditorRole,type AvatarEditorSection} from "../lib/profile/avatar-editor-options.ts";
import {getAvatarScene} from "../lib/profile/avatar-scene.ts";
import {getAvatarIndependent} from "../lib/profile/avatar-independent.ts";
import {getAvatarMaterialChannels} from "../lib/profile/avatar-materials.ts";

test("the text editor has one disclosure state shared by choices and colors",()=>{
  let current:AvatarEditorSection|null=null;
  for(const next of ["role","face","hairstyle","hair","skin","eyewear","frame","lens","outfit","clothing","background","pet"] as const){
    current=toggleAvatarOption(current,next);
    assert.equal(current,next);
  }
  assert.equal(toggleAvatarOption(current,"pet"),null);
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
