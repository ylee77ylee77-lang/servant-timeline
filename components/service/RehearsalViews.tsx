"use client";

import type { ReactNode } from "react";
import { Check, MapPin, RefreshCw, User } from "lucide-react";
import type { useServiceRehearsal } from "./useServiceRehearsal";
type Controller = ReturnType<typeof useServiceRehearsal>;
const shell = "flex-1 overflow-y-auto pb-28 px-5 pt-6 bg-[#FFF9F3]";
const card = "bg-white p-6 rounded-[24px] border border-[#E6EAF0] shadow-lg shadow-[#785AA5]/5 mb-5";
const primary = "min-h-11 w-full rounded-[18px] bg-[#785AA5] px-4 py-3 text-sm font-black text-white disabled:opacity-50";
const time = (value: string) => new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));

function ModeHeader({ title, onFormal }: { title: string; onFormal: () => void }) {
  return <div className="mb-6 flex items-center justify-between gap-2 px-1">
    <h2 className="text-2xl font-extrabold text-[#1F2937] tracking-tight">{title}</h2>
    <button type="button" onClick={onFormal} className="min-h-11 px-2 text-xs font-black text-[#785AA5]">返回正式報到</button>
  </div>;
}
function ConnectionError({ controller }: { controller: Controller }) {
  return <div className={card}>
    <p role="status" className="text-sm font-bold text-[#F25D6B]">{controller.error || "正在確認演練狀態…"}</p>
    <button type="button" disabled={controller.checking || controller.pending} onClick={() => void controller.refresh()} className="mt-3 min-h-11 rounded-xl border border-[#785AA5]/25 px-4 text-sm font-bold text-[#785AA5] disabled:opacity-50">重新檢查</button>
  </div>;
}

export function RehearsalCheckInView({ controller, identity, onTimeline, onFormal }: {
  controller: Controller; identity: ReactNode; onTimeline: () => void; onFormal: () => void;
}) {
  const state = controller.current;
  const rehearsal = state?.rehearsal;
  return <div className={shell}>
    <ModeHeader title="報到" onFormal={onFormal} />
    {!state || !rehearsal ? <ConnectionError controller={controller} /> : <>
      <div className={card}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-black tracking-widest text-[#7B7B74]">今日服事｜演練中</span>
          <span className={state.checkedInAt ? "text-xs font-black text-[#008D85]" : "text-xs font-black text-[#F25D6B]"}>{state.checkedInAt ? "已報到" : "尚未報到"}</span>
        </div>
        <div className="mt-4 flex min-w-0 items-center gap-4">{identity}</div>
        <p className="mt-4 text-sm font-bold text-[#785AA5]">演練堂次：{rehearsal.serviceType}</p>
      </div>
      <div className={card}>
        <h3 className="mb-3 text-base font-black text-[#1F2937]">{state.checkedInAt ? "完成報到" : "請完成報到"}</h3>
        {state.checkedInAt ? <>
          <p className="mb-3 text-sm font-bold text-[#008D85]">{rehearsal.serviceType}｜演練報到成功</p>
          <button type="button" onClick={onTimeline} className={primary}>進入{rehearsal.serviceType}流程</button>
        </> : <>
          <p className="mb-2 text-xs font-black text-[#7B7B74]">確認堂次</p>
          <div className="mb-5 rounded-2xl border border-[#785AA5] bg-[#785AA5] px-4 py-3 text-center text-sm font-black text-white">{rehearsal.serviceType}</div>
          <section aria-label="現場報到" className="border-t border-[#E6EAF0] pt-4">
            <h4 className="mb-2 text-sm font-black text-[#1F2937]">現場報到</h4>
            <p className="mb-2 text-sm text-[#64645F]">請連線至教會 Wi-Fi「slllc」</p>
            <p role="status" className={state.onChurchNetwork ? "mb-2 text-xs font-bold text-[#00B8B8]" : "mb-2 rounded-xl border border-[#F25D6B]/20 bg-[#FFF2F4] px-3 py-2 text-xs font-bold text-[#F25D6B]"}>{state.onChurchNetwork ? "已連線" : "請先確認網路連線後再試。"}</p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void controller.refresh()} disabled={controller.checking || controller.pending}
                className={"wifi-action-enter wifi-check-button inline-flex min-h-11 items-center gap-1.5 rounded-full border bg-white px-3 text-xs font-black " +
                  (state.onChurchNetwork ? "border-[#00B8B8]/25 text-[#00B8B8]" : "[--wifi-glow-rgb:242,93,107] border-[#F25D6B]/20 text-[#F25D6B]") +
                  (controller.checking ? " wifi-check-button-checking" : "")}>
                <RefreshCw className={"h-3.5 w-3.5 " + (controller.checking ? "wifi-refresh-icon-active" : "")} />重新檢查
              </button>
              {state.onChurchNetwork && <button type="button" disabled={controller.pending || controller.checking}
                onClick={() => { void controller.run({ action: "check-in", rehearsalId: rehearsal.id }).then(next => { if (next) onTimeline(); }); }}
                className="min-h-11 rounded-[18px] bg-[#785AA5] px-4 text-sm font-black text-white disabled:opacity-50">{controller.pending ? "同步中…" : "立即報到 " + rehearsal.serviceType}</button>}
            </div>
          </section>
        </>}
        {controller.error && <p role="alert" className="mt-3 text-xs font-bold text-[#F25D6B]">{controller.error}</p>}
      </div>
    </>}
  </div>;
}

