"use client";

import {useState} from "react";
import {AvatarLivePreview} from "@/components/profile/AvatarControls";
import {AvatarOptionCard,AvatarTextChoices} from "@/components/profile/AvatarOptionCard";
import {AvatarColorControls} from "@/components/profile/AvatarColorControls";
import {getAvatarIndependent} from "@/lib/profile/avatar-independent";
import {getAvatarOutfitOptions,getAvatarOutfitChannels,setAvatarOutfitColor} from "@/lib/profile/avatar-formal-outfit";
import {getAvatarLensPlan} from "@/lib/profile/avatar-eyewear";
import {getAvatarMaterialChannels,setAvatarMaterialColor} from "@/lib/profile/avatar-materials";
import {AVATAR_LENS_DEFAULT_COLOR,getAvatarLensSettings,setAvatarLensColor,setAvatarLensTransparency,resetAvatarLens} from "@/lib/profile/avatar-lens";
import {getAvatarPortraitOptions,getAvatarPortraitPlan} from "@/lib/profile/avatar-portrait";
import {normalizeAvatarConfig,type AvatarConfig} from "@/lib/profile/avatar";
import {getAvatarEditorGroups,toggleAvatarOption,type AvatarEditorSection,type AvatarEditorGroup} from "@/lib/profile/avatar-editor-options";

export function AvatarEditor({value,onChange,showPreview=true}:{
  value:AvatarConfig;
  onChange:(value:AvatarConfig)=>void;
  showPreview?:boolean;
}) {
  const avatar=normalizeAvatarConfig(value);
  // One section for every text choice and every color. Opening another closes
  // the previous panel. A selection stays visible for comparison in the preview.
  const [openSection,setOpenSection]=useState<AvatarEditorSection|null>(()=>avatar.style==="neutral"?"role":null);
  const toggle=(section:AvatarEditorSection)=>setOpenSection(current=>toggleAvatarOption(current,section));
  const portraitOptions=getAvatarPortraitOptions(avatar);
  const independent=getAvatarIndependent(avatar);
  const materialChannels=getAvatarMaterialChannels(avatar);
  const outfitOptions=portraitOptions?.active&&!independent?[]:getAvatarOutfitOptions(avatar.style);
  const outfitChannels=outfitOptions.length?getAvatarOutfitChannels(avatar):[];
  const previewAvatar={...avatar,displayMode:"custom" as const};
  const portraitPlan=getAvatarPortraitPlan(previewAvatar);
  const supportsLens=!portraitPlan.layers.some(layer=>layer.kind==="face-body")&&!!getAvatarLensPlan(previewAvatar,portraitPlan.portrait);
  const lensSettings=getAvatarLensSettings(avatar);
  const colorChannels=[...materialChannels,...(supportsLens?[{part:"lens" as const,original:AVATAR_LENS_DEFAULT_COLOR}]:[]),...outfitChannels];
  const groups=getAvatarEditorGroups(avatar,materialChannels.length>0);
  const renderGroup=(group:AvatarEditorGroup)=>(
    <AvatarOptionCard key={group.id} title={group.title} summary={group.choices.find(choice=>choice.selected)?.label??"尚未選擇"}
      expanded={openSection===group.id} onToggle={()=>toggle(group.id)}>
      {group.choices.length?<AvatarTextChoices choices={group.choices} onSelect={choice=>onChange(choice.next)}/>
        :<p className="text-xs font-medium text-[#7B7B74]">{group.emptyText}</p>}
    </AvatarOptionCard>
  );
  return (
    <div className="relative">
      {showPreview&&<AvatarLivePreview config={previewAvatar}/>}
      <div className="mt-4 space-y-2">
        {groups.filter(group=>group.id!=="background"&&group.id!=="pet").map(renderGroup)}
        {colorChannels.length>0&&(
          <AvatarColorControls channels={colorChannels} values={{...avatar.materialColors,...avatar.formalOutfit?.colors,lens:avatar.lens?.color}}
            openPart={colorChannels.find(channel=>channel.part===openSection)?.part??null} onTogglePart={toggle}
            lensTransparency={supportsLens?{value:lensSettings.transparency,custom:!!avatar.lens,onChange:value=>onChange(setAvatarLensTransparency(avatar,value)),onReset:()=>onChange(resetAvatarLens(avatar))}:undefined}
            onChange={(part,color)=>onChange(part==="lens"?setAvatarLensColor(avatar,color):part==="clothing"||part==="lining"||part==="tie"
              ?setAvatarOutfitColor(avatar,part,color):setAvatarMaterialColor(avatar,part,color))}/>
        )}
        {groups.filter(group=>group.id==="background"||group.id==="pet").map(renderGroup)}
      </div>
    </div>
  );
}
