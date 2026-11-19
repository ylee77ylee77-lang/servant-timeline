"use client";

import { SystemAvatar } from "@/components/profile/SystemAvatar";
import {
  AVATAR_DEFAULTS,
  normalizeAvatarConfig,
  type AvatarConfig,
  type AvatarStyle,
} from "@/lib/profile/avatar";

const styleOptions: Array<{ value: AvatarStyle; label: string }> = [
  { value: "masculine", label: "男性風格" },
  { value: "feminine", label: "女性風格" },
  { value: "neutral", label: "中性風格" },
];

const optionGroups: Array<{
  key: keyof AvatarConfig;
  label: string;
  options: Array<{ value: string | boolean; label: string }>;
}> = [
  {
    key: "skinTone",
    label: "膚色",
    options: [
      { value: "light", label: "亮" },
      { value: "warm", label: "暖" },
      { value: "medium", label: "自然" },
      { value: "deep", label: "深" },
    ],
  },
  {
    key: "hair",
    label: "髮型",
    options: [
      { value: "short", label: "短髮" },
      { value: "side", label: "側分" },
      { value: "wave", label: "微捲" },
      { value: "bob", label: "短鮑伯" },
      { value: "long", label: "長髮" },
      { value: "bun", label: "包頭" },
    ],
  },
  {
    key: "hairColor",
    label: "髮色",
    options: [
      { value: "dark", label: "黑" },
      { value: "brown", label: "棕" },
      { value: "gray", label: "灰" },
    ],
  },
  {
    key: "outfit",
    label: "服裝",
    options: [
      { value: "shirt", label: "襯衫" },
      { value: "polo", label: "Polo" },
      { value: "knit", label: "針織" },
      { value: "jacket", label: "外套" },
    ],
  },
  {
    key: "background",
    label: "背景",
    options: [
      { value: "lavender", label: "薰衣草" },
      { value: "peach", label: "蜜桃" },
      { value: "mint", label: "薄荷" },
      { value: "sky", label: "天空" },
      { value: "sand", label: "暖沙" },
    ],
  },
  {
    key: "glasses",
    label: "眼鏡",
    options: [
      { value: false, label: "無" },
      { value: true, label: "有" },
    ],
  },
];

export function AvatarEditor({
  value,
  onChange,
  compact = false,
}: {
  value: AvatarConfig;
  onChange: (value: AvatarConfig) => void;
  compact?: boolean;
}) {
  const avatar = normalizeAvatarConfig(value);

  const setStyle = (style: AvatarStyle) => {
    const preset = AVATAR_DEFAULTS[style];
    onChange({ ...preset, skinTone: avatar.skinTone, background: avatar.background });
  };

  const patch = (key: keyof AvatarConfig, next: string | boolean) => {
    onChange({ ...avatar, [key]: next } as AvatarConfig);
  };

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <div className="flex items-center gap-4 rounded-[22px] border border-[#E6EAF0] bg-[#FFF9F3] p-4">
        <SystemAvatar config={avatar} size={compact ? 72 : 88} />
        <div>
          <div className="text-sm font-black text-[#1F2937]">我的系統頭像</div>
          <div className="mt-1 text-xs font-medium leading-5 text-[#7B7B74]">
            選擇男性、女性或中性基礎風格，再自由調整細節。
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-black tracking-widest text-[#7B7B74]">整體風格</div>
        <div className="grid grid-cols-3 gap-2">
          {styleOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStyle(option.value)}
              className={`rounded-2xl border px-2 py-2.5 text-xs font-black ${avatar.style === option.value ? "border-transparent bg-[#6D55A3] text-white" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {optionGroups.map((group) => (
        <div key={group.key}>
          <div className="mb-2 text-xs font-black tracking-widest text-[#7B7B74]">{group.label}</div>
          <div className="flex flex-wrap gap-2">
            {group.options.map((option) => {
              const selected = avatar[group.key] === option.value;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => patch(group.key, option.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold ${selected ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}
                >
                  {selected ? "✓ " : ""}{option.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
