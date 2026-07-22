"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2, Save } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

type Task = {
  id: string;
  scope: "template" | "service";
  time: string | null;
  title: string | null;
  assignee: string | null;
  location: string | null;
  details: string | null;
  sort_order: number;
};

type ScheduleData = {
  service: { service_date: string; service_type: string };
  tasks: Task[];
  canEdit: boolean;
};

export default function ServiceSchedulePage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const { session, isCoordinator } = useAuth();
  const [data, setData] = useState<ScheduleData | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const headers = useMemo(
    () => ({ Authorization: `Bearer ${session.access_token}` }),
    [session.access_token]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/services/${serviceId}/schedule`, {
        headers,
        cache: "no-store",
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "無法載入場次。");
      setData(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法載入場次。");
    } finally {
      setLoading(false);
    }
  }, [headers, serviceId]);

  useEffect(() => {
    if (isCoordinator) void load();
  }, [isCoordinator, load]);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/services/${serviceId}/schedule`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(editing),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "儲存失敗。");
      setEditing(null);
      await load();
      setMessage(result.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "儲存失敗。");
    } finally {
      setSaving(false);
    }
  };

  if (!isCoordinator) {
    return <main className="min-h-screen bg-[#FFF9F3] p-8 text-center font-bold text-[#F25D6B]">你沒有場次查看權限。</main>;
  }

  return (
    <main className="min-h-screen bg-[#FFF9F3] px-4 py-8 text-[#1F2937]">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link href={`/admin/services/${serviceId}`} className="text-sm font-black text-[#6D55A3]">← 回場次團隊</Link>
        {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#6D55A3]" /> : data && (
          <>
            <header className="rounded-[28px] bg-white p-6 shadow-lg shadow-[#6D55A3]/10">
              <p className="text-xs font-black tracking-widest text-[#00A6A6]">{data.canEdit ? "管理員排程" : "協調員唯讀"}</p>
              <h1 className="mt-2 text-2xl font-black">{data.service.service_date}｜{data.service.service_type}</h1>
              <p className="mt-2 text-sm font-medium text-[#7B7B74]">預設只儲存本堂；共用範本與其他場次不會改變。</p>
            </header>
            {message && <p role="status" className="rounded-2xl border bg-white px-4 py-3 text-sm font-bold text-[#6D55A3]">{message}</p>}
            <section className="space-y-3">
              {data.tasks.map((task) => (
                <article key={task.id} className="rounded-[24px] border border-[#E6EAF0] bg-white p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black text-[#00A6A6]">{task.scope === "template" ? "沿用標準範本" : "本堂專屬"}</p>
                      <h2 className="mt-1 text-lg font-black">{task.time ?? "--:--"}｜{task.title ?? "未命名任務"}</h2>
                      <p className="mt-1 text-sm text-[#7B7B74]">{task.assignee || "未指定角色"}｜{task.location || "未指定地點"}</p>
                    </div>
                    {data.canEdit && <button onClick={() => setEditing({ ...task })} className="rounded-xl bg-[#F3EEFF] px-4 py-2 text-sm font-black text-[#6D55A3]">修改</button>}
                  </div>
                </article>
              ))}
            </section>
          </>
        )}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center">
          <div className="w-full rounded-t-[28px] bg-white p-5 sm:max-w-xl sm:rounded-[28px]">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">修改本堂任務</h2>
              <button onClick={() => setEditing(null)} className="text-sm font-bold text-[#7B7B74]">取消</button>
            </div>
            <p className="mt-2 rounded-2xl bg-[#E8F8F5] px-4 py-3 text-sm font-bold text-[#087F78]">{editing.scope === "template" ? "第一次儲存會建立本堂副本。" : "這是本堂專屬任務。"}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-black">時間<input type="time" value={editing.time ?? ""} onChange={(event) => setEditing({ ...editing, time: event.target.value })} className="mt-1 w-full rounded-2xl border px-4 py-3" /></label>
              <label className="text-sm font-black">任務名稱<input value={editing.title ?? ""} onChange={(event) => setEditing({ ...editing, title: event.target.value })} className="mt-1 w-full rounded-2xl border px-4 py-3" /></label>
              <label className="text-sm font-black">角色<input value={editing.assignee ?? ""} onChange={(event) => setEditing({ ...editing, assignee: event.target.value })} className="mt-1 w-full rounded-2xl border px-4 py-3" /></label>
              <label className="text-sm font-black">地點<input value={editing.location ?? ""} onChange={(event) => setEditing({ ...editing, location: event.target.value })} className="mt-1 w-full rounded-2xl border px-4 py-3" /></label>
            </div>
            <label className="mt-3 block text-sm font-black">提醒內容<textarea value={editing.details ?? ""} onChange={(event) => setEditing({ ...editing, details: event.target.value })} rows={4} className="mt-1 w-full rounded-2xl border px-4 py-3" /></label>
            <button disabled={saving} onClick={() => void save()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-4 font-black text-white disabled:opacity-60">
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              {saving ? "儲存中" : "儲存本堂修改"}
            </button>
            <p className="mt-3 flex items-center justify-center gap-2 text-xs font-bold text-[#7B7B74]"><CheckCircle2 className="h-4 w-4" />不影響其他日期與範本</p>
          </div>
        </div>
      )}
    </main>
  );
}
