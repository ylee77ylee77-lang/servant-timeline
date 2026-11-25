import {AVATAR_DEFAULTS,type AvatarConfig,type AvatarStyle} from "./avatar.ts";
import {getAvatarIndependent,getAvatarIndependentOptions,selectAvatarIndependent} from "./avatar-independent.ts";
import {getAvatarHairstyleOptions,getAvatarHairstyle,selectAvatarHairstyle} from "./avatar-hairstyle.ts";
import {getAvatarOutfitOptions,selectAvatarFormalOutfit} from "./avatar-formal-outfit.ts";
import {AVATAR_EYEWEAR_CHOICES,getAvatarLegacyEyewearChoice,selectAvatarLegacyEyewear} from "./avatar-eyewear.ts";
import {AVATAR_CLASSIC_HAIR_TONES,AVATAR_GLASSES_LABELS,getAvatarPortraitOptions,getClassicHairTone,selectAvatarPortraitVersion,selectAvatarPortraitFamily,selectAvatarFamilyHair,selectAvatarFamilyGlasses,selectClassicHairTone} from "./avatar-portrait.ts";
import type {AvatarPickerPart} from "./avatar-color-wheel.ts";

export type AvatarEditorGroupId = "role"|"face"|"hairstyle"|"classic-hair-tone"|"eyewear"|"outfit"|"background"|"pet";
export type AvatarEditorSection = AvatarEditorGroupId | AvatarPickerPart;
export type AvatarEditorChoice = {id:string;label:string;selected:boolean;next:AvatarConfig};
export type AvatarEditorGroup = {id:AvatarEditorGroupId;title:string;choices:AvatarEditorChoice[];emptyText?:string};
export function toggleAvatarOption<T extends string>(current:T|null,next:T):T|null {
  return current===next?null:next;
}

const backgrounds = [
  {value:"lavender",label:"薰衣草"},{value:"peach",label:"蜜桃"},{value:"mint",label:"薄荷"},
  {value:"sky",label:"天空"},{value:"sand",label:"暖沙"},
] as const;
const pets = [
  {value:"none",label:"無"},{value:"sheep",label:"綿羊"},{value:"doe",label:"母鹿"},
  {value:"lion",label:"獅子"},{value:"eagle",label:"老鷹"},
] as const;

export function selectAvatarEditorRole(avatar:AvatarConfig,style:Exclude<AvatarStyle,"neutral">):AvatarConfig {
  if(avatar.style===style)return avatar;
  const next:AvatarConfig={
    ...AVATAR_DEFAULTS[style],background:avatar.background,pet:avatar.pet,glasses:avatar.glasses,
    ...(avatar.eyewearVersion==="v1"?{eyewearVersion:avatar.eyewearVersion,glassesStyle:avatar.glassesStyle}:{}),
    displayMode:avatar.displayMode,iconType:avatar.iconType,iconTone:avatar.iconTone,
    ...(avatar.materialColors?{materialColors:avatar.materialColors}:{}),
    ...(avatar.lens?{lens:avatar.lens}:{}),
  };
  return getClassicHairTone(avatar)==="dark"?selectClassicHairTone(next,"dark"):next;
}

