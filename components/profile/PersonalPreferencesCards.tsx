"use client";

import { AudioLines, Bell } from "lucide-react";
import { SettingsAccordionCard, type SettingsPanel } from "@/components/profile/SettingsAccordionCard";

type VoiceProfile = "zephyr" | "iapetus";
type VoiceDetailLevel = "simple" | "standard" | "detailed";

export type PersonalPreferenceValues = {
  voiceProfile: VoiceProfile;
  voiceDetailLevel: VoiceDetailLevel;
  voiceReminderEnabled: boolean;
  vibrationReminderEnabled: boolean;
  reminderPre5Enabled: boolean;
  reminderNowEnabled: boolean;
};

type PersonalPreferencesCardsProps = {
  settings: PersonalPreferenceValues;
  onChange: (patch: Partial<PersonalPreferenceValues>) => void;
  isVoiceEnabled: boolean;
  isWakeLockActive: boolean;
  expandedPanel: SettingsPanel | null;
  onToggle: (panel: SettingsPanel) => void;
};

const VOICE_OPTIONS = [
  { value: "zephyr", label: "女聲 Zephyr", description: "自然、明亮、溫柔，適合一般提醒。" },
  { value: "iapetus", label: "男聲 Iapetus", description: "自然、穩重、清楚，適合現場指令。" },
] as const;

const REMINDER_SWITCHES = [
  { key: "voiceReminderEnabled", label: "語音助理", description: "開啟後，才會播放個人耳機提醒。" },
  { key: "vibrationReminderEnabled", label: "震動提醒", description: "進入下一個任務區塊時震動提醒。" },
  { key: "reminderPre5Enabled", label: "5分鐘前", description: "任務前五分鐘先提醒一次。" },
  { key: "reminderNowEnabled", label: "準點", description: "任務時間到時提醒一次。" },
] as const;

const DETAIL_OPTIONS = [
  { value: "simple", label: "極簡", description: "極簡：提醒更短，適合服事中快速聽懂。" },
  { value: "standard", label: "標準", description: "標準：預告含時間，即時提醒更短。" },
  { value: "detailed", label: "詳細", description: "詳細：會加上任務提示與前三項確認清單，適合任務不多的崗位。" },
] as const;

const cardIconClass = "flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#F3EEFF] text-[#6D55A3]";

export function PersonalPreferencesCards({
  settings,
  onChange,
  isVoiceEnabled,
  isWakeLockActive,
  expandedPanel,
  onToggle,
}: PersonalPreferencesCardsProps) {
  const selectedVoice = settings.voiceProfile === "iapetus" ? "男聲 Iapetus" : "女聲 Zephyr";
  const selectedDetail = DETAIL_OPTIONS.find((item) => item.value === settings.voiceDetailLevel) ?? DETAIL_OPTIONS[1];

  return (
    <div className="space-y-4">
      <SettingsAccordionCard
        panelId="personal-voice-settings-panel"
        title="語音風格"
        summary={selectedVoice}
        icon={<span className={cardIconClass}><AudioLines className="h-6 w-6" /></span>}
        expanded={expandedPanel === "voice"}
        onToggle={() => onToggle("voice")}
      >
        <p className="mb-3 text-xs font-medium leading-5 text-[#7B7B74]">
          每位同工可在本機選擇自己的語音；開啟語音助理時會盡量保持畫面亮起，服事結束後會自動關閉。
        </p>
        <p className={`mb-4 text-[11px] font-bold ${isVoiceEnabled && isWakeLockActive ? "text-[#008A7A]" : "text-[#7B7B74]"}`}>
          {isVoiceEnabled
            ? isWakeLockActive
              ? "螢幕保持喚醒：已啟用"
              : "螢幕保持喚醒：此裝置可能不支援"
            : "語音助理關閉時不會保持螢幕喚醒"}
        </p>
        <div data-voice-profile-selector="chirp3">
          <h3 className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">語音選擇</h3>
          <div className="grid grid-cols-2 gap-2">
            {VOICE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={settings.voiceProfile === option.value}
                onClick={() => onChange({ voiceProfile: option.value })}
                className={`min-h-20 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2 ${
                  settings.voiceProfile === option.value
                    ? "border-transparent bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white"
                    : "border-[#E6EAF0] bg-white text-[#7B7B74]"
                }`}
              >
                <span className="block text-sm font-black">
                  {settings.voiceProfile === option.value ? "✓ " : ""}{option.label}
                </span>
                <span className="mt-1 block text-[10px] font-bold leading-4 opacity-80">{option.description}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="mt-4 text-center text-[11px] font-bold text-[#008A7A]">
          設定已自動儲存在這台裝置
        </p>
      </SettingsAccordionCard>

      <SettingsAccordionCard
        panelId="personal-reminder-settings-panel"
        title="提醒設定"
        summary={`語音${settings.voiceReminderEnabled ? "開啟" : "關閉"}・震動${settings.vibrationReminderEnabled ? "開啟" : "關閉"}・${selectedDetail.label}內容`}
        icon={<span className={cardIconClass}><Bell className="h-6 w-6" /></span>}
        expanded={expandedPanel === "reminder"}
        onToggle={() => onToggle("reminder")}
      >
        <h3 className="mb-3 text-xs font-black tracking-widest text-[#7B7B74]">提醒開關</h3>
        <div className="space-y-2.5">
          {REMINDER_SWITCHES.map((item) => {
            const active = settings[item.key];
            return (
              <button
                key={item.key}
                type="button"
                role="switch"
                aria-checked={active}
                onClick={() => onChange({ [item.key]: !active })}
                className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border p-3.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2 ${
                  active
                    ? "border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3]"
                    : "border-[#E6EAF0] bg-white text-[#7B7B74]"
                }`}
              >
                <span className="text-left">
                  <span className="block text-sm font-black">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] font-medium leading-4 opacity-75">{item.description}</span>
                </span>
                <span aria-hidden="true" className={`h-6 w-10 shrink-0 rounded-full p-1 transition-colors ${active ? "bg-[#6D55A3]" : "bg-[#E6EAF0]"}`}>
                  <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${active ? "translate-x-4" : "translate-x-0"}`} />
                </span>
              </button>
            );
          })}
        </div>

        <h3 className="mb-3 mt-6 text-xs font-black tracking-widest text-[#7B7B74]">提醒內容</h3>
        <div className="grid grid-cols-3 gap-2">
          {DETAIL_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={settings.voiceDetailLevel === option.value}
              onClick={() => onChange({ voiceDetailLevel: option.value })}
              className={`min-h-11 rounded-2xl border px-2 py-2.5 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2 ${
                settings.voiceDetailLevel === option.value
                  ? "border-transparent bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white shadow-md shadow-[#F25D6B]/15"
                  : "border-[#E6EAF0] bg-white text-[#7B7B74]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mt-3 rounded-2xl border border-[#E6EAF0] bg-[#FFF9F3] p-3 text-xs font-medium leading-relaxed text-[#7B7B74]">
          {selectedDetail.description}
        </p>
        <p className="mt-4 text-center text-[11px] font-bold text-[#008A7A]">
          設定已自動儲存在這台裝置
        </p>
      </SettingsAccordionCard>
    </div>
  );
}
