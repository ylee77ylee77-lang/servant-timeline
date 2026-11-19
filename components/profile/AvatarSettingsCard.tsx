"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { AvatarEditor } from "@/components/profile/AvatarEditor";
import { getDefaultAvatarConfig, normalizeAvatarConfig, type AvatarConfig } from "@/lib/profile/avatar";

export function AvatarSettingsCard({ accessToken }: { accessToken: string }) {
  const [avatar, setAvatar] = useState<AvatarConfig>(getDefaultAvatarConfig());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    void fetch("/api/profile/avatar", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "無法讀取頭像設定。");
        if (alive) setAvatar(normalizeAvatarConfig(data?.avatarConfig));
      })
      .catch((error) => {
        if (alive) setMessage(error instanceof Error ? error.message : "無法讀取頭像設定。");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [accessToken]);

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile/avatar", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ avatarConfig: avatar }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "儲存頭像失敗。");
      setAvatar(normalizeAvatarConfig(data.avatarConfig));
      setMessage("大頭圖已儲存。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存頭像失敗。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-[24px] border border-[#E6EAF0] bg-white p-6 shadow-lg shadow-[#6D55A3]/5">
      <div className="mb-5">
        <h3 className="text-base font-black text-[#1F2937]">系統大頭圖</h3>
        <p className="mt-1 text-xs font-medium leading-5 text-[#7B7B74]">
          大頭圖會顯示在訊息與通話畫面，可隨時修改，不作為身分驗證依據。
        </p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8 text-[#6D55A3]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <AvatarEditor value={avatar} onChange={setAvatar} />
      )}
      {message && <p className="mt-4 text-xs font-bold text-[#008A7A]">{message}</p>}
      <button
        type="button"
        onClick={() => void save()}
        disabled={loading || saving}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-4 py-3 text-sm font-black text-white disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? "儲存中" : "儲存大頭圖"}
      </button>
    </div>
  );
}
