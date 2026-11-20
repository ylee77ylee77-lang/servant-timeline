"use client";

import { SystemAvatar } from "@/components/profile/SystemAvatar";
import { AVATAR_DISPLAY_LABELS, type AvatarConfig, type AvatarDisplayMode } from "@/lib/profile/avatar";
import { getAvatarScene } from "@/lib/profile/avatar-scene";

/** The same full-sized sticky live preview in registration and profile editing. */
export function AvatarLivePreview({
  config,
  displayName,
}: {
  config: AvatarConfig;
  displayName?: string | null;
}) {
  const { avatar, companion } = getAvatarScene(config);
  const description = avatar.displayMode === "custom"
    ? [
        avatar.style === "feminine" ? "女生" : avatar.style === "masculine" ? "男生" : "未選角色",
        avatar.glasses ? "眼鏡" : null,
        companion?.name,
      ].filter(Boolean).join("・")
    : AVATAR_DISPLAY_LABELS[avatar.displayMode];

  return (
    <div className="sticky top-0 z-30 flex items-center gap-5 rounded-[22px] border border-[#E6EAF0] bg-gradient-to-br from-[#FFF9F3]/95 to-[#F7F4FF]/95 p-4 shadow-sm backdrop-blur-sm">
      <SystemAvatar config={avatar} displayName={displayName} size={104} />
      <div className="min-w-0">
        <div className="text-base font-black text-[#1F2937]">即時預覽</div>
        <div className="mt-1 truncate text-xs font-medium text-[#7B7B74]">{description}</div>
      </div>
    </div>
  );
}

/** A single display-mode picker shared by sign-up and authenticated settings. */
export function AvatarDisplayModeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: AvatarDisplayMode;
  onChange: (mode: AvatarDisplayMode) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="mt-4 space-y-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-black text-[#1F2937]">大頭貼顯示方式</legend>
      {(["custom", "default", "name"] as const).map((mode) => (
        <label key={mode} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[#E6EAF0] px-3 py-2 text-sm font-medium text-[#1F2937]">
          <input
            type="radio"
            name="avatar-display-mode"
            checked={value === mode}
            onChange={() => onChange(mode)}
            className="h-4 w-4 accent-[#6D55A3]"
          />
          {AVATAR_DISPLAY_LABELS[mode]}
        </label>
      ))}
    </fieldset>
  );
}
