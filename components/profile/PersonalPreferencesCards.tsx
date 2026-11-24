"use client";

import { useState, useSyncExternalStore } from "react";
import { AudioLines, Bell, ChevronDown, ChevronUp } from "lucide-react";
import { SettingsAccordionCard, type SettingsPanel } from "@/components/profile/SettingsAccordionCard";
import { MAX_REMINDER_LEAD_MINUTES, formatReminderLeadLabel, normalizeReminderLeadTime, stepReminderLeadTime } from "@/lib/voice/reminder-timing";

type VoiceProfile = "zephyr" | "iapetus";
type VoiceDetailLevel = "simple" | "standard" | "detailed";

export type PersonalPreferenceValues = {
  voiceProfile: VoiceProfile;
  voiceDetailLevel: VoiceDetailLevel;
  voiceReminderEnabled: boolean;
  vibrationReminderEnabled: boolean;
  reminderPre5Enabled: boolean;
  reminderNowEnabled: boolean;
  reminderLeadMinutes: number;
  reminderLeadSeconds: number;
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
  { value: "zephyr", label: "女聲" },
  { value: "iapetus", label: "男聲" },
] as const;

const DETAIL_OPTIONS = [
  { value: "simple", label: "極簡", description: "極簡：提醒更短，適合服事中快速聽懂。" },
  { value: "standard", label: "標準", description: "標準：預告含時間，即時提醒更短。" },
  { value: "detailed", label: "詳細", description: "詳細：會加上任務提示與前三項確認清單，適合任務不多的崗位。" },
] as const;

const cardIconClass = "flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#F3EEFF] text-[#6D55A3]";

type VibrationCapability = "web" | "ios-switch" | "none" | null;

const subscribeToDeviceCapability = () => () => {};
const serverVibrationCapability = (): VibrationCapability => null;
const getVibrationCapability = (): VibrationCapability => {
  if (typeof navigator === "undefined") return null;
  const isAppleTouchDevice = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return typeof navigator.vibrate === "function" ? "web" : isAppleTouchDevice ? "ios-switch" : "none";
};


type PreferenceSwitchProps = {
  label: string;
  description?: string;
  controls?: string;
  checked: boolean;
  onToggle: () => void;
  nativeHaptics?: boolean;
};

