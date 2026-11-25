"use client";

import { AvatarRenderer, AvatarCompanionThumbnail } from "@/components/profile/AvatarRenderer";
import { AvatarLivePreview } from "@/components/profile/AvatarControls";
import { getAvatarHairstyleOptions, getAvatarHairstyle, selectAvatarHairstyle } from "@/lib/profile/avatar-hairstyle";
import { getAvatarFormalOptions, getAvatarOutfitChannels, selectAvatarFormalOutfit, setAvatarOutfitColor } from "@/lib/profile/avatar-formal-outfit";
import { AvatarColorControls } from "@/components/profile/AvatarColorControls";
import { AVATAR_EYEWEAR_CHOICES, getAvatarLegacyEyewearChoice, selectAvatarLegacyEyewear } from "@/lib/profile/avatar-eyewear";
import { getAvatarMaterialChannels, setAvatarMaterialColor } from "@/lib/profile/avatar-materials";
import {
  AVATAR_CLASSIC_HAIR_TONES,
  AVATAR_GLASSES_LABELS,
  getAvatarPortraitOptions,
  getClassicHairTone,
  selectAvatarPortraitVersion,
  selectAvatarPortraitFamily,
  selectAvatarFamilyHair,
  selectAvatarFamilyGlasses,
  selectClassicHairTone,
} from "@/lib/profile/avatar-portrait";
import {
  AVATAR_DEFAULTS,
  normalizeAvatarConfig,
  type AvatarConfig,
  type AvatarStyle,
} from "@/lib/profile/avatar";

const styleOptions: Array<{ value: Extract<AvatarStyle, "masculine" | "feminine">; label: string }> = [
  { value: "masculine", label: "男生" },
  { value: "feminine", label: "女生" },
];

const backgroundOptions: Array<{ value: AvatarConfig["background"]; label: string }> = [
  { value: "lavender", label: "薰衣草" },
  { value: "peach", label: "蜜桃" },
  { value: "mint", label: "薄荷" },
  { value: "sky", label: "天空" },
  { value: "sand", label: "暖沙" },
];

const petOptions: Array<{ value: AvatarConfig["pet"]; label: string }> = [
  { value: "none", label: "無" },
  { value: "sheep", label: "綿羊" },
  { value: "doe", label: "母鹿" },
  { value: "lion", label: "獅子" },
  { value: "eagle", label: "老鷹" },
];

