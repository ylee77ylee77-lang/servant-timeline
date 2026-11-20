"use client";

import { AvatarRenderer, AvatarCompanionThumbnail } from "@/components/profile/AvatarRenderer";
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
}: {
  value: AvatarConfig;
  onChange: (value: AvatarConfig) => void;
  compact?: boolean;
}) {
  const avatar = normalizeAvatarConfig(value);
  const previewSummary = [
    avatar.style === "feminine" ? "女生" : avatar.style === "masculine" ? "男生" : "未選角色",
    avatar.glasses ? "眼鏡" : null,
    avatar.pet !== "none" ? petOptions.find((option) => option.value === avatar.pet)?.label : null,
  ].filter(Boolean).join("・");

  const setStyle = (style: Extract<AvatarStyle, "masculine" | "feminine">) => {
    const preset = AVATAR_DEFAULTS[style];
    onChange({
      ...preset,
      background: avatar.background,
      pet: avatar.pet,
      glasses: avatar.glasses,
      displayMode: avatar.displayMode,
    });
  };

  return (
    <div className="relative">
      <div className="sticky top-0 z-30 flex items-center gap-5 rounded-[22px] border border-[#E6EAF0] bg-gradient-to-br from-[#FFF9F3]/95 to-[#F7F4FF]/95 p-4 shadow-sm backdrop-blur-sm">
        <AvatarRenderer config={{ ...avatar, displayMode: "custom" }} size={104} />
        <div className="min-w-0">
          <div className="text-base font-black text-[#1F2937]">即時預覽</div>
          <div className="mt-1 truncate text-xs font-medium text-[#7B7B74]">{previewSummary}</div>
        </div>
      </div>
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

      <section>
        <div className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">眼鏡</div>
        <div className="grid grid-cols-2 gap-2">
          {[false, true].map((value) => (
            <button
              key={String(value)}
              type="button"
              aria-pressed={avatar.glasses === value}
              onClick={() => onChange({ ...avatar, glasses: value })}
              className={`rounded-2xl border px-3 py-3 text-sm font-black ${avatar.glasses === value ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}
            >
              {avatar.glasses === value ? "✓ " : ""}{value ? "有眼鏡" : "無眼鏡"}
            </button>
          ))}
        </div>
      </section>

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

      <section className="rounded-2xl border border-[#E8D9A2] bg-[#FFF9E8] p-4">
        <div className="text-xs font-black text-[#7A5A11]">更多 3D 特徵素材正在建立</div>
        <p className="mt-1 text-xs font-medium leading-5 text-[#7B6A45]">
          髮型、髮色、眼睛、配件與服裝會等同品質的 3D 素材準備完成後再開放，不使用不相容的扁平圖層。
        </p>
      </section>
      </div>
    </div>
  );
}
