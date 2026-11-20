"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ImagePlus,
  Loader2,
  Pencil,
  Save,
  Sparkles,
  UserRound,
} from "lucide-react";
import { AvatarEditor } from "@/components/profile/AvatarEditor";
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

type AvatarView = "summary" | "choose" | "manual-base" | "manual-edit" | "photo";

const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;

export function AvatarSettingsCard({
  accessToken,
  displayName,
}: {
  accessToken: string;
  displayName?: string | null;
}) {
  const [avatar, setAvatar] = useState<AvatarConfig>(getDefaultAvatarConfig());
  const [savedAvatar, setSavedAvatar] = useState<AvatarConfig>(getDefaultAvatarConfig());
  const [view, setView] = useState<AvatarView>("summary");
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoName, setPhotoName] = useState("");

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

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const personalized = useMemo(() => isAvatarPersonalized(savedAvatar), [savedAvatar]);

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
    if (saving || savedAvatar.displayMode === mode) return;
    void save({ ...savedAvatar, displayMode: mode });
  };

  const cancelEdit = () => {
    setAvatar(savedAvatar);
    setView("summary");
    setMessage("");
    setMessageIsError(false);
  };

  const chooseManualBase = (style: Extract<AvatarStyle, "masculine" | "feminine">) => {
    setAvatar(getDefaultAvatarConfig(style));
    setView("manual-edit");
    setMessage("");
    setMessageIsError(false);
  };

  const handlePhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage("");
    setMessageIsError(false);

    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      setMessageIsError(true);
      setMessage("照片格式請使用 JPG、PNG 或 WebP。");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_PHOTO_SIZE) {
      setMessageIsError(true);
      setMessage("照片檔案請小於 8 MB。");
      event.target.value = "";
      return;
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoName(file.name);
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
    <div className="rounded-[24px] border border-[#E6EAF0] bg-white p-4 shadow-lg shadow-[#6D55A3]/5 sm:p-5">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="avatar-settings-panel"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center gap-3 rounded-2xl text-left"
      >
        <SystemAvatar config={savedAvatar} displayName={displayName} size={52} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-[#1F2937]">我的大頭貼</span>
          <span className="mt-1 block truncate text-xs font-medium text-[#7B7B74]">
            {AVATAR_DISPLAY_LABELS[savedAvatar.displayMode]}
          </span>
        </span>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-[#6D55A3]" /> : (
          <ChevronDown className={`h-5 w-5 shrink-0 text-[#6D55A3] transition-transform ${expanded ? "rotate-180" : ""}`} />
        )}
      </button>
      {expanded && (
      <div id="avatar-settings-panel" className="mt-4 border-t border-[#E6EAF0] pt-4">
      {view === "summary" && (
        <>
          <div className="flex items-center gap-4 rounded-[24px] bg-gradient-to-br from-[#FFF9F3] to-[#F3EEFF] p-4">
            <div className="shrink-0 rounded-full bg-white p-1 shadow-md shadow-[#6D55A3]/10">
              <SystemAvatar config={savedAvatar} displayName={displayName} size={88} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black text-[#1F2937]">我的大頭貼</h3>
              <p className="mt-1 text-xs font-medium leading-5 text-[#7B7B74]">
                顯示在訊息與通話畫面，可隨時修改，不作為身分驗證依據。
              </p>
            </div>
          </div>

          <fieldset className="mt-4 space-y-2">
            <legend className="mb-2 text-sm font-black text-[#1F2937]">大頭貼顯示方式</legend>
            {(["custom", "default", "name"] as const).map((mode) => (
              <label key={mode} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[#E6EAF0] px-3 py-2 text-sm font-medium text-[#1F2937]">
                <input
                  type="radio"
                  name="avatar-display-mode"
                  checked={savedAvatar.displayMode === mode}
                  disabled={saving}
                  onChange={() => changeDisplayMode(mode)}
                  className="h-4 w-4 accent-[#6D55A3]"
                />
                {AVATAR_DISPLAY_LABELS[mode]}
              </label>
            ))}
          </fieldset>

          <button
            type="button"
            onClick={() => {
              setMessage("");
              setMessageIsError(false);
              setView(personalized ? "manual-edit" : "choose");
            }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-4 py-3.5 text-sm font-black text-white"
          >
            <Pencil className="h-4 w-4" />
            {personalized ? "修改大頭貼" : "建立我的大頭貼"}
          </button>

          {personalized && (
            <button
              type="button"
              onClick={() => {
                setMessage("");
                setMessageIsError(false);
                setView("choose");
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-[#6D55A3]/20 bg-[#F8F5FF] px-4 py-3 text-sm font-black text-[#6D55A3]"
            >
              <Sparkles className="h-4 w-4" />
              重新建立
            </button>
          )}
        </>
      )}

      {view === "choose" && (
        <>
          <button
            type="button"
            onClick={() => setView("summary")}
            className="mb-4 flex items-center gap-1 text-sm font-black text-[#6D55A3]"
          >
            <ChevronLeft className="h-4 w-4" />
            返回
          </button>
          <h3 className="text-lg font-black text-[#1F2937]">選擇建立方式</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-[#7B7B74]">
            上傳照片不是必要條件，也不影響任何系統功能。
          </p>

          <div className="mt-5 grid gap-3">
            <button
              type="button"
              onClick={() => setView("photo")}
              className="rounded-[22px] border border-[#E6EAF0] bg-white p-4 text-left transition hover:border-[#6D55A3]/30"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-[#F3EEFF] p-3 text-[#6D55A3]">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-black text-[#1F2937]">使用照片建立</div>
                  <div className="mt-1 text-xs font-medium leading-5 text-[#7B7B74]">
                    上傳照片 → 產生 3 張候選 → 三選一 → 繼續微調特徵。
                  </div>
                  <div className="mt-2 inline-flex rounded-full bg-[#FFF4D8] px-2.5 py-1 text-[11px] font-black text-[#8A6416]">
                    影像生成服務尚未啟用
                  </div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setView("manual-base")}
              className="rounded-[22px] border border-[#6D55A3]/20 bg-[#F8F5FF] p-4 text-left transition hover:border-[#6D55A3]/40"
            >
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-white p-3 text-[#6D55A3]">
                  <UserRound className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-black text-[#1F2937]">不用照片建立</div>
                  <div className="mt-1 text-xs font-medium leading-5 text-[#7B7B74]">
                    選男生或女生，再調整眼鏡、背景與陪伴動物；其他 3D 特徵逐步開放。
                  </div>
                </div>
              </div>
            </button>
          </div>
        </>
      )}

      {view === "manual-base" && (
        <>
          <button
            type="button"
            onClick={() => setView("choose")}
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

          <AvatarEditor value={avatar} onChange={setAvatar} />

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

      {view === "photo" && (
        <>
          <button
            type="button"
            onClick={() => setView("choose")}
            className="mb-4 flex items-center gap-1 text-sm font-black text-[#6D55A3]"
          >
            <ChevronLeft className="h-4 w-4" />
            返回
          </button>
          <h3 className="text-lg font-black text-[#1F2937]">使用照片建立</h3>
          <p className="mt-1 text-xs font-medium leading-5 text-[#7B7B74]">
            預定流程：上傳 1 張照片 → 產生 3 張 3D 候選 → 三選一 → 再微調。
          </p>

          <label className="mt-5 flex min-h-48 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[24px] border border-dashed border-[#6D55A3]/30 bg-[#F8F5FF] p-4 text-center">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element -- Local object URL preview only; file is not uploaded.
              <img
                src={photoPreview}
                alt="待建立大頭貼的本機照片預覽"
                className="h-44 w-44 rounded-[22px] object-cover shadow-md"
              />
            ) : (
              <>
                <div className="rounded-2xl bg-white p-3 text-[#6D55A3] shadow-sm">
                  <ImagePlus className="h-6 w-6" />
                </div>
                <div className="mt-3 text-sm font-black text-[#1F2937]">選擇照片</div>
                <div className="mt-1 text-xs font-medium text-[#7B7B74]">JPG、PNG、WebP，最大 8 MB</div>
              </>
            )}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handlePhoto}
              className="sr-only"
            />
          </label>

          {photoName && (
            <p className="mt-2 truncate text-center text-xs font-medium text-[#7B7B74]">{photoName}</p>
          )}

          <div className="mt-4 rounded-2xl border border-[#E8D9A2] bg-[#FFF9E8] p-4">
            <div className="text-xs font-black text-[#7A5A11]">照片目前不會上傳伺服器</div>
            <p className="mt-1 text-xs font-medium leading-5 text-[#7B6A45]">
              真正的 3 張 AI 候選需要影像生成服務。為避免未經確認產生費用，目前只提供本機照片預覽，尚未啟用生成按鈕。
            </p>
          </div>

          <button
            type="button"
            disabled
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#D7D0E4] px-4 py-3.5 text-sm font-black text-white"
          >
            <Sparkles className="h-4 w-4" />
            產生 3 張候選
          </button>

          <button
            type="button"
            onClick={() => setView("manual-base")}
            className="mt-3 w-full rounded-2xl border border-[#6D55A3]/20 bg-white px-4 py-3 text-sm font-black text-[#6D55A3]"
          >
            改用不用照片建立
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
  );
}
