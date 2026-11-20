"use client";

import { SystemAvatar } from "@/components/profile/SystemAvatar";
import { AVATAR_DISPLAY_LABELS, type AvatarConfig, type AvatarDisplayMode } from "@/lib/profile/avatar";
import { AVATAR_ICON_OPTIONS, AVATAR_ICON_TONES } from "@/lib/profile/avatar-icon";
import { getAvatarScene } from "@/lib/profile/avatar-scene";

/** The same full-sized sticky live preview in registration and profile editing. */
export function AvatarLivePreview({
  config,
  displayName,
  sticky = true,
}: {
  config: AvatarConfig;
  displayName?: string | null;
  sticky?: boolean;
}) {
  const { avatar, companion } = getAvatarScene(config);
  const description = avatar.displayMode === "custom"
    ? [
        avatar.style === "feminine" ? "女生" : avatar.style === "masculine" ? "男生" : "未選角色",
        avatar.glasses ? "眼鏡" : null,
        companion?.name,
      ].filter(Boolean).join("・")
    : avatar.displayMode === "default"
      ? [
          AVATAR_ICON_OPTIONS.find((option) => option.value === avatar.iconType)?.label,
          AVATAR_ICON_TONES[avatar.iconTone].label,
        ].filter(Boolean).join("・")
      : AVATAR_DISPLAY_LABELS[avatar.displayMode];

  return (
    <div className={`${sticky ? "sticky top-0 z-30 " : ""}flex items-center gap-5 rounded-[22px] border border-[#E6EAF0] bg-gradient-to-br from-[#FFF9F3]/95 to-[#F7F4FF]/95 p-4 shadow-sm backdrop-blur-sm`}>
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
      <legend className="mb-2 text-sm font-black text-[#1F2937]">顯示方式</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {(["custom", "default", "name"] as const).map((mode) => (
          <label key={mode} className={`flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-bold sm:text-sm ${value === mode ? "border-[#7751B8] bg-[#F8F5FF] text-[#624394]" : "border-[#E6EAF0] text-[#52545B]"}`}>
            <input
              type="radio"
              name="avatar-display-mode"
              checked={value === mode}
              onChange={() => onChange(mode)}
              className="h-3.5 w-3.5 shrink-0 accent-[#6D55A3]"
            />
            {AVATAR_DISPLAY_LABELS[mode]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
