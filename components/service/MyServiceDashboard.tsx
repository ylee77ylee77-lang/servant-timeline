"use client";

import { memo } from "react";
import {
  Check,
  Clock,
  HeartHandshake,
  ListTodo,
  MapPin,
  User,
  Users,
} from "lucide-react";
import { deriveMyServiceDashboardState } from "@/lib/services/my-service-dashboard";

type ServiceSummary = {
  service_date: string;
  service_type: string;
  starts_at: string;
  report_at: string | null;
  location: string | null;
  status: string;
};

type AssignmentSummary = {
  role_label: string;
  report_at: string | null;
  report_location: string | null;
  ministry_group: string | null;
  status: string;
};

type CheckInSummary = {
  status: string;
  checked_in_at: string;
} | null;

type MyServiceDashboardProps = {
  displayName: string;
  isLoading: boolean;
  service: ServiceSummary | null;
  assignment: AssignmentSummary | null;
  assignedStation: string;
  checkIn: CheckInSummary;
  onNavigate: (tab: "checkin" | "timeline") => void;
};

const statusStyles = {
  upcoming: "bg-[#F3EEFF] text-[#6D55A3] border-[#6D55A3]/20",
  today: "bg-[#FFF4E5] text-[#A85B00] border-[#F59E0B]/25",
  checked_in: "bg-[#E8FAF8] text-[#007D7D] border-[#00B8B8]/25",
  completed: "bg-[#EEF1F4] text-[#4B5563] border-[#7B7B74]/20",
} as const;

const QUICK_ACTIONS = [
  { label: "我要報到", icon: Check, tab: "checkin" as const },
  { label: "我的時間軸", icon: ListTodo, tab: "timeline" as const },
  { label: "我的任務", icon: User, tab: "timeline" as const },
] as const;

function taipeiDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatServiceDate(value: string) {
  if (!value) return "日期待確認";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(`${value}T12:00:00+08:00`));
}

