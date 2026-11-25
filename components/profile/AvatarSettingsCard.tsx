"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  Loader2,
  Pencil,
  Save,
  Sparkles,
} from "lucide-react";
import { AvatarEditor } from "@/components/profile/AvatarEditor";
import { AvatarDisplayModeSelector } from "@/components/profile/AvatarControls";
import { AvatarIconPicker } from "@/components/profile/AvatarIconPicker";
import { SystemAvatar } from "@/components/profile/SystemAvatar";
import { SettingsAccordionCard } from "@/components/profile/SettingsAccordionCard";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  getDefaultAvatarConfig,
  isAvatarPersonalized,
  normalizeAvatarConfig,
  AVATAR_DISPLAY_LABELS,
  type AvatarDisplayMode,
  type AvatarConfig,
  type AvatarStyle,
} from "@/lib/profile/avatar";

type AvatarView = "summary" | "manual-base" | "manual-edit";

export function AvatarSettingsCard({
  accessToken,
  displayName,
  expanded,
  onToggle,
}: {
  accessToken: string;
  displayName?: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { avatarConfig: initialAvatar, updateAvatarConfig } = useAuth();
  // The authenticated profile already contains the saved avatar. Reuse it
  // immediately instead of blocking the settings card on another API request.
  const [avatar, setAvatar] = useState<AvatarConfig>(() => initialAvatar);
  const [savedAvatar, setSavedAvatar] = useState<AvatarConfig>(() => initialAvatar);
  const [view, setView] = useState<AvatarView>("summary");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  const personalized = useMemo(() => isAvatarPersonalized(savedAvatar), [savedAvatar]);
  // One local draft powers instant preview. Network writes occur only when
  // the volunteer explicitly saves, never on each icon or color tap.
  const visibleAvatar = avatar;
  const headingAvatar = view === "manual-edit" ? { ...avatar, displayMode: "custom" as const } : visibleAvatar;
  const displayDirty = (
    avatar.displayMode !== savedAvatar.displayMode
    || avatar.iconType !== savedAvatar.iconType
    || avatar.iconTone !== savedAvatar.iconTone
  );

  const save = async (nextConfig: AvatarConfig = avatar) => {
    setSaving(true);
    setMessage("");
    setMessageIsError(false);
    try {
      const response = await fetch("/api/profile/avatar", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ avatarConfig: nextConfig }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "儲存大頭貼失敗。");
      const next = normalizeAvatarConfig(data.avatarConfig);
      setAvatar(next);
      setSavedAvatar(next);
      updateAvatarConfig(next);
      setView("summary");
      setMessage("大頭貼已儲存，之後可隨時再修改。");
    } catch (error) {
      setMessageIsError(true);
      setMessage(error instanceof Error ? error.message : "儲存大頭貼失敗。");
    } finally {
      setSaving(false);
    }
  };

  const changeDisplayMode = (mode: AvatarDisplayMode) => {
    if (saving) return;
    setAvatar((current) => ({ ...current, displayMode: mode }));
    setMessage("");
    setMessageIsError(false);
  };

  const changeSystemIcon = (next: AvatarConfig) => {
    if (saving) return;
    setAvatar(next);
    setMessage("");
    setMessageIsError(false);
  };

  const discardDisplayChanges = () => {
    setAvatar(savedAvatar);
    setMessage("");
    setMessageIsError(false);
  };

  const cancelEdit = () => {
    setAvatar(savedAvatar);
    setView("summary");
    setMessage("");
    setMessageIsError(false);
  };

  const chooseManualBase = (style: Extract<AvatarStyle, "masculine" | "feminine">) => {
    setAvatar((current) => ({
      ...getDefaultAvatarConfig(style),
      // System icon preferences are independent of the 3D portrait.
      iconType: current.iconType,
      iconTone: current.iconTone,
    }));
    setView("manual-edit");
    setMessage("");
    setMessageIsError(false);
  };


  return (
    <SettingsAccordionCard
      panelId="avatar-settings-panel"
      title="大頭貼"
      summary={`${displayDirty ? "尚未儲存・" : ""}${AVATAR_DISPLAY_LABELS[headingAvatar.displayMode]}`}
      icon={<SystemAvatar config={headingAvatar} displayName={displayName} size={expanded ? 80 : 52} />}
      expanded={expanded}
      onToggle={onToggle}
      stickyHeader
    >
      {view === "summary" && (
        <>
          <AvatarDisplayModeSelector
            value={visibleAvatar.displayMode}
            onChange={changeDisplayMode}
            disabled={saving}
          />

          {visibleAvatar.displayMode === "default" && (
            <AvatarIconPicker
              value={visibleAvatar}
              onChange={changeSystemIcon}
              disabled={saving}
            />
          )}

          {displayDirty && (
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void save(avatar)}
                disabled={saving}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-4 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "儲存中" : "儲存顯示設定"}
              </button>
              <button
                type="button"
                onClick={discardDisplayChanges}
                disabled={saving}
                className="min-h-10 w-full rounded-xl border border-[#E6EAF0] px-4 text-sm font-bold text-[#6D55A3] disabled:opacity-50"
              >
                取消變更
              </button>
            </div>
          )}

          <button
            type="button"
            disabled={saving || displayDirty}
            title={displayDirty ? "請先儲存或取消顯示設定" : undefined}
            onClick={() => {
              setMessage("");
              setMessageIsError(false);
              setView(personalized ? "manual-edit" : "manual-base");
            }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-4 py-3.5 text-sm font-black text-white disabled:opacity-50"
          >
            <Pencil className="h-4 w-4" />
            {personalized ? "修改大頭貼" : "建立我的大頭貼"}
          </button>

          {personalized && (
            <button
              type="button"
              disabled={saving || displayDirty}
              title={displayDirty ? "請先儲存或取消顯示設定" : undefined}
              onClick={() => {
                setMessage("");
                setMessageIsError(false);
                setView("manual-base");
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#6D55A3]/20 bg-[#F8F5FF] px-4 py-3 text-sm font-black text-[#6D55A3] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              重新建立
            </button>
          )}
        </>
      )}

      {view === "manual-base" && (
        <>
          <button
            type="button"
            onClick={() => setView("summary")}
            className="mb-4 flex items-center gap-1 text-sm font-black text-[#6D55A3]"
          >
            <ChevronLeft className="h-4 w-4" />
            返回
          </button>
          <h3 className="text-lg font-black text-[#1F2937]">選擇角色</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-[#7B7B74]">
            這只是起始模板，後面所有特徵都還能再修改。
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {([
              ["masculine", "男生"],
              ["feminine", "女生"],
            ] as const).map(([style, label]) => (
              <button
                key={style}
                type="button"
                onClick={() => chooseManualBase(style)}
                className="min-h-11 rounded-xl border border-[#E6EAF0] bg-white px-3 py-2 text-center text-sm font-bold text-[#1F2937] transition hover:border-[#6D55A3]/40 hover:bg-[#F8F5FF]"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}

      {view === "manual-edit" && (
        <>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black text-[#1F2937]">特徵微調</h3>
            </div>
            <button
              type="button"
              onClick={cancelEdit}
              className="shrink-0 text-xs font-black text-[#6D55A3]"
            >
              取消
            </button>
          </div>

          <AvatarEditor value={avatar} onChange={setAvatar} showPreview={false} />

          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-4 py-3.5 text-sm font-black text-white disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "儲存中" : "儲存大頭貼"}
          </button>
        </>
      )}

      {message && (
        <p
          role="status"
          className={`mt-4 text-xs font-bold leading-5 ${messageIsError ? "text-[#D73A49]" : "text-[#008A7A]"}`}
        >
          {message}
        </p>
      )}
    </SettingsAccordionCard>
  );
}
