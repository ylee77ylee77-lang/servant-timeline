"use client";

import { useState } from "react";
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
  { value: "zephyr", label: "女聲 Zephyr", description: "自然、明亮、溫柔，適合一般提醒。" },
  { value: "iapetus", label: "男聲 Iapetus", description: "自然、穩重、清楚，適合現場指令。" },
] as const;

const DETAIL_OPTIONS = [
  { value: "simple", label: "極簡", description: "極簡：提醒更短，適合服事中快速聽懂。" },
  { value: "standard", label: "標準", description: "標準：預告含時間，即時提醒更短。" },
  { value: "detailed", label: "詳細", description: "詳細：會加上任務提示與前三項確認清單，適合任務不多的崗位。" },
] as const;

const cardIconClass = "flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#F3EEFF] text-[#6D55A3]";


type PreferenceSwitchProps = {
  label: string;
  checked: boolean;
  onToggle: () => void;
};

/** Keep the toggle separate from the disclosure button to avoid unintended voice changes. */
function PreferenceSwitch({ label, checked, onToggle }: PreferenceSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={onToggle}
      className={"relative inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2 " + (
        checked ? "bg-[#6D55A3]" : "bg-[#E6EAF0]"
      )}
    >
      <span
        aria-hidden="true"
        className={"block h-5 w-5 rounded-full bg-white shadow-sm transition-transform " + (checked ? "translate-x-5" : "translate-x-0")}
      />
    </button>
  );
}

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
  const lead = normalizeReminderLeadTime(settings.reminderLeadMinutes, settings.reminderLeadSeconds);
  const [openReminderSection, setOpenReminderSection] = useState<"voice" | "content" | null>(null);
  const [leadTimeExpanded, setLeadTimeExpanded] = useState(false);
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
        <div className="space-y-2.5" data-reminder-settings-layers>
          {/* Second level: independent vibration toggle. */}
          <div className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-[#E6EAF0] bg-white p-3.5">
            <span className="min-w-0">
              <span className="block text-sm font-black text-[#1F2937]">震動提醒</span>
              <span className="mt-0.5 block text-[11px] font-medium leading-4 text-[#7B7B74]">進入下一個任務區塊時震動提醒。</span>
            </span>
            <PreferenceSwitch
              label="震動提醒"
              checked={settings.vibrationReminderEnabled}
              onToggle={() => onChange({ vibrationReminderEnabled: !settings.vibrationReminderEnabled })}
            />
          </div>

          {/* Second level: opening voice options must not toggle audio. */}
          <div className="overflow-hidden rounded-2xl border border-[#E6EAF0] bg-white">
            <div className="flex items-center gap-2 px-3.5">
              <button
                type="button"
                aria-expanded={openReminderSection === "voice"}
                aria-controls="personal-reminder-voice-options"
                onClick={() => setOpenReminderSection((current) => current === "voice" ? null : "voice")}
                className="flex min-h-16 min-w-0 flex-1 items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-black text-[#1F2937]">語音助理</span>
                  <span className="mt-0.5 block text-[11px] font-medium leading-4 text-[#7B7B74]">開關會記憶在本機，並與頁首語音按鈕同步。</span>
                </span>
                <ChevronDown aria-hidden="true" className={"h-4 w-4 shrink-0 text-[#6D55A3] transition-transform " + (openReminderSection === "voice" ? "rotate-180" : "")} />
              </button>
              <PreferenceSwitch
                label="語音助理"
                checked={settings.voiceReminderEnabled}
                onToggle={() => onChange({ voiceReminderEnabled: !settings.voiceReminderEnabled })}
              />
            </div>
            <div
              id="personal-reminder-voice-options"
              hidden={openReminderSection !== "voice"}
              className="space-y-2.5 border-t border-[#E6EAF0] bg-[#FFF9F3] p-3"
            >
              {/* Third level: lead-time disclosure and its independent on/off switch. */}
              <div className="overflow-hidden rounded-2xl border border-[#E6EAF0] bg-white">
                <div className="flex items-center gap-2 px-3.5">
                  <button
                    type="button"
                    aria-expanded={leadTimeExpanded}
                    aria-controls="personal-reminder-lead-options"
                    onClick={() => setLeadTimeExpanded((current) => !current)}
                    className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-black text-[#1F2937]">提前提醒</span>
                      <span className="mt-0.5 block text-[11px] font-medium leading-4 text-[#7B7B74]">提前 {formatReminderLeadLabel(lead.minutes, lead.seconds)}</span>
                    </span>
                    <ChevronDown aria-hidden="true" className={"h-4 w-4 shrink-0 text-[#6D55A3] transition-transform " + (leadTimeExpanded ? "rotate-180" : "")} />
                  </button>
                  <PreferenceSwitch
                    label="提前提醒"
                    checked={settings.reminderPre5Enabled}
                    onToggle={() => onChange({ reminderPre5Enabled: !settings.reminderPre5Enabled })}
                  />
                </div>
                <div id="personal-reminder-lead-options" hidden={!leadTimeExpanded}>
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
              aria-expanded={openReminderSection === "content"}
              aria-controls="personal-reminder-content-options"
              onClick={() => setOpenReminderSection((current) => current === "content" ? null : "content")}
              className="flex min-h-14 w-full items-center justify-between gap-3 p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D55A3] focus-visible:ring-offset-2"
            >
              <span className="text-sm font-black text-[#1F2937]">提醒內容</span>
              <span className="ml-auto text-xs font-bold text-[#7B7B74]">{selectedDetail.label}</span>
              <ChevronDown aria-hidden="true" className={"h-4 w-4 shrink-0 text-[#6D55A3] transition-transform " + (openReminderSection === "content" ? "rotate-180" : "")} />
            </button>
            <div
              id="personal-reminder-content-options"
              hidden={openReminderSection !== "content"}
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
