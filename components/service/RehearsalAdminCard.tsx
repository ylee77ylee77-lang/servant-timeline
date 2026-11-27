"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SERVICE_TYPES, type ServiceType } from "@/lib/services/catalog";
import type { RehearsalAdminAction, RehearsalAdminState } from "@/lib/services/rehearsal-admin-contract";

const primary = "w-full rounded-2xl bg-[#6D55A3] px-4 py-3 text-sm font-black text-white disabled:opacity-50";
const secondary = "min-h-11 rounded-xl border border-[#D9DEE7] bg-white px-3 py-2 text-sm font-bold disabled:opacity-50";

export default function RehearsalAdminCard({ token }: { token: string }) {
  const [state, setState] = useState<RehearsalAdminState | null>(null);
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState<ServiceType>("主一堂");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/rehearsal", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
      const data = await res.json();
      if (version !== requestVersion.current) return;
      if (!res.ok) throw new Error(data.error || "無法讀取演練狀態。");
      if (data.enabled !== true) { setState(null); return; }
      if (!Number.isSafeInteger(data.eligibleCount) || data.eligibleCount < 0
        || !Number.isSafeInteger(data.checkedInCount) || data.checkedInCount < 0) throw new Error("演練資料無效。");
      setState({ rehearsal: data.rehearsal ?? null, eligibleCount: data.eligibleCount, checkedInCount: data.checkedInCount });
    } catch (err) {
      if (version === requestVersion.current) setError(err instanceof Error ? err.message : "無法讀取演練狀態。");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    const onVisible = () => {
      if (document.visibilityState === "visible" && !busy.current) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      requestVersion.current += 1;
    };
  }, [refresh]);

  const run = async (action: RehearsalAdminAction) => {
    if (busy.current || loading || error) return;
    busy.current = true;
    setPending(true);
    try {
      const res = await fetch("/api/admin/rehearsal", {
        method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.ok !== true) throw new Error(data?.error || "尚未確認操作，請重新整理。");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "尚未確認操作，請重新整理。");
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  if (!state && !error) return null;
  const rehearsal = state?.rehearsal ?? null;
  const locked = loading || pending || Boolean(error);
  const visible = open || !!error;

  return (
    <section className="rounded-[28px] border border-[#E6EAF0] bg-white p-5">
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={visible}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
        <h2 className="text-lg font-black">服事演練</h2>
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className={rehearsal ? "text-[#6D55A3]" : "text-[#7B7B74]"}>{rehearsal ? "演練中" : "未開啟"}</span>
          <span aria-hidden>{visible ? "−" : "＋"}</span>
        </span>
      </button>
      {visible && <div className="mt-3 space-y-4 border-t border-[#E6EAF0] pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-[#7B7B74]">{rehearsal ? rehearsal.serviceType + "｜已開始" : "由管理員開始及結束。"}</p>
          <button type="button" className={secondary} disabled={loading || pending} onClick={() => void refresh()}>{loading ? "更新中" : "重新整理"}</button>
        </div>
        {error && <p role="alert" className="rounded-xl bg-[#FFF9F3] p-3 text-sm font-bold text-[#1F2937]">{error}</p>}
        {state && <>
          {!rehearsal ? <label className="block text-sm font-black">演練範本
            <select className="mt-2 w-full rounded-2xl border border-[#D9DEE7] bg-white px-4 py-3" value={serviceType}
              disabled={locked} onChange={event => setServiceType(event.target.value as ServiceType)}>
              {SERVICE_TYPES.map(value => <option key={value}>{value}</option>)}
            </select>
          </label> : <>
            <p className="text-sm font-bold">開始時間：{new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(rehearsal.startedAt))}</p>
            <div className="flex items-center justify-between gap-2 text-sm font-bold">
              <span>可參與 {state.eligibleCount} 人</span><span>已報到 {state.checkedInCount} 人</span>
            </div>
          </>}
          {!rehearsal && <p className="text-sm font-medium text-[#7B7B74]">所有已啟用的總招及管理員皆可參與。</p>}
          {rehearsal ? <button type="button" className="w-full rounded-2xl border border-[#F25D6B] bg-white px-4 py-3 text-sm font-black text-[#1F2937] disabled:opacity-50"
              disabled={locked} onClick={() => { if (window.confirm("確定結束這場演練？")) void run({ action: "end", rehearsalId: rehearsal.id }); }}>
              {pending ? "處理中" : "結束演練"}
            </button>
            : <button type="button" className={primary} disabled={locked}
              onClick={() => void run({ action: "start", serviceType })}>{pending ? "處理中" : "開始演練"}</button>}
        </>}
      </div>}
    </section>
  );
}
