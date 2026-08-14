"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  ListChecks,
  MapPin,
  RefreshCw,
  ShieldCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import type {
  LiveAssignmentValidation,
  LiveCoordinationScope,
  LiveServiceSummary,
  LiveVolunteerStatus,
} from "@/lib/services/live-service-status";

type ServiceOption = {
  id: string;
  service_date: string;
  service_type: string;
  starts_at: string;
  report_at: string | null;
  location: string | null;
  status: string;
};

type LiveStatusResponse = {
  services: ServiceOption[];
  service: ServiceOption | null;
  scope: LiveCoordinationScope | null;
  summary: LiveServiceSummary | null;
  volunteers: LiveVolunteerStatus[];
  validation: LiveAssignmentValidation | null;
  error?: string;
};

type Props = {
  accessToken: string;
};

const EMPTY_RESPONSE: LiveStatusResponse = {
  services: [],
  service: null,
  scope: null,
  summary: null,
  volunteers: [],
  validation: null,
};

const SERVICE_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  published: "進行中",
  completed: "已完成",
  cancelled: "已取消",
};

function formatServiceDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T12:00:00+08:00`));
}

function formatRefreshTime(value: Date | null) {
  if (!value) return "尚未更新";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(value);
}

export function LiveServiceStatusDashboard({ accessToken }: Props) {
  const [data, setData] = useState<LiveStatusResponse>(EMPTY_RESPONSE);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [lastRefreshAt, setLastRefreshAt] = useState<Date | null>(null);
  const requestNumberRef = useRef(0);
  const selectedServiceIdRef = useRef("");

  const refresh = useCallback(async (serviceId?: string, initial = false) => {
    const resolvedServiceId = serviceId ?? selectedServiceIdRef.current;
    const requestNumber = requestNumberRef.current + 1;
    requestNumberRef.current = requestNumber;
    if (initial) setIsLoading(true);
    else setIsRefreshing(true);
    setErrorMessage("");

    try {
      const query = resolvedServiceId ? `?serviceId=${encodeURIComponent(resolvedServiceId)}` : "";
      const result = await fetch(`/api/live-service-status${query}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const payload = await result.json().catch(() => ({})) as LiveStatusResponse;
      if (!result.ok) throw new Error(payload.error || "目前無法更新現場狀態。");
      if (requestNumberRef.current !== requestNumber) return;
      setData(payload);
      const nextServiceId = payload.service?.id ?? "";
      selectedServiceIdRef.current = nextServiceId;
      setSelectedServiceId(nextServiceId);
      setLastRefreshAt(new Date());
    } catch (error) {
      if (requestNumberRef.current !== requestNumber) return;
      setErrorMessage(error instanceof Error ? error.message : "目前無法更新現場狀態。");
    } finally {
      if (requestNumberRef.current === requestNumber) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [accessToken]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void refresh("", true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const handleOnline = () => void refresh();
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("online", handleOnline);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("online", handleOnline);
    };
  }, [refresh]);

  if (isLoading) {
    return (
      <main className="flex-1 overflow-y-auto bg-[#FFF9F3] px-5 pt-5 pb-28" aria-busy="true">
        <div className="h-8 w-40 animate-pulse rounded-xl bg-[#E6EAF0]" />
        <div className="mt-4 h-28 animate-pulse rounded-[24px] bg-white border border-[#E6EAF0]" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-24 animate-pulse rounded-[22px] bg-white border border-[#E6EAF0]" />
          ))}
        </div>
      </main>
    );
  }

  const urgentCount = data.summary
    ? data.summary.notCheckedIn + data.summary.unassigned + data.summary.stationUnconfirmed
    : 0;
  const validationCount = data.validation
    ? data.validation.missingStations.length
      + data.validation.duplicateStations.length
      + data.validation.invalidStations.length
    : 0;

  return (
    <main className="flex-1 overflow-y-auto bg-[#FFF9F3] px-5 pt-4 pb-28">
      <section className="rounded-[26px] border border-[#E6EAF0] bg-white p-4 shadow-lg shadow-[#6D55A3]/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black tracking-[0.14em] text-[#6D55A3]">即時協調</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#1F2937]">現場狀態</h2>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={isRefreshing}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-[#6D55A3]/20 bg-[#F3EEFF] text-[#6D55A3] disabled:opacity-60"
            aria-label="重新整理現場狀態"
          >
            <RefreshCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {data.services.length > 0 && (
          <label className="mt-4 block">
            <span className="text-[11px] font-black tracking-widest text-[#64645F]">查看場次</span>
            <select
              value={selectedServiceId}
              onChange={(event) => {
                const serviceId = event.target.value;
                selectedServiceIdRef.current = serviceId;
                setSelectedServiceId(serviceId);
                void refresh(serviceId);
              }}
              className="mt-2 min-h-11 w-full rounded-2xl border border-[#E6EAF0] bg-[#FAFAF8] px-4 text-sm font-black text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#6D55A3]/25"
            >
              {data.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.service_date}｜{service.service_type}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-[#64645F]">
          <span>最後更新：{formatRefreshTime(lastRefreshAt)}</span>
          {data.scope === "third_floor" && (
            <span className="rounded-full border border-[#6D55A3]/15 bg-[#F3EEFF] px-3 py-1.5 font-black text-[#6D55A3]">
              副總招｜僅三樓
            </span>
          )}
        </div>
      </section>

      {errorMessage && (
        <section className="mt-3 rounded-[22px] border border-[#F25D6B]/20 bg-[#FFF2F4] p-4" role="alert">
          <p className="text-sm font-black text-[#F25D6B]">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-3 min-h-11 rounded-2xl bg-white px-4 text-sm font-black text-[#6D55A3] border border-[#E6EAF0]"
          >
            再試一次
          </button>
        </section>
      )}

      {!data.service || !data.summary ? (
        <section className="mt-3 rounded-[24px] border border-[#E6EAF0] bg-white p-6 text-center">
          <Users className="mx-auto h-7 w-7 text-[#6D55A3]" />
          <h3 className="mt-3 text-lg font-black text-[#1F2937]">目前沒有可查看的場次</h3>
        </section>
      ) : (
        <>
          <section className="mt-3 rounded-[24px] bg-gradient-to-r from-[#6D55A3] to-[#8068B4] p-5 text-white shadow-lg shadow-[#6D55A3]/15">
            <p className="text-sm font-bold text-white/80">{formatServiceDate(data.service.service_date)}</p>
            <div className="mt-1 flex items-end justify-between gap-3">
              <h3 className="text-[28px] font-black tracking-tight">{data.service.service_type}</h3>
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black">
                {SERVICE_STATUS_LABELS[data.service.status] ?? "場次"}
              </span>
            </div>
          </section>

          <section className="mt-3 grid grid-cols-2 gap-3" aria-label="場次摘要">
            <SummaryCard icon={Users} label="排班同工" value={data.summary.totalAssigned} tone="purple" />
            <SummaryCard icon={CheckCircle2} label="已報到" value={data.summary.checkedIn} tone="teal" />
            <SummaryCard icon={MapPin} label="崗位已確認" value={data.summary.stationConfirmed} tone="teal" />
            <SummaryCard icon={UserRoundX} label="尚未報到" value={data.summary.notCheckedIn} tone={data.summary.notCheckedIn ? "rose" : "neutral"} />
            <SummaryCard icon={MapPin} label="未分派崗位" value={data.summary.unassigned} tone={data.summary.unassigned ? "rose" : "neutral"} />
            <SummaryCard icon={Clock3} label="崗位待確認" value={data.summary.stationUnconfirmed} tone={data.summary.stationUnconfirmed ? "rose" : "neutral"} />
          </section>

          <section className="mt-3 rounded-[24px] border border-[#E6EAF0] bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-base font-black text-[#1F2937]">
                  <ListChecks className="h-5 w-5 text-[#6D55A3]" /> 任務完成進度
                </h3>
                <p className="mt-1 text-xs font-bold text-[#64645F]">
                  {data.summary.taskCompleted} / {data.summary.taskTotal} 個任務清單項目
                </p>
              </div>
              <span className="text-2xl font-black text-[#6D55A3]">{data.summary.taskPercent}%</span>
            </div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#EEF1F4]" aria-label={`任務完成 ${data.summary.taskPercent}%`}>
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#00B8B8] to-[#6D55A3] transition-[width]"
                style={{ width: `${data.summary.taskPercent}%` }}
              />
            </div>
          </section>

          <section className={`mt-3 rounded-[24px] border p-5 ${
            urgentCount + validationCount > 0
              ? "border-[#F25D6B]/20 bg-[#FFF2F4]"
              : "border-[#00B8B8]/20 bg-[#EFFFFD]"
          }`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-base font-black text-[#1F2937]">
                {urgentCount + validationCount > 0
                  ? <AlertCircle className="h-5 w-5 text-[#F25D6B]" />
                  : <ShieldCheck className="h-5 w-5 text-[#008C8C]" />}
                優先處理
              </h3>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${
                urgentCount + validationCount > 0 ? "bg-white text-[#F25D6B]" : "bg-white text-[#008C8C]"
              }`}>
                {urgentCount + validationCount > 0 ? `${urgentCount + validationCount} 項` : "目前穩定"}
              </span>
            </div>
            {data.validation && validationCount > 0 && (
              <div className="mt-3 space-y-2 text-sm font-bold text-[#1F2937]">
                {data.validation.missingStations.length > 0 && (
                  <ExceptionRow label="漏排崗位" values={data.validation.missingStations} />
                )}
                {data.validation.duplicateStations.length > 0 && (
                  <ExceptionRow
                    label="重複分派"
                    values={data.validation.duplicateStations.map((item) => `${item.station}（${item.count} 人）`)}
                  />
                )}
                {data.validation.invalidStations.length > 0 && (
                  <ExceptionRow label="不應存在" values={data.validation.invalidStations} />
                )}
              </div>
            )}
            {urgentCount + validationCount === 0 && (
              <p className="mt-2 text-sm font-bold text-[#008C8C]">報到、崗位與排班目前沒有明顯異常。</p>
            )}
          </section>

          <section className="mt-3">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <h3 className="text-lg font-black text-[#1F2937]">同工狀態</h3>
                <p className="mt-1 text-xs font-bold text-[#64645F]">需處理的同工會優先顯示</p>
              </div>
              <span className="text-xs font-black text-[#6D55A3]">共 {data.volunteers.length} 筆</span>
            </div>
            <div className="mt-3 space-y-3">
              {data.volunteers.map((volunteer) => (
                <VolunteerCard key={volunteer.assignmentId} volunteer={volunteer} />
              ))}
              {data.volunteers.length === 0 && (
                <div className="rounded-[22px] border border-[#E6EAF0] bg-white p-5 text-center text-sm font-bold text-[#64645F]">
                  此範圍目前沒有排班同工。
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  tone: "purple" | "teal" | "rose" | "neutral";
}) {
  const styles = {
    purple: "bg-[#F3EEFF] border-[#6D55A3]/15 text-[#6D55A3]",
    teal: "bg-[#EFFFFD] border-[#00B8B8]/20 text-[#008C8C]",
    rose: "bg-[#FFF2F4] border-[#F25D6B]/20 text-[#F25D6B]",
    neutral: "bg-white border-[#E6EAF0] text-[#64645F]",
  }[tone];
  return (
    <div className={`min-h-[92px] rounded-[22px] border p-4 shadow-sm ${styles}`}>
      <div className="flex items-center gap-2 text-[11px] font-black tracking-wider">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <p className="mt-2 text-3xl font-black text-[#1F2937]">{value}</p>
    </div>
  );
}

function ExceptionRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="rounded-2xl border border-[#F25D6B]/15 bg-white/80 p-3">
      <p className="text-xs font-black text-[#F25D6B]">{label}</p>
      <p className="mt-1 leading-6">{values.join("、")}</p>
    </div>
  );
}

function VolunteerCard({ volunteer }: { volunteer: LiveVolunteerStatus }) {
  const urgent = volunteer.urgency < 3;
  return (
    <article className={`rounded-[22px] border bg-white p-4 shadow-sm ${
      urgent ? "border-[#F25D6B]/25" : "border-[#E6EAF0]"
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-base font-black text-[#1F2937]">{volunteer.name}</h4>
          <p className="mt-1 text-xs font-bold text-[#64645F]">{volunteer.role}｜{volunteer.ministryGroup}</p>
        </div>
        {urgent && (
          <span className="shrink-0 rounded-full bg-[#FFF2F4] px-2.5 py-1 text-[10px] font-black text-[#F25D6B]">需處理</span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-2xl bg-[#FAFAF8] px-3 py-2.5 text-sm font-black text-[#1F2937]">
        <MapPin className="h-4 w-4 shrink-0 text-[#6D55A3]" />
        <span className="truncate">{volunteer.station}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <StateBadge ok={volunteer.checkInState === "checked_in"} okText="已報到" alertText="尚未報到" />
        <StateBadge
          ok={volunteer.stationState === "confirmed"}
          okText="崗位已確認"
          alertText={volunteer.stationState === "unassigned" ? "未分派崗位" : "崗位待確認"}
        />
      </div>
    </article>
  );
}

function StateBadge({ ok, okText, alertText }: { ok: boolean; okText: string; alertText: string }) {
  return (
    <div className={`flex min-h-11 items-center justify-center rounded-xl border px-2 text-center text-xs font-black ${
      ok
        ? "border-[#00B8B8]/20 bg-[#EFFFFD] text-[#008C8C]"
        : "border-[#F25D6B]/20 bg-[#FFF2F4] text-[#F25D6B]"
    }`}>
      {ok ? okText : alertText}
    </div>
  );
}
