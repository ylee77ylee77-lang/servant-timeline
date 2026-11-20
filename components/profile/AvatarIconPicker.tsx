"use client";

import { Check } from "lucide-react";
import { SystemIconArtwork } from "@/components/profile/SystemIconArtwork";
import { AVATAR_ICON_OPTIONS, AVATAR_ICON_TONES } from "@/lib/profile/avatar-icon";
import { normalizeAvatarConfig, type AvatarConfig, type AvatarIconTone } from "@/lib/profile/avatar";

/** Shared icon and color picker. Only the selected values are persisted. */
export function AvatarIconPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: AvatarConfig;
  onChange: (config: AvatarConfig) => void;
  disabled?: boolean;
}) {
  const avatar = normalizeAvatarConfig(value);
  const tones = Object.entries(AVATAR_ICON_TONES) as Array<
    [AvatarIconTone, (typeof AVATAR_ICON_TONES)[AvatarIconTone]]
  >;

  return (
    <div className="mt-5 space-y-5">
      <fieldset disabled={disabled}>
        <legend className="mb-3 text-sm font-black text-[#1F2937]">選擇圖示</legend>
        <div className="grid grid-cols-6 gap-1 sm:gap-1.5">
          {AVATAR_ICON_OPTIONS.map(({ value: icon, label }) => {
            const selected = avatar.iconType === icon;
            return (
              <button
                key={icon}
                type="button"
                aria-pressed={selected}
                aria-label={label}
                disabled={disabled}
                onClick={() => onChange({ ...avatar, iconType: icon })}
                className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border bg-white px-0.5 py-2 text-[10px] font-bold transition disabled:opacity-50 sm:text-[11px] ${selected
                  ? "border-[#7751B8] bg-[#FAF7FF] text-[#624394] ring-1 ring-[#7751B8]"
                  : "border-[#E6EAF0] text-[#52545B] hover:border-[#B8A7D3]"}`}
              >
                {selected && (
                  <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-[#7751B8] text-white" aria-hidden="true">
                    <Check size={11} strokeWidth={3} />
                  </span>
                )}
                <SystemIconArtwork icon={icon} tone={avatar.iconTone} size={38} />
                <span className="max-w-full whitespace-nowrap leading-tight">{label}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset disabled={disabled}>
        <legend className="mb-3 text-sm font-black text-[#1F2937]">色調</legend>
        <div className="grid grid-cols-6 gap-1.5">
          {tones.map(([tone, palette]) => {
            const selected = tone === avatar.iconTone;
            return (
              <button
                key={tone}
                type="button"
                aria-pressed={selected}
                aria-label={palette.label}
                disabled={disabled}
                onClick={() => onChange({ ...avatar, iconTone: tone })}
                className="flex min-w-0 flex-col items-center gap-1 text-center disabled:opacity-50"
              >
                <span
                  className={`relative grid h-9 w-9 place-items-center rounded-full border-[3px] border-white shadow-sm outline outline-1 ${selected ? "outline-2 outline-[#7751B8]" : "outline-[#DEE2E8]"}`}
                  style={{ backgroundColor: palette.swatch }}
                >
                  {selected && <Check size={16} strokeWidth={3} color="#fff" aria-hidden="true" />}
                </span>
                <span className="text-[9px] font-medium leading-4 text-[#56515F] sm:text-[10px]">
                  {palette.label}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