export function RehearsalTimelineView({ controller, now, onCheckIn, onFormal }: {
  controller: Controller; now: number; onCheckIn: () => void; onFormal: () => void;
}) {
  const state = controller.current;
  const rehearsal = state?.rehearsal;
  const nodes = state?.nodes ?? [];
  const activeAt = nodes.reduce((latest, node) => {
    const due = Date.parse(node.dueAt);
    return due <= now && due > latest ? due : latest;
  }, -Infinity);
  return <div className={shell}>
    <ModeHeader title="流程" onFormal={onFormal} />
    {!state || !rehearsal ? <ConnectionError controller={controller} /> : !state.checkedInAt ? <div className={card}>
      <p className="mb-4 text-sm font-bold text-[#785AA5]">請先完成演練報到。</p>
      <button type="button" onClick={onCheckIn} className={primary}>前往報到</button>
    </div> : <>
      <p className="mb-4 rounded-2xl border border-[#785AA5]/15 bg-white px-4 py-3 text-sm font-black text-[#785AA5]">演練中｜{rehearsal.serviceType}</p>
      {controller.error && <p role="alert" className="mb-3 text-sm font-bold text-[#F25D6B]">{controller.error}</p>}
      {nodes.length === 0 ? <div className={card}>此演練尚無任務。</div> : <div className="relative mt-2">
        <div className="absolute bottom-6 left-[20px] top-6 w-[2px] bg-[#E6EAF0]" />
        {nodes.map(node => {
          const completed = node.checklist.length > 0 && node.checklist.every(item => item.isCompleted);
          const active = Date.parse(node.dueAt) === activeAt;
          return <div key={node.id} className="relative mb-8">
            <div className="absolute left-0 top-4 z-10 flex h-10 w-10 items-center justify-center bg-[#FFF9F3]">
              <span className="absolute -top-2.5 text-[10px] font-medium tabular-nums text-[#9CA3AF]">{time(node.dueAt)}</span>
              {completed ? <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#00B8B8]"><Check className="h-4 w-4 text-white" /></span>
                : <span className={"rounded-full border-[3px] bg-white " + (active ? "h-5 w-5 border-[#F25D6B]/60" : "h-4 w-4 border-[#E6EAF0]")} />}
            </div>
            <div className={"ml-12 rounded-[24px] p-5 " + (completed ? "border border-[#E6EAF0] bg-white/60" : active ? "bg-[#FFF2F4] ring-2 ring-[#F25D6B]" : "border border-[#E6EAF0] bg-white shadow-sm")}>
              <h3 className="break-words text-lg font-bold text-[#1F2937]">{node.content.title || "服事任務"}</h3>
              {active && <p className="mt-1 text-xs font-black text-[#F25D6B]">進行中</p>}
              <div className="mt-3 space-y-2 text-[13px] font-medium text-[#1F2937]">
                {node.content.location && <p className="flex items-start gap-2"><MapPin className="h-4 w-4 shrink-0 text-[#F25D6B]/70" /><span className="min-w-0 break-words">{node.content.location}</span></p>}
                {node.content.assignee && <p className="flex items-start gap-2"><User className="h-4 w-4 shrink-0 text-[#785AA5]/70" /><span className="min-w-0 break-words">{node.content.assignee}</span></p>}
                {node.content.details && <details><summary className="min-h-8 cursor-pointer text-[#785AA5]">任務說明</summary><p className="whitespace-pre-wrap break-words">{node.content.details}</p></details>}
              </div>
              {node.checklist.length > 0 && <div className="mt-5 space-y-3">
                <p className="text-center text-[10px] font-black tracking-widest text-[#7B7B74]">任務清單</p>
                {node.checklist.map(item => <div key={item.id} className={"rounded-[16px] border p-3 " + (item.isCompleted ? "border-[#00B8B8]/20 bg-[#00B8B8]/5" : "border-[#E6EAF0] bg-white")}>
                  <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[#1F2937]">
                    <input type="checkbox" className="h-5 w-5 shrink-0 accent-[#008D85]" checked={item.isCompleted} disabled={controller.pending}
                      onChange={event => { void controller.run({ action: "set-item", rehearsalId: rehearsal.id, itemId: item.id, completed: event.target.checked }); }} />
                    <span className={"min-w-0 break-words " + (item.isCompleted ? "text-[#7B7B74] line-through" : "")}>{item.text || "任務"}</span>
                  </label>
                  {item.details && <details className="ml-8 text-xs font-medium text-[#7B7B74]"><summary className="cursor-pointer text-[#785AA5]">詳細說明</summary><p className="mt-1 whitespace-pre-wrap break-words">{item.details}</p></details>}
                </div>)}
              </div>}
            </div>
          </div>;
        })}
      </div>}
    </>}
  </div>;
}
