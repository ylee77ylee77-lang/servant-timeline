"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronLeft,
  Loader2,
  Pencil,
  Save,
  Sparkles,
} from "lucide-react";
import { AvatarEditor } from "@/components/profile/AvatarEditor";
import { AvatarDisplayModeSelector, AvatarLivePreview } from "@/components/profile/AvatarControls";
import { AvatarIconPicker } from "@/components/profile/AvatarIconPicker";
import { SystemAvatar } from "@/components/profile/SystemAvatar";
import {
  AVATAR_DEFAULTS,
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
  previewHost,
}: {
  accessToken: string;
  displayName?: string | null;
  /** Mount the live preview in the page's actual scrolling region. */
  previewHost?: HTMLDivElement | null;
}) {
  const [avatar, setAvatar] = useState<AvatarConfig>(getDefaultAvatarConfig());
  const [savedAvatar, setSavedAvatar] = useState<AvatarConfig>(getDefaultAvatarConfig());
  const [view, setView] = useState<AvatarView>("summary");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetch("/api/profile/avatar", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "無法讀取頭像設定。");
        if (alive) {
          const next = normalizeAvatarConfig(data?.avatarConfig);
          setAvatar(next);
          setSavedAvatar(next);
        }
      })
      .catch((error) => {
        if (alive) {
          setMessageIsError(true);
          setMessage(error instanceof Error ? error.message : "無法讀取頭像設定。");
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [accessToken]);

  const personalized = useMemo(() => isAvatarPersonalized(savedAvatar), [savedAvatar]);
  // One local draft powers instant preview. Network writes occur only when
  // the volunteer explicitly saves, never on each icon or color tap.
  const visibleAvatar = avatar;
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


  if (loading) {
    return (
      <div className="rounded-[24px] border border-[#E6EAF0] bg-white p-6 shadow-lg shadow-[#6D55A3]/5">
        <div className="flex items-center justify-center py-10 text-[#6D55A3]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <>
      {expanded && previewHost && createPortal(
        <AvatarLivePreview
          config={view === "manual-edit" ? { ...avatar, displayMode: "custom" } : visibleAvatar}
          displayName={displayName}
          sticky={false}
        />,
        previewHost
      )}
      <div className="rounded-[24px] border border-[#E6EAF0] bg-white p-4 shadow-lg shadow-[#6D55A3]/5 sm:p-5">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="avatar-settings-panel"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center gap-3 rounded-2xl text-left"
      >
        <SystemAvatar config={visibleAvatar} displayName={displayName} size={52} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-[#1F2937]">我的大頭貼</span>
          <span className="mt-1 block truncate text-xs font-medium text-[#7B7B74]">
            {displayDirty ? "尚未儲存・" : ""}{AVATAR_DISPLAY_LABELS[visibleAvatar.displayMode]}
          </span>
        </span>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-[#6D55A3]" /> : (
          <ChevronDown className={`h-5 w-5 shrink-0 text-[#6D55A3] transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>
      {expanded && (
      <div id="avatar-settings-panel" className="mt-4 border-t border-[#E6EAF0] pt-4">
      {!previewHost && (
        <AvatarLivePreview
          config={view === "manual-edit" ? { ...avatar, displayMode: "custom" } : visibleAvatar}
          displayName={displayName}
        />
      )}
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
          <h3 className="text-lg font-black text-[#1F2937]">選擇基礎角色</h3>
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
                className="flex flex-col items-center rounded-[22px] border border-[#E6EAF0] bg-white p-4 text-center transition hover:border-[#6D55A3]/40 hover:bg-[#F8F5FF]"
              >
                <SystemAvatar config={AVATAR_DEFAULTS[style]} size={92} />
                <div className="mt-3 text-sm font-black text-[#1F2937]">{label}</div>
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
              <p className="mt-1 text-xs font-medium leading-5 text-[#7B7B74]">
                陪伴動物選填：綿羊、母鹿、獅子、老鷹。
              </p>
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
      </div>
      )}
      </div>
    </>
  );
}
