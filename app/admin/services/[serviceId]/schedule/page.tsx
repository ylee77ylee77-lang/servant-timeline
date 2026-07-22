"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Loader2, Plus, Save, Trash2, Users } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

type Checklist = { id: string; text: string | null; details: string | null; sort_order: number };
type Task = { id: string; scope: "template" | "service"; time: string | null; title: string | null; assignee: string | null; location: string | null; details: string | null; voice_reminder_enabled: boolean; reminder_pre5_enabled: boolean; reminder_now_enabled: boolean; sort_order: number; checklist: Checklist[] };
type RequiredItem = { id: string; name: string; details: string | null; quantity: number; sort_order: number };
type Service = { id: string; service_date: string; service_type: string; starts_at: string; report_at: string | null; location: string | null; status: string; notes: string | null };
type Data = { service: Service; tasks: Task[]; requiredItems: RequiredItem[]; canEdit: boolean };
type TaskDraft = Omit<Task, "checklist">;
type ChecklistDraft = Checklist & { taskId: string };

const field = "mt-1 w-full rounded-2xl border border-[#D9DEE7] bg-white px-4 py-3";
const card = "rounded-[26px] border border-[#E6EAF0] bg-white p-5";
const blankTask = (order: number): TaskDraft => ({ id: "", scope: "service", time: "08:00", title: "", assignee: "", location: "", details: "", voice_reminder_enabled: true, reminder_pre5_enabled: true, reminder_now_enabled: true, sort_order: order });
const time = (value: string | null) => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "";
const nextWeek = (value: string) => { const date = new Date(`${value}T12:00:00+08:00`); date.setUTCDate(date.getUTCDate() + 7); return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date); };

