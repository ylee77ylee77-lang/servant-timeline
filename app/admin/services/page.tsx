"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { SERVICE_TYPES } from "@/lib/services/catalog";

type ServiceRow = {
  id: string;
  service_date: string;
  service_type: string;
  starts_at: string;
  report_at: string | null;
  location: string | null;
  status: string;
};

function taipeiDateToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function ServiceAdminPage() {
  const { session, isAdmin, isCoordinator } = useAuth();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [serviceDate, setServiceDate] = useState(taipeiDateToday);
  const [serviceType, setServiceType] = useState<(typeof SERVICE_TYPES)[number]>("主一堂");
  const [reportAt, setReportAt] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [location, setLocation] = useState("夏凱納靈糧堂");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("published");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${session.access_token}` }), [session.access_token]);

  const loadServices = useCallback(async () => {
    if (!isCoordinator) return;
    const response = await fetch("/api/admin/services", { headers, cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (response.ok) setServices(Array.isArray(result.services) ? result.services : []);
  }, [headers, isCoordinator]);

  useEffect(() => {
    if (!isCoordinator) return;
    void loadServices();
  }, [isCoordinator, loadServices]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/services", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ serviceDate, serviceType, reportAt, startsAt, location, notes, status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "無法建立場次。");
      setMessage(`已${status === "draft" ? "建立草稿" : "開放"} ${serviceDate} ${serviceType}，建立 ${result.stationCount} 個崗位。`);
      await loadServices();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法建立場次。");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isCoordinator) {
    return <main className="min-h-screen bg-[#FFF9F3] p-8 text-center font-bold text-[#F25D6B]">你沒有場次管理權限。</main>;
  }

  const inputClass = "mt-2 w-full rounded-2xl border border-[#D9DEE7] bg-white px-4 py-3";

  return (
    <main className="min-h-screen bg-[#FFF9F3] px-5 py-12 text-[#1F2937]">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/" className="text-sm font-black text-[#6D55A3]">← 回主畫面</Link>
        {isAdmin ? <form onSubmit={submit} className="rounded-[28px] border border-[#E6EAF0] bg-white p-6 shadow-xl shadow-[#6D55A3]/10">
          <div className="mb-6 flex items-center gap-3">
            <CalendarPlus className="h-7 w-7 text-[#6D55A3]" />
            <div><h1 className="text-2xl font-black">建立崇拜場次</h1><p className="text-sm font-medium text-[#7B7B74]">可先存草稿，確認排程與排班後再開放報到。</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-black">日期<input type="date" required value={serviceDate} onChange={(event) => setServiceDate(event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-black">堂次<select value={serviceType} onChange={(event) => setServiceType(event.target.value as (typeof SERVICE_TYPES)[number])} className={inputClass}>{SERVICE_TYPES.map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="text-sm font-black">報到時間<input type="time" required value={reportAt} onChange={(event) => setReportAt(event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-black">崇拜開始<input type="time" required value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className={inputClass} /></label>
            <label className="text-sm font-black sm:col-span-2">建立狀態<select value={status} onChange={(event) => setStatus(event.target.value)} className={inputClass}><option value="draft">先存草稿</option><option value="published">建立並開放</option></select></label>
          </div>
          <label className="mt-4 block text-sm font-black">報到地點<input required value={location} maxLength={120} onChange={(event) => setLocation(event.target.value)} className={inputClass} /></label>
          <label className="mt-4 block text-sm font-black">場次備註<textarea rows={3} value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} className={inputClass} /></label>
          {message && <p role="status" className="mt-4 text-sm font-bold text-[#6D55A3]">{message}</p>}
          <button disabled={isLoading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-3.5 font-black text-white disabled:opacity-60">{isLoading && <Loader2 className="h-5 w-5 animate-spin" />}{isLoading ? "處理中" : status === "draft" ? "建立場次草稿" : "建立並開放場次"}</button>
        </form> : (
          <section className="rounded-[28px] border border-[#E6EAF0] bg-white p-6">
            <h1 className="text-xl font-black">帶領者／協調員場次</h1>
            <p className="mt-2 text-sm font-medium text-[#7B7B74]">你只能查看管理員授權的場次及協調資料；排程與排班由管理員維護。</p>
          </section>
        )}
        <section className="rounded-[28px] border border-[#E6EAF0] bg-white p-6">
          <h2 className="text-lg font-black">最近場次</h2>
          <div className="mt-4 space-y-2">{services.length ? services.map((service) => (
            <Link key={service.id} href={isAdmin ? `/admin/services/${service.id}/schedule` : `/admin/services/${service.id}`} className="block rounded-2xl bg-[#FFF9F3] px-4 py-3 text-sm font-bold hover:bg-[#F3EEFF]">
              {service.service_date}｜{service.service_type}｜{service.status}
              <span className="ml-2 text-[#6D55A3]">{isAdmin ? "編輯本堂排程 →" : "查看場次 →"}</span>
            </Link>
          )) : <p className="text-sm font-medium text-[#7B7B74]">尚未建立場次。</p>}</div>
        </section>
      </div>
    </main>
  );
}
