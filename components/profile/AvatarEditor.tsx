"use client";

import {useState} from "react";
import {AvatarLivePreview} from "@/components/profile/AvatarControls";
import {AvatarOptionCard,AvatarTextChoices} from "@/components/profile/AvatarOptionCard";
import {AvatarColorControls,useAvatarColorDraftCache} from "@/components/profile/AvatarColorControls";
import {getAvatarIndependent} from "@/lib/profile/avatar-independent";
import {getAvatarOutfitOptions,getAvatarOutfitChannels,setAvatarOutfitColor} from "@/lib/profile/avatar-formal-outfit";
import {getAvatarLensPlan} from "@/lib/profile/avatar-eyewear";
import {getAvatarMaterialChannels,setAvatarMaterialColor} from "@/lib/profile/avatar-materials";
import {AVATAR_LENS_DEFAULT_COLOR,getAvatarLensSettings,setAvatarLensColor,setAvatarLensTransparency,resetAvatarLens} from "@/lib/profile/avatar-lens";
import {getAvatarPortraitOptions,getAvatarPortraitPlan} from "@/lib/profile/avatar-portrait";
import {normalizeAvatarConfig,type AvatarConfig} from "@/lib/profile/avatar";
import {getAvatarEditorGroups,groupAvatarEditorFeatures,toggleAvatarEditorFeature,toggleAvatarEditorColor,type AvatarEditorExpansion,type AvatarEditorChoice} from "@/lib/profile/avatar-editor-options";

/** Controlled feature cards, shared by registration and profile settings.
 * A main card stays open while its own color control is used. */
export function AvatarEditorOptions({avatar,onChange,expansion,onExpansionChange}:{
  avatar:AvatarConfig;
  onChange:(value:AvatarConfig)=>void;
  expansion:AvatarEditorExpansion;
  onExpansionChange:(value:AvatarEditorExpansion)=>void;
}) {
  const draftCache=useAvatarColorDraftCache();
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
  const groups=groupAvatarEditorFeatures(getAvatarEditorGroups(avatar,materialChannels.length>0),colorChannels);
  const selectChoice=(choice:AvatarEditorChoice)=>{
    // A new feature selection returns its color controls to the collapsed state.
    // No color preference is rewritten here: existing selection functions keep
    // the compatible saved colors and discard only unsupported outfit channels.
    if(!choice.selected&&expansion.color!==null)onExpansionChange({...expansion,color:null});
    onChange(choice.next);
  };
  return (
    <div className="mt-4 space-y-2">
      {groups.map(group=>(
        <AvatarOptionCard key={group.id} title={group.title}
          summary={group.choices.find(choice=>choice.selected)?.label??group.secondaryChoices?.choices.find(choice=>choice.selected)?.label??"尚未選擇"}
          expanded={expansion.group===group.id}
          onToggle={()=>onExpansionChange(toggleAvatarEditorFeature(expansion,group.id))}>
          <div className="space-y-3">
            {group.choices.length>0?<AvatarTextChoices choices={group.choices} onSelect={selectChoice}/>
              :group.emptyText?<p className="text-xs font-medium text-[#7B7B74]">{group.emptyText}</p>:null}
            {group.secondaryChoices&&(
              <div className="space-y-2">
                <p className="text-xs font-bold text-[#7B7B74]">{group.secondaryChoices.title}</p>
                <AvatarTextChoices choices={group.secondaryChoices.choices} onSelect={selectChoice}/>
              </div>
            )}
            {group.colorChannels.length>0&&(
              <div className="space-y-2">
                <AvatarColorControls channels={group.colorChannels} values={{...avatar.materialColors,...avatar.formalOutfit?.colors,lens:avatar.lens?.color}}
                  openPart={expansion.group===group.id?expansion.color:null}
                  onTogglePart={part=>onExpansionChange(toggleAvatarEditorColor(expansion,part))}
                  draftCache={draftCache}
                  lensTransparency={supportsLens&&group.id==="eyewear"?{value:lensSettings.transparency,custom:!!avatar.lens,onChange:value=>onChange(setAvatarLensTransparency(avatar,value)),onReset:()=>onChange(resetAvatarLens(avatar))}:undefined}
                  onChange={(part,color)=>onChange(part==="lens"?setAvatarLensColor(avatar,color):part==="clothing"||part==="lining"||part==="tie"
                    ?setAvatarOutfitColor(avatar,part,color):setAvatarMaterialColor(avatar,part,color))}/>
              </div>
            )}
          </div>
        </AvatarOptionCard>
      ))}
    </div>
  );
}

export function AvatarEditor({value,onChange,showPreview=true}:{
  value:AvatarConfig;
  onChange:(value:AvatarConfig)=>void;
  showPreview?:boolean;
}) {
  const avatar=normalizeAvatarConfig(value);
  const [expansion,setExpansion]=useState<AvatarEditorExpansion>(()=>({group:avatar.style==="neutral"?"role":null,color:null}));
  return (
    <div className="relative">
      {showPreview&&<AvatarLivePreview config={{...avatar,displayMode:"custom"}}/>}
      <AvatarEditorOptions avatar={avatar} onChange={onChange} expansion={expansion} onExpansionChange={setExpansion}/>
    </div>
  );
}