export default function ServiceSchedulePage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const { session, isCoordinator } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${session.access_token}` }), [session.access_token]);
  const [data, setData] = useState<Data | null>(null);
  const [serviceForm, setServiceForm] = useState({ serviceDate: "", startsAt: "", reportAt: "", location: "", notes: "", status: "draft" });
  const [task, setTask] = useState<TaskDraft | null>(null);
  const [checklist, setChecklist] = useState<ChecklistDraft | null>(null);
  const [required, setRequired] = useState<RequiredItem | null>(null);
  const [copy, setCopy] = useState<null | { serviceDate: string; startsAt: string; reportAt: string; location: string; notes: string; status: string; includeAssignments: boolean }>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (keepMessage = false) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/services/${serviceId}/schedule`, { headers, cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "無法載入場次。");
      setData(result);
      const form = { serviceDate: result.service.service_date, startsAt: time(result.service.starts_at), reportAt: time(result.service.report_at), location: result.service.location ?? "", notes: result.service.notes ?? "", status: result.service.status };
      setServiceForm(form);
      if (!keepMessage) setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "無法載入場次。"); }
    finally { setLoading(false); }
  }, [headers, serviceId]);

  useEffect(() => { if (isCoordinator) void load(); }, [isCoordinator, load]);

  const post = async (payload: Record<string, unknown>) => {
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/services/${serviceId}/schedule`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "操作失敗。");
      setMessage(result.message || "已完成更新。"); await load(true); return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "操作失敗。"); return false; }
    finally { setSaving(false); }
  };

  const copyService = async () => {
    if (!copy) return; setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/services/${serviceId}/copy`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(copy) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "複製失敗。");
      window.location.assign(`/admin/services/${result.serviceId}/schedule`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "複製失敗。"); setSaving(false); }
  };

  if (!isCoordinator) return <main className="min-h-screen bg-[#FFF9F3] p-8 text-center font-bold text-[#F25D6B]">你沒有場次查看權限。</main>;

  return <main className="min-h-screen bg-[#FFF9F3] px-4 py-8 text-[#1F2937]"><div className="mx-auto max-w-4xl space-y-5">
    <div className="flex justify-between gap-3"><Link href="/admin/services" className="text-sm font-black text-[#6D55A3]">← 回場次列表</Link><Link href={`/admin/services/${serviceId}`} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-black text-[#6D55A3]"><Users className="h-4 w-4" />排班與團隊</Link></div>
    {loading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#6D55A3]" /> : data && <>
      <header className="rounded-[28px] bg-white p-6 shadow-lg shadow-[#6D55A3]/10"><p className="text-xs font-black text-[#00A6A6]">{data.canEdit ? "管理員排程" : "協調員唯讀"}</p><h1 className="mt-2 text-2xl font-black">{data.service.service_date}｜{data.service.service_type}</h1><p className="mt-2 text-sm text-[#7B7B74]">所有修改預設只套用本堂，不影響範本或其他日期。</p></header>
      {message && <p role="status" className="rounded-2xl border bg-white px-4 py-3 text-sm font-bold text-[#6D55A3]">{message}</p>}

      <section className={card}><h2 className="text-lg font-black">本堂基本資料</h2><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-black">日期<input disabled={!data.canEdit} type="date" value={serviceForm.serviceDate} onChange={e => setServiceForm({ ...serviceForm, serviceDate: e.target.value })} className={field} /></label><label className="text-sm font-black">狀態<select disabled={!data.canEdit} value={serviceForm.status} onChange={e => setServiceForm({ ...serviceForm, status: e.target.value })} className={field}><option value="draft">草稿</option><option value="published">已開放</option><option value="cancelled">已取消</option></select></label><label className="text-sm font-black">報到時間<input disabled={!data.canEdit} type="time" value={serviceForm.reportAt} onChange={e => setServiceForm({ ...serviceForm, reportAt: e.target.value })} className={field} /></label><label className="text-sm font-black">崇拜開始<input disabled={!data.canEdit} type="time" value={serviceForm.startsAt} onChange={e => setServiceForm({ ...serviceForm, startsAt: e.target.value })} className={field} /></label></div><label className="mt-3 block text-sm font-black">報到地點<input disabled={!data.canEdit} value={serviceForm.location} onChange={e => setServiceForm({ ...serviceForm, location: e.target.value })} className={field} /></label><label className="mt-3 block text-sm font-black">備註<textarea disabled={!data.canEdit} rows={3} value={serviceForm.notes} onChange={e => setServiceForm({ ...serviceForm, notes: e.target.value })} className={field} /></label>{data.canEdit && <Action saving={saving} label="儲存本堂基本資料" onClick={() => void post({ action: "update_service", ...serviceForm })} />}</section>

      <section className={card}><div className="flex justify-between"><h2 className="text-lg font-black">時間軸任務</h2>{data.canEdit && <button onClick={() => setTask(blankTask(data.tasks.length))} className="flex items-center gap-1 rounded-xl bg-[#E8F8F5] px-3 py-2 text-sm font-black text-[#087F78]"><Plus className="h-4 w-4" />新增</button>}</div><div className="mt-4 space-y-3">{data.tasks.map(item => <article key={item.id} className="rounded-2xl bg-[#FFF9F3] p-4"><div className="flex justify-between gap-3"><div><p className="text-xs font-black text-[#00A6A6]">{item.scope === "template" ? "沿用標準範本" : "本堂專屬"}</p><h3 className="font-black">{item.time ?? "--:--"}｜{item.title ?? "未命名"}</h3><p className="text-sm text-[#7B7B74]">{item.assignee || "未指定角色"}｜{item.location || "未指定地點"}</p></div>{data.canEdit && <div className="flex gap-2"><button onClick={() => setTask({ ...item })} className="text-sm font-black text-[#6D55A3]">修改</button><button onClick={() => window.confirm("只停用本堂此任務？") && void post({ action: "delete_task", id: item.id })} className="text-[#D73A49]"><Trash2 className="h-4 w-4" /></button></div>}</div><div className="mt-3 border-t pt-3"><div className="flex justify-between"><p className="text-sm font-black">清單</p>{data.canEdit && <button onClick={() => setChecklist({ id: "", taskId: item.id, text: "", details: "", sort_order: item.checklist.length })} className="text-xs font-black text-[#6D55A3]">＋新增</button>}</div>{item.checklist.map(row => <div key={row.id} className="mt-2 flex justify-between rounded-xl bg-white px-3 py-2 text-sm"><span>{row.text}</span>{data.canEdit && <button onClick={() => setChecklist({ ...row, taskId: item.id })} className="font-black text-[#6D55A3]">修改</button>}</div>)}</div></article>)}</div></section>

      <section className={card}><div className="flex justify-between"><h2 className="text-lg font-black">必備物品</h2>{data.canEdit && <button onClick={() => setRequired({ id: "", name: "", details: "", quantity: 1, sort_order: data.requiredItems.length })} className="text-sm font-black text-[#6D55A3]">＋新增</button>}</div><div className="mt-3 space-y-2">{data.requiredItems.map(item => <div key={item.id} className="flex justify-between rounded-2xl bg-[#FFF9F3] px-4 py-3"><span className="font-black">{item.name} × {item.quantity}</span>{data.canEdit && <button onClick={() => setRequired({ ...item })} className="text-sm font-black text-[#6D55A3]">修改</button>}</div>)}</div></section>

      {data.canEdit && <section className={card}><h2 className="flex items-center gap-2 text-lg font-black"><Copy className="h-5 w-5" />複製為下一場</h2><p className="mt-2 text-sm text-[#7B7B74]">複製崗位、任務、清單、提醒與物品；排班可選擇是否帶入。</p><button onClick={() => setCopy({ serviceDate: nextWeek(data.service.service_date), startsAt: time(data.service.starts_at), reportAt: time(data.service.report_at), location: data.service.location ?? "", notes: data.service.notes ?? "", status: "draft", includeAssignments: false })} className="mt-4 w-full rounded-2xl border border-[#6D55A3] px-4 py-3 font-black text-[#6D55A3]">設定複製場次</button></section>}
    </>}
  </div>

  {task && <Modal title={task.id ? "修改本堂任務" : "新增本堂任務"} close={() => setTask(null)}><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-black">時間<input type="time" value={task.time ?? ""} onChange={e => setTask({ ...task, time: e.target.value })} className={field} /></label><label className="text-sm font-black">名稱<input value={task.title ?? ""} onChange={e => setTask({ ...task, title: e.target.value })} className={field} /></label><label className="text-sm font-black">角色<input value={task.assignee ?? ""} onChange={e => setTask({ ...task, assignee: e.target.value })} className={field} /></label><label className="text-sm font-black">地點<input value={task.location ?? ""} onChange={e => setTask({ ...task, location: e.target.value })} className={field} /></label></div><label className="mt-3 block text-sm font-black">提醒內容<textarea rows={3} value={task.details ?? ""} onChange={e => setTask({ ...task, details: e.target.value })} className={field} /></label><div className="mt-3 grid gap-2 sm:grid-cols-3">{[["voice_reminder_enabled","語音提醒"],["reminder_pre5_enabled","提前 5 分鐘"],["reminder_now_enabled","到點提醒"]].map(([key,label]) => <label key={key} className="flex gap-2 rounded-xl bg-[#FFF9F3] p-3 text-sm font-bold"><input type="checkbox" checked={Boolean(task[key as keyof TaskDraft])} onChange={e => setTask({ ...task, [key]: e.target.checked })} />{label}</label>)}</div><Action saving={saving} label="儲存本堂修改" onClick={async () => { if (await post({ action: "save_task", ...task })) setTask(null); }} /></Modal>}
  {checklist && <Modal title="本堂清單項目" close={() => setChecklist(null)}><label className="text-sm font-black">項目<input value={checklist.text ?? ""} onChange={e => setChecklist({ ...checklist, text: e.target.value })} className={field} /></label><label className="mt-3 block text-sm font-black">說明<textarea rows={3} value={checklist.details ?? ""} onChange={e => setChecklist({ ...checklist, details: e.target.value })} className={field} /></label><Action saving={saving} label="儲存本堂清單" onClick={async () => { if (await post({ action: "save_checklist", ...checklist })) setChecklist(null); }} />{checklist.id && <button onClick={async () => { if (window.confirm("停用本堂此清單項目？") && await post({ action: "delete_checklist", taskId: checklist.taskId, id: checklist.id })) setChecklist(null); }} className="mt-3 w-full text-sm font-black text-[#D73A49]">停用此項目</button>}</Modal>}
  {required && <Modal title="本堂必備物品" close={() => setRequired(null)}><label className="text-sm font-black">名稱<input value={required.name} onChange={e => setRequired({ ...required, name: e.target.value })} className={field} /></label><label className="mt-3 block text-sm font-black">數量<input type="number" min={1} max={999} value={required.quantity} onChange={e => setRequired({ ...required, quantity: Number(e.target.value) })} className={field} /></label><label className="mt-3 block text-sm font-black">說明<textarea rows={3} value={required.details ?? ""} onChange={e => setRequired({ ...required, details: e.target.value })} className={field} /></label><Action saving={saving} label="儲存必備物品" onClick={async () => { if (await post({ action: "save_required_item", ...required })) setRequired(null); }} />{required.id && <button onClick={async () => { if (window.confirm("停用本堂此物品？") && await post({ action: "delete_required_item", id: required.id })) setRequired(null); }} className="mt-3 w-full text-sm font-black text-[#D73A49]">停用此物品</button>}</Modal>}
  {copy && <Modal title="複製本堂排程" close={() => setCopy(null)}><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-black">新日期<input type="date" value={copy.serviceDate} onChange={e => setCopy({ ...copy, serviceDate: e.target.value })} className={field} /></label><label className="text-sm font-black">狀態<select value={copy.status} onChange={e => setCopy({ ...copy, status: e.target.value })} className={field}><option value="draft">草稿</option><option value="published">已開放</option></select></label><label className="text-sm font-black">報到<input type="time" value={copy.reportAt} onChange={e => setCopy({ ...copy, reportAt: e.target.value })} className={field} /></label><label className="text-sm font-black">開始<input type="time" value={copy.startsAt} onChange={e => setCopy({ ...copy, startsAt: e.target.value })} className={field} /></label></div><label className="mt-3 block text-sm font-black">地點<input value={copy.location} onChange={e => setCopy({ ...copy, location: e.target.value })} className={field} /></label><label className="mt-3 flex gap-3 rounded-2xl bg-[#FFF9F3] p-4 text-sm font-bold"><input type="checkbox" checked={copy.includeAssignments} onChange={e => setCopy({ ...copy, includeAssignments: e.target.checked })} />一併複製排班（不複製報到與完成紀錄）</label><Action saving={saving} label="建立複製場次" onClick={() => void copyService()} /></Modal>}
  </main>;
}

function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-end bg-black/40 sm:items-center sm:justify-center"><div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] bg-white p-5 sm:max-w-xl sm:rounded-[28px]"><div className="mb-4 flex justify-between"><h2 className="text-xl font-black">{title}</h2><button onClick={close} className="text-sm font-bold text-[#7B7B74]">取消</button></div>{children}</div></div>; }
function Action({ saving, label, onClick }: { saving: boolean; label: string; onClick: () => void }) { return <button disabled={saving} onClick={onClick} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-4 font-black text-white disabled:opacity-60">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}{saving ? "處理中" : label}</button>; }
