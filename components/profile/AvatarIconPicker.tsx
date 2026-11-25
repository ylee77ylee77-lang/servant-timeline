"use client";

import {useState} from "react";
import {AvatarOptionCard,AvatarTextChoices} from "@/components/profile/AvatarOptionCard";
import {AVATAR_ICON_OPTIONS,AVATAR_ICON_TONES} from "@/lib/profile/avatar-icon";
import {normalizeAvatarConfig,type AvatarConfig,type AvatarIconTone} from "@/lib/profile/avatar";
import {toggleAvatarOption} from "@/lib/profile/avatar-editor-options";

/** Text choices use the existing shared live header for artwork and color. */
export function AvatarIconPicker({value,onChange,disabled=false}:{
  value:AvatarConfig;
  onChange:(config:AvatarConfig)=>void;
  disabled?:boolean;
}) {
  const avatar=normalizeAvatarConfig(value);
  const [openSection,setOpenSection]=useState<"icon"|"tone"|null>(null);
  const toggle=(section:"icon"|"tone")=>setOpenSection(current=>toggleAvatarOption(current,section));
  const tones=Object.entries(AVATAR_ICON_TONES) as Array<[AvatarIconTone,(typeof AVATAR_ICON_TONES)[AvatarIconTone]]>;
  return (
    <div className="mt-4 space-y-2">
      <AvatarOptionCard title="選擇圖示" summary={AVATAR_ICON_OPTIONS.find(option=>option.value===avatar.iconType)?.label??"尚未選擇"}
        expanded={openSection==="icon"} onToggle={()=>toggle("icon")} disabled={disabled}>
        <AvatarTextChoices choices={AVATAR_ICON_OPTIONS.map(option=>({id:option.value,label:option.label,selected:option.value===avatar.iconType}))}
          onSelect={option=>onChange({...avatar,iconType:option.id})} disabled={disabled}/>
      </AvatarOptionCard>
      <AvatarOptionCard title="色調" summary={AVATAR_ICON_TONES[avatar.iconTone].label}
        expanded={openSection==="tone"} onToggle={()=>toggle("tone")} disabled={disabled}>
        <AvatarTextChoices choices={tones.map(([id,palette])=>({id,label:palette.label,selected:id===avatar.iconTone}))}
          onSelect={option=>onChange({...avatar,iconTone:option.id})} disabled={disabled}/>
      </AvatarOptionCard>
    </div>
  );
}