/** Text labels are UI-only; original source IDs, selection actions and persistence stay intact. */
export function getAvatarEditorGroups(avatar:AvatarConfig,hasMaterialColors:boolean):AvatarEditorGroup[] {
  const groups:AvatarEditorGroup[]=[];
  const add=(id:AvatarEditorGroupId,title:string,choices:AvatarEditorChoice[],emptyText?:string)=>groups.push({id,title,choices,emptyText});
  const choice=(id:string,label:string,selected:boolean,next:AvatarConfig):AvatarEditorChoice=>({id,label,selected,next});
  const portraitOptions=getAvatarPortraitOptions(avatar);
  const independent=getAvatarIndependent(avatar);
  const independentOptions=getAvatarIndependentOptions(avatar.style);
  const independentDefault=independentOptions[0];
  const hairstyleOptions=getAvatarHairstyleOptions(avatar.style);
  const selectedHairstyle=getAvatarHairstyle(avatar);
  const outfitOptions=portraitOptions?.active&&!independent?[]:getAvatarOutfitOptions(avatar.style);
  add("role","角色",([
    ["masculine","男生"],["feminine","女生"],
  ] as const).map(([style,label])=>choice(style,label,avatar.style===style,selectAvatarEditorRole(avatar,style))));
  if(independentDefault&&!portraitOptions?.active){
    add("face","臉型",[
      choice("original","活潑型",!independent,selectAvatarIndependent(avatar,"original")),
      choice("independent","自然型",!!independent,independent?avatar:selectAvatarIndependent(avatar,independentDefault.id)),
      ...(portraitOptions&&!independent?portraitOptions.families.map(family=>choice(family.id,family.label,false,selectAvatarPortraitFamily(avatar,family.id))):[]),
    ]);
  }else if(portraitOptions&&!independent){
    add("face","臉型",[
      choice("original","活潑型",!portraitOptions.active,selectAvatarPortraitVersion(avatar,false)),
      ...portraitOptions.families.map(family=>choice(family.id,family.label,portraitOptions.active&&portraitOptions.family.id===family.id,selectAvatarPortraitFamily(avatar,family.id))),
    ]);
  }
  if(portraitOptions?.active&&!independent){
    add("hairstyle","髮型",portraitOptions.family.hairStyles.map(hair=>choice(hair.value,hair.label,portraitOptions.hair.value===hair.value,selectAvatarFamilyHair(avatar,hair.value))));
  }else if(independent){
    add("hairstyle","髮型",independentOptions.map(option=>choice(option.id,option.label,independent.id===option.id,selectAvatarIndependent(avatar,option.id))));
  }else if(hairstyleOptions.length){
    const originalLabel=avatar.style==="masculine"?"蓬鬆捲髮":"波浪長髮";
    add("hairstyle","髮型",[
      choice("original",originalLabel,!selectedHairstyle,selectAvatarHairstyle(avatar,"original")),
      ...hairstyleOptions.map(option=>choice(option.id,option.label,selectedHairstyle?.id===option.id,selectAvatarHairstyle(avatar,option.id))),
    ]);
  }
  if(avatar.style!=="neutral"&&!portraitOptions?.active&&!hasMaterialColors){
    add("classic-hair-tone","髮色",AVATAR_CLASSIC_HAIR_TONES.map(tone=>choice(tone.value,tone.label,getClassicHairTone(avatar)===tone.value,selectClassicHairTone(avatar,tone.value))));
  }
  if(portraitOptions?.active&&!independent){
    add("eyewear","眼鏡",(["none",...portraitOptions.glassesStyles] as const).map(style=>choice(style,style==="none"?"無眼鏡":AVATAR_GLASSES_LABELS[style],style==="none"?!avatar.glasses:avatar.glasses&&portraitOptions.glassesStyle===style,selectAvatarFamilyGlasses(avatar,style))));
  }else if(avatar.style!=="neutral"){
    add("eyewear","眼鏡",AVATAR_EYEWEAR_CHOICES.map(option=>choice(option.value,option.label,getAvatarLegacyEyewearChoice(avatar)===option.value,selectAvatarLegacyEyewear(avatar,option.value))));
  }else{
    add("eyewear","眼鏡",[],"請先選擇角色。");
  }
  if(outfitOptions.length){
    add("outfit","服裝",[{id:"original" as const,label:"原版休閒服"},...outfitOptions].map(option=>choice(option.id,option.label,(avatar.formalOutfit?.id??"original")===option.id,selectAvatarFormalOutfit(avatar,option.id))));
  }
  add("background","背景",backgrounds.map(option=>choice(option.value,option.label,avatar.background===option.value,{...avatar,background:option.value})));
  add("pet","陪伴動物",pets.map(option=>choice(option.value,option.label,avatar.pet===option.value,{...avatar,pet:option.value})));
  return groups;
}
