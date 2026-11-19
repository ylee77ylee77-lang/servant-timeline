"use client";

import { SystemAvatar } from "@/components/profile/SystemAvatar";
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

const optionGroups: Array<{
  key: keyof AvatarConfig;
  label: string;
  helper?: string;
  options: Array<{ value: string | boolean; label: string }>;
}> = [
  {
    key: "eyeStyle",
    label: "眼睛",
    options: [
      { value: "soft", label: "柔和" },
      { value: "bright", label: "明亮大眼" },
      { value: "smile", label: "微笑眼" },
    ],
  },
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
      { value: "auburn", label: "紅棕" },
      { value: "gray", label: "灰" },
      { value: "blonde", label: "亞麻" },
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
  {
    key: "accessory",
    label: "配件",
    options: [
      { value: "none", label: "無" },
      { value: "earrings", label: "耳環" },
      { value: "hairclip", label: "髮夾" },
      { value: "cap", label: "帽子" },
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
    key: "pet",
    label: "寵物（選填）",
    helper: "第一階段提供狗、貓、鳥；人物仍是大頭貼主體。",
    options: [
      { value: "none", label: "無" },
      { value: "dog", label: "狗" },
      { value: "cat", label: "貓" },
      { value: "bird", label: "鳥" },
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

  const setStyle = (style: Extract<AvatarStyle, "masculine" | "feminine">) => {
    const preset = AVATAR_DEFAULTS[style];
    onChange({
      ...preset,
      skinTone: avatar.skinTone,
      background: avatar.background,
      pet: avatar.pet,
    });
  };

  const patch = (key: keyof AvatarConfig, next: string | boolean) => {
    onChange({ ...avatar, [key]: next } as AvatarConfig);
  };

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      <div className="flex items-center gap-4 rounded-[24px] border border-[#E6EAF0] bg-gradient-to-br from-[#FFF9F3] to-[#F7F4FF] p-4">
        <div className="shrink-0 rounded-full bg-white p-1 shadow-md shadow-[#6D55A3]/10">
          <SystemAvatar config={avatar} size={compact ? 76 : 96} />
        </div>
        <div>
          <div className="text-sm font-black text-[#1F2937]">即時預覽</div>
          <div className="mt-1 text-xs font-medium leading-5 text-[#7B7B74]">
            3D 立體卡通感、柔和光影與較有表情的大眼設計。
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-xs font-black tracking-widest text-[#7B7B74]">基礎角色</div>
        <div className="grid grid-cols-2 gap-3">
          {styleOptions.map((option) => {
            const selected = avatar.style === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setStyle(option.value)}
                className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition ${selected ? "border-[#6D55A3] bg-[#F3EEFF]" : "border-[#E6EAF0] bg-white"}`}
              >
                <SystemAvatar config={AVATAR_DEFAULTS[option.value]} size={52} />
                <div>
                  <div className={`text-sm font-black ${selected ? "text-[#6D55A3]" : "text-[#1F2937]"}`}>
                    {selected ? "✓ " : ""}{option.label}
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium text-[#7B7B74]">起始模板</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {optionGroups.map((group) => (
        <div key={group.key}>
          <div className="mb-2 text-xs font-black tracking-widest text-[#7B7B74]">{group.label}</div>
          {group.helper && (
            <p className="mb-2 text-[11px] font-medium leading-5 text-[#7B7B74]">{group.helper}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {group.options.map((option) => {
              const selected = avatar[group.key] === option.value;
              return (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => patch(group.key, option.value)}
                  className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${selected ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]"}`}
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