function formatTaipeiTime(value: string | null) {
  if (!value) return "待確認";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export const MyServiceDashboard = memo(function MyServiceDashboard({
  displayName,
  isLoading,
  service,
  assignment,
  assignedStation,
  checkIn,
  onNavigate,
}: MyServiceDashboardProps) {
  if (isLoading) {
    return (
      <main
        className="flex-1 px-5 pt-4 pb-28 overflow-y-auto"
        aria-busy="true"
        aria-label="正在載入我的服事"
      >
        <div className="h-5 w-28 rounded-full bg-[#E6EAF0] animate-pulse" />
        <div className="mt-4 h-[310px] rounded-[28px] bg-white border border-[#E6EAF0] animate-pulse" />
      </main>
    );
  }

  if (!service || !assignment) {
    return (
      <main className="flex-1 px-5 pt-4 pb-28 overflow-y-auto">
        <p className="text-sm font-bold text-[#6D55A3]">嗨，{displayName}</p>
        <section className="mt-3 rounded-[28px] bg-white border border-[#E6EAF0] p-6 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F3EEFF]">
            <HeartHandshake className="h-7 w-7 text-[#6D55A3]" />
          </div>
          <h2 className="mt-4 text-xl font-black text-[#1F2937]">目前沒有服事安排</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-[#64645F]">
            有新的排班時，日期、時間、地點和角色會顯示在這裡。
          </p>
        </section>
        <QuickActions onNavigate={onNavigate} />
      </main>
    );
  }

  const dashboardState = deriveMyServiceDashboardState({
    today: taipeiDateKey(),
    serviceDate: service.service_date,
    serviceStatus: service.status,
    assignmentStatus: assignment.status,
    checkInStatus: checkIn?.status,
  });
  const reportAt = assignment.report_at || service.report_at;
  const reportLocation = assignment.report_location || service.location || "待確認";

  return (
    <main className="flex-1 px-5 pt-3 pb-28 overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black tracking-[0.16em] text-[#6D55A3]">我的下一次服事</p>
          <p className="mt-1 text-sm font-bold text-[#64645F]">嗨，{displayName}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${statusStyles[dashboardState.status]}`}
          aria-label={`服事狀態：${dashboardState.statusLabel}`}
        >
          {dashboardState.statusLabel}
        </span>
      </div>

      <section className="mt-3 rounded-[28px] bg-white border border-[#E6EAF0] p-5 shadow-lg shadow-[#6D55A3]/5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[#F25D6B]">{formatServiceDate(service.service_date)}</p>
            <h2 className="mt-1 text-[28px] leading-tight font-black tracking-tight text-[#1F2937]">
              {service.service_type}
            </h2>
          </div>
          <div className="rounded-2xl bg-[#F3EEFF] px-3 py-2 text-right">
            <p className="text-[10px] font-black tracking-wider text-[#6D55A3]">我的角色</p>
            <p className="mt-0.5 text-base font-black text-[#1F2937]">{assignment.role_label}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <SummaryItem
            icon={Clock}
            label="報到時間"
            value={formatTaipeiTime(reportAt)}
            accent="text-[#F25D6B]"
            panel="bg-[#FFF2F4]"
          />
          <SummaryItem
            icon={MapPin}
            label="報到地點"
            value={reportLocation}
            accent="text-[#008C8C]"
            panel="bg-[#EFFFFD]"
          />
        </div>

        {(assignedStation || assignment.ministry_group) && (
          <div className="mt-3 space-y-2 rounded-2xl bg-[#FAFAF8] border border-[#E6EAF0] px-4 py-3">
            {assignedStation && (
              <div className="flex items-center gap-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-[#6D55A3]" />
                <p className="min-w-0 text-sm font-bold text-[#1F2937]">
                  <span className="text-[#64645F]">服事崗位：</span>
                  {assignedStation}
                </p>
              </div>
            )}
            {assignment.ministry_group && (
              <div className="flex items-center gap-2.5">
                <Users className="h-4 w-4 shrink-0 text-[#6D55A3]" />
                <p className="min-w-0 text-sm font-bold text-[#1F2937]">
                  <span className="text-[#64645F]">服事團隊：</span>
                  {assignment.ministry_group}
                </p>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="mt-3 rounded-[24px] bg-gradient-to-r from-[#6D55A3] to-[#8068B4] p-4 text-white shadow-lg shadow-[#6D55A3]/20">
        <p className="text-[11px] font-black tracking-[0.18em] text-white/90">下一步</p>
        <button
          type="button"
          disabled={!dashboardState.nextAction.targetTab}
          onClick={() => {
            if (dashboardState.nextAction.targetTab) {
              onNavigate(dashboardState.nextAction.targetTab);
            }
          }}
          className="mt-2 flex min-h-12 w-full items-center justify-center rounded-2xl bg-white px-4 text-base font-black text-[#6D55A3] shadow-sm transition-transform enabled:active:scale-[0.98] disabled:cursor-default disabled:bg-white/90"
        >
          {dashboardState.nextAction.label}
        </button>
      </section>

      <QuickActions onNavigate={onNavigate} />
    </main>
  );
});

function SummaryItem({
  icon: Icon,
  label,
  value,
  accent,
  panel,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  accent: string;
  panel: string;
}) {
  return (
    <div className={`min-h-[84px] rounded-2xl p-3 ${panel}`}>
      <div className="flex items-center gap-1.5">
        <Icon className={`h-4 w-4 ${accent}`} />
        <p className="text-[11px] font-black tracking-wider text-[#64645F]">{label}</p>
      </div>
      <p className="mt-2 text-base leading-tight font-black text-[#1F2937]">{value}</p>
    </div>
  );
}

function QuickActions({
  onNavigate,
}: {
  onNavigate: (tab: "checkin" | "timeline") => void;
}) {
  return (
    <section
      className="sticky bottom-0 z-10 mt-3 bg-[#FFF9F3] pt-2 pb-1"
      aria-label="快速操作"
    >
      <div className="grid grid-cols-3 gap-2">
        {QUICK_ACTIONS.map(({ label, icon: Icon, tab }) => (
          <button
            key={label}
            type="button"
            onClick={() => onNavigate(tab)}
            className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl border border-[#E6EAF0] bg-white px-2 py-2 text-[#1F2937] shadow-sm transition-colors hover:bg-[#F3EEFF] active:bg-[#EAE2FA]"
          >
            <Icon className="h-4 w-4 text-[#6D55A3]" />
            <span className="text-[11px] font-black">{label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