export function AvatarEditor({
  value,
  onChange,
  showPreview = true,
}: {
  value: AvatarConfig;
  onChange: (value: AvatarConfig) => void;
  showPreview?: boolean;
}) {
  const avatar = normalizeAvatarConfig(value);
  const portraitOptions = getAvatarPortraitOptions(avatar);
  const materialChannels = getAvatarMaterialChannels(avatar);
  const hairstyleOptions = getAvatarHairstyleOptions(avatar.style);
  const selectedHairstyle = getAvatarHairstyle(avatar);
  const outfitOptions = portraitOptions?.active ? [] : getAvatarFormalOptions(avatar.style);
  const outfitChannels = outfitOptions.length ? getAvatarOutfitChannels(avatar) : [];
  const colorChannels = [...materialChannels, ...outfitChannels];

  const setStyle = (style: Extract<AvatarStyle, "masculine" | "feminine">) => {
    if (avatar.style === style) return;
    const next: AvatarConfig = {
      ...AVATAR_DEFAULTS[style],
      background: avatar.background,
      pet: avatar.pet,
      glasses: avatar.glasses,
      ...(avatar.eyewearVersion === "v1" ? { eyewearVersion: avatar.eyewearVersion, glassesStyle: avatar.glassesStyle } : {}),
      displayMode: avatar.displayMode,
      iconType: avatar.iconType,
      iconTone: avatar.iconTone,
      ...(avatar.materialColors ? { materialColors: avatar.materialColors } : {}),
    };
    onChange(getClassicHairTone(avatar) === "dark" ? selectClassicHairTone(next, "dark") : next);
  };

  return (
    <div className="relative">
      {showPreview && <AvatarLivePreview config={{ ...avatar, displayMode: "custom" }} />}
      <div className="mt-6 space-y-6">

      <section>
        <div className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">基礎角色</div>
        <div className="grid grid-cols-2 gap-3">
          {styleOptions.map((option) => {
            const selected = avatar.style === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => setStyle(option.value)}
                className={`flex flex-col items-center rounded-[22px] border p-4 text-center transition ${selected ? "border-[#6D55A3] bg-[#F3EEFF]" : "border-[#E6EAF0] bg-white"}`}
              >
                <AvatarRenderer config={AVATAR_DEFAULTS[option.value]} size={82} />
                <div className={`mt-3 text-sm font-black ${selected ? "text-[#6D55A3]" : "text-[#1F2937]"}`}>
                  {selected ? "✓ " : ""}{option.label}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {portraitOptions && (
        <>
          <section>
            <div className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">臉型</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "original", label: "原版", next: selectAvatarPortraitVersion(avatar, false), selected: !portraitOptions.active },
                ...portraitOptions.families.map(family => ({
                  id: family.id, label: family.label, next: selectAvatarPortraitFamily(avatar, family.id),
                  selected: portraitOptions.active && portraitOptions.family.id === family.id,
                })),
              ].map(option => (
                <button key={option.id} type="button" aria-pressed={option.selected} onClick={() => onChange(option.next)}
                  className={`flex min-h-11 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs font-bold ${option.selected ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}>
                  <AvatarRenderer config={{ ...option.next, displayMode: "custom", pet: "none" }} size={56} />
                  {option.label}
                </button>
              ))}
            </div>
          </section>
          {portraitOptions.active && (
            <section>
              <div className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">髮型</div>
              <div className="grid grid-cols-3 gap-2">
                {portraitOptions.family.hairStyles.map(hair => {
                  const selected = portraitOptions.hair.value === hair.value;
                  const next = selectAvatarFamilyHair(avatar, hair.value);
                  return (
                    <button key={hair.value} type="button" aria-pressed={selected} onClick={() => onChange(next)}
                      className={`flex min-h-11 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs font-bold ${selected ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}>
                      <AvatarRenderer config={{ ...next, displayMode: "custom", pet: "none" }} size={56} />
                      {hair.label}
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {!portraitOptions?.active && hairstyleOptions.length > 0 && (
        <section>
          <div className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">髮型</div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "original" as const, label: "原版" },
              ...hairstyleOptions,
            ].map(option => {
              const selected = (selectedHairstyle?.id ?? "original") === option.id;
              const next = selectAvatarHairstyle(avatar, option.id);
              return (
                <button key={option.id} type="button" aria-pressed={selected} onClick={() => onChange(next)}
                  className={`flex min-h-11 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs font-bold ${selected ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}>
                  <AvatarRenderer config={{ ...next, displayMode: "custom", pet: "none", glasses: false, materialColors: undefined }} size={64} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {avatar.style !== "neutral" && !portraitOptions?.active && !materialChannels.length && (
        <section>
          <div className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">髮色</div>
          <div className="grid grid-cols-2 gap-2">
            {AVATAR_CLASSIC_HAIR_TONES.map((tone) => {
              const selected = getClassicHairTone(avatar) === tone.value;
              const next = selectClassicHairTone(avatar, tone.value);
              return (
                <button
                  key={tone.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(next)}
                  className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-2 py-2 text-sm font-black ${selected ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}
                >
                  <AvatarRenderer config={{ ...next, displayMode: "custom", pet: "none" }} size={44} />
                  <span>{selected ? "✓ " : ""}{tone.label}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">眼鏡</div>
        {portraitOptions?.active ? (
          <div className="grid grid-cols-2 gap-2">
            {(["none", ...portraitOptions.glassesStyles] as const).map((style) => {
              const selected = style === "none" ? !avatar.glasses : avatar.glasses && portraitOptions.glassesStyle === style;
              return (
                <button
                  key={style}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(selectAvatarFamilyGlasses(avatar, style))}
                  className={`min-h-11 rounded-2xl border px-3 py-2 text-sm font-black ${selected ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}
                >
                  {style === "none" ? "無眼鏡" : AVATAR_GLASSES_LABELS[style]}
                </button>
              );
            })}
          </div>
        ) : avatar.style !== "neutral" ? (
          <div className="grid grid-cols-2 gap-2">
            {AVATAR_EYEWEAR_CHOICES.map((option) => {
              const selected = getAvatarLegacyEyewearChoice(avatar) === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onChange(selectAvatarLegacyEyewear(avatar, option.value))}
                  className={`min-h-11 rounded-2xl border px-3 py-2 text-sm font-black ${selected ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}
                >
                  {selected ? "✓ " : ""}{option.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-xs font-medium text-[#7B7B74]">請先選擇基礎角色。</div>
        )}
      </section>

      {outfitOptions.length > 0 && (
        <section>
          <div className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">服裝</div>
          <div className="grid grid-cols-2 gap-2">
            {[{ id: "original" as const, label: "原版休閒服" }, ...outfitOptions].map(option => {
              const selected = (avatar.formalOutfit?.id ?? "original") === option.id;
              const next = selectAvatarFormalOutfit(avatar, option.id);
              return (
                <button key={option.id} type="button" aria-pressed={selected} onClick={() => onChange(next)}
                  className={`flex min-h-11 flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs font-bold ${selected ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}>
                  <AvatarRenderer config={{ ...next, displayMode: "custom", pet: "none" }} size={72} />
                  {option.label}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {colorChannels.length > 0 && (
        <section>
          <div className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">人物色彩</div>
          <AvatarColorControls channels={colorChannels} values={{ ...avatar.materialColors, ...avatar.formalOutfit?.colors }}
            onChange={(part, color) => onChange(part === "clothing" || part === "lining" || part === "tie"
              ? setAvatarOutfitColor(avatar, part, color) : setAvatarMaterialColor(avatar, part, color))} />
        </section>
      )}

      <section>
        <div className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">背景</div>
        <div className="flex flex-wrap gap-2">
          {backgroundOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={avatar.background === option.value}
              onClick={() => onChange({ ...avatar, background: option.value })}
              className={`rounded-xl border px-3 py-2 text-xs font-bold ${avatar.background === option.value ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}
            >
              {avatar.background === option.value ? "✓ " : ""}{option.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-1 text-xs font-black tracking-widest text-[#7B7B74]">陪伴動物（選填）</div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {petOptions.map((option) => {
            const selected = avatar.pet === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ ...avatar, pet: option.value })}
                className={`flex min-h-24 flex-col items-center justify-center gap-1.5 rounded-2xl border px-2 py-3 text-xs font-black ${selected ? "border-[#6D55A3] bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}
              >
                {option.value === "none" ? (
                  <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/70 text-2xl">—</span>
                ) : (
                  <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/70">
                    <AvatarCompanionThumbnail pet={option.value} size={56} />
                  </span>
                )}
                <span>{selected ? "✓ " : ""}{option.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      </div>
    </div>
  );
}