/** Preserve the existing switch visuals; direct native touch provides iOS haptic feedback. */
function PreferenceSwitch({ label, description, controls, checked, onToggle, nativeHaptics = false }: PreferenceSwitchProps) {
  if (nativeHaptics) {
    return (
      <label className="relative inline-flex h-11 w-12 shrink-0 cursor-pointer items-center rounded-xl focus-within:outline-none focus-within:ring-2 focus-within:ring-[#6D55A3] focus-within:ring-offset-2">
        <input
          type="checkbox"
          {...{ switch: "" }}
          checked={checked}
          aria-label={label}
          onChange={(event) => {
            // iOS 26.5+ requires a direct tap on the real switch; scripted .click() no longer vibrates.
            // Other browsers keep their normal Web Vibration API activation preview.
            if (event.currentTarget.checked && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
              try {
                navigator.vibrate(150);
              } catch {
                // Lack of vibration hardware should never block saving the preference.
              }
            }
            onToggle();
          }}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className={"inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors " + (checked ? "bg-[#6D55A3]" : "bg-[#E6EAF0]")}
        >
          <span className={"block h-5 w-5 rounded-full bg-white shadow-sm transition-transform " + (checked ? "translate-x-5" : "translate-x-0")} />
        </span>
      </label>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      aria-controls={controls}
      aria-expanded={controls ? checked : undefined}
      onClick={onToggle}
      className={(description
        ? "flex min-h-14 w-full items-center justify-between gap-3 p-3.5 text-left "
        : "inline-flex h-7 w-12 shrink-0 items-center "
      ) + "rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2"}
    >
      {description && (
        <span className="min-w-0">
          <span className="block text-sm font-black text-[#1F2937]">{label}</span>
          <span className="mt-0.5 block text-[11px] font-medium leading-4 text-[#7B7B74]">{description}</span>
        </span>
      )}
      <span
        aria-hidden="true"
        className={"inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors " + (checked ? "bg-[#6D55A3]" : "bg-[#E6EAF0]")}
      >
        <span className={"block h-5 w-5 rounded-full bg-white shadow-sm transition-transform " + (checked ? "translate-x-5" : "translate-x-0")} />
      </span>
    </button>
  );
}

export function PersonalPreferencesCards({
  settings,
  onChange,
  expandedPanel,
  onToggle,
}: PersonalPreferencesCardsProps) {
  const selectedVoice = settings.voiceProfile === "iapetus" ? "男聲" : "女聲";
  const selectedDetail = DETAIL_OPTIONS.find((item) => item.value === settings.voiceDetailLevel) ?? DETAIL_OPTIONS[1];
  const lead = normalizeReminderLeadTime(settings.reminderLeadMinutes, settings.reminderLeadSeconds);
  const [contentExpanded, setContentExpanded] = useState(false);
  const vibrationCapability = useSyncExternalStore(
    subscribeToDeviceCapability, getVibrationCapability, serverVibrationCapability
  );
  const adjustLead = (unit: "minutes" | "seconds", direction: -1 | 1) => {
    const next = stepReminderLeadTime(lead.minutes, lead.seconds, unit, direction);
    onChange({ reminderLeadMinutes: next.minutes, reminderLeadSeconds: next.seconds });
  };

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
              </button>
            ))}
          </div>
        </div>
      </SettingsAccordionCard>

      <SettingsAccordionCard
        panelId="personal-reminder-settings-panel"
        title="提醒設定"
        summary={`語音${settings.voiceReminderEnabled ? "開啟" : "關閉"}・震動${settings.vibrationReminderEnabled ? "開啟" : "關閉"}・${selectedDetail.label}內容`}
        icon={<span className={cardIconClass}><Bell className="h-6 w-6" /></span>}
        expanded={expandedPanel === "reminder"}
        onToggle={() => onToggle("reminder")}
      >
        <div className="space-y-2.5" data-reminder-settings-layers>
          {/* Second level: independent vibration toggle. */}
          <div className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[#E6EAF0] bg-white p-3.5">
            <span className="min-w-0">
              <span className="block text-sm font-black text-[#1F2937]">震動提醒</span>
              <span className="mt-0.5 block text-[11px] font-medium leading-4 text-[#7B7B74]">
                {vibrationCapability === "ios-switch"
                  ? "iPhone 點選開關可有觸覺回饋；任務到點自動震動需使用系統通知或原生 App。"
                  : vibrationCapability === "none"
                    ? "此瀏覽器不支援任務到點的網頁震動。"
                    : "進入下一個任務區塊時震動提醒。"}
              </span>
            </span>
            <PreferenceSwitch
              label="震動提醒"
              nativeHaptics
              checked={settings.vibrationReminderEnabled}
              onToggle={() => onChange({ vibrationReminderEnabled: !settings.vibrationReminderEnabled })}
            />
          </div>

          {/* The voice switch directly shows or hides its third-level options. */}
          <div className="overflow-hidden rounded-2xl border border-[#E6EAF0] bg-white">
            <PreferenceSwitch
              label="語音助理"
              description="開關會記憶在本機，並與頁首語音按鈕同步。"
              controls="personal-reminder-voice-options"
              checked={settings.voiceReminderEnabled}
              onToggle={() => onChange({ voiceReminderEnabled: !settings.voiceReminderEnabled })}
            />
            <div
              id="personal-reminder-voice-options"
              hidden={!settings.voiceReminderEnabled}
              className="space-y-2.5 border-t border-[#E6EAF0] bg-[#FFF9F3] p-3"
            >
              {/* Enabling an advance reminder immediately reveals its time controls. */}
              <div className="overflow-hidden rounded-2xl border border-[#E6EAF0] bg-white">
                <PreferenceSwitch
                  label="提前提醒"
                  description={`提前 ${formatReminderLeadLabel(lead.minutes, lead.seconds)}`}
                  controls="personal-reminder-lead-options"
                  checked={settings.reminderPre5Enabled}
                  onToggle={() => onChange({ reminderPre5Enabled: !settings.reminderPre5Enabled })}
                />
                <div id="personal-reminder-lead-options" hidden={!settings.reminderPre5Enabled}>
                  <div className="border-t border-[#E6EAF0] bg-[#F3EEFF] px-3.5 pb-3.5" data-reminder-lead-stepper>
                    <div className="border-t border-[#6D55A3]/10 pt-3">
                        <h3 className="mb-2 text-sm font-black text-[#1F2937]">提前時間</h3>
                        <div className="flex items-center justify-center gap-2 rounded-2xl bg-[#FFF9F3] px-2 py-3">
                          <div className="flex items-center gap-1.5">
                            <div className="flex flex-col items-center">
                              <button
                                type="button"
                                aria-label="增加提前提醒分鐘"
                                disabled={lead.minutes >= MAX_REMINDER_LEAD_MINUTES}
                                onClick={() => adjustLead("minutes", 1)}
                                className="flex h-11 w-12 items-center justify-center rounded-xl text-[#6D55A3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] disabled:opacity-30"
                              >
                                <ChevronUp className="h-6 w-6" />
                              </button>
                              <span aria-live="polite" className="w-12 text-center font-mono text-2xl font-black tabular-nums text-[#1F2937]">
                                {String(lead.minutes).padStart(2, "0")}
                              </span>
                              <button
                                type="button"
                                aria-label="減少提前提醒分鐘"
                                disabled={lead.minutes <= 0}
                                onClick={() => adjustLead("minutes", -1)}
                                className="flex h-11 w-12 items-center justify-center rounded-xl text-[#6D55A3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] disabled:opacity-30"
                              >
                                <ChevronDown className="h-6 w-6" />
                              </button>
                            </div>
                            <span className="text-sm font-black text-[#7B7B74]">分</span>
                          </div>
                          <span aria-hidden="true" className="self-center text-xl font-black text-[#A1A1AA]">:</span>
                          <div className="flex items-center gap-1.5">
                            <div className="flex flex-col items-center">
                              <button
                                type="button"
                                aria-label="增加提前提醒秒數"
                                onClick={() => adjustLead("seconds", 1)}
                                className="flex h-11 w-12 items-center justify-center rounded-xl text-[#6D55A3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3]"
                              >
                                <ChevronUp className="h-6 w-6" />
                              </button>
                              <span aria-live="polite" className="w-12 text-center font-mono text-2xl font-black tabular-nums text-[#1F2937]">
                                {String(lead.seconds).padStart(2, "0")}
                              </span>
                              <button
                                type="button"
                                aria-label="減少提前提醒秒數"
                                onClick={() => adjustLead("seconds", -1)}
                                className="flex h-11 w-12 items-center justify-center rounded-xl text-[#6D55A3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3]"
                              >
                                <ChevronDown className="h-6 w-6" />
                              </button>
                            </div>
                            <span className="text-sm font-black text-[#7B7B74]">秒</span>
                          </div>
                        </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[#E6EAF0] bg-white p-3.5">
                <span className="min-w-0">
                  <span className="block text-sm font-black text-[#1F2937]">準點提醒</span>
                  <span className="mt-0.5 block text-[11px] font-medium leading-4 text-[#7B7B74]">任務時間到時提醒一次。</span>
                </span>
                <PreferenceSwitch
                  label="準點提醒"
                  checked={settings.reminderNowEnabled}
                  onToggle={() => onChange({ reminderNowEnabled: !settings.reminderNowEnabled })}
                />
              </div>
            </div>
          </div>

          {/* Reminder content is its own matching second-level disclosure card. */}
          <div className="overflow-hidden rounded-2xl border border-[#E6EAF0] bg-white">
            <button
              type="button"
              aria-expanded={contentExpanded}
              aria-controls="personal-reminder-content-options"
              onClick={() => setContentExpanded((current) => !current)}
              className="flex min-h-14 w-full items-center justify-between gap-3 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2"
            >
              <span className="text-sm font-black text-[#1F2937]">提醒內容</span>
              <span className="ml-auto text-xs font-bold text-[#7B7B74]">{selectedDetail.label}</span>
              <ChevronDown aria-hidden="true" className={"h-4 w-4 shrink-0 text-[#6D55A3] transition-transform " + (contentExpanded ? "rotate-180" : "")} />
            </button>
            <div
              id="personal-reminder-content-options"
              hidden={!contentExpanded}
              className="border-t border-[#E6EAF0] bg-[#FFF9F3] p-3.5"
            >
              <div className="grid grid-cols-3 gap-2">
                {DETAIL_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={settings.voiceDetailLevel === option.value}
                    onClick={() => onChange({ voiceDetailLevel: option.value })}
                    className={"min-h-11 rounded-2xl border px-2 py-2.5 text-xs font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2 " + (
                      settings.voiceDetailLevel === option.value
                        ? "border-transparent bg-gradient-to-r from-[#F25D6B] to-[#6D55A3] text-white shadow-md shadow-[#F25D6B]/15"
                        : "border-[#E6EAF0] bg-white text-[#7B7B74]"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 rounded-2xl border border-[#E6EAF0] bg-white p-3 text-xs font-medium leading-relaxed text-[#7B7B74]">
                {selectedDetail.description}
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] font-bold text-[#008A7A]">
          設定已自動儲存在這台裝置
        </p>
      </SettingsAccordionCard>
    </div>
  );
}
