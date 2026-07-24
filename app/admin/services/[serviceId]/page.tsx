"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";

type CoordinationData = {
  service: { id: string; service_date: string; service_type: string; status: string };
  assignments: Array<{ id: string; user_id: string; station_id: string | null; role_label: string; status: string }>;
  stations: Array<{ id: string; name: string; is_active: boolean }>;
  tasks: Array<{ id: string; time: string | null; title: string | null; assignee: string | null }>;
  taskMappings: Array<{ id: string; assignment_id: string; timeline_node_id: string }>;
  coordinators: Array<{ id: string; user_id: string }>;
  profiles: Array<{ id: string; display_name: string; account_code: string | null }>;
  canManageSchedule: boolean;
};

export default function ServiceCoordinationPage() {
  const { serviceId } = useParams<{ serviceId: string }>();
  const { session, isCoordinator } = useAuth();
  const [data, setData] = useState<CoordinationData | null>(null);
  const [accountCode, setAccountCode] = useState("");
  const [roleLabel, setRoleLabel] = useState("專招");
  const [stationId, setStationId] = useState("");
  const [coordinatorCode, setCoordinatorCode] = useState("");
  const [mappingAssignmentId, setMappingAssignmentId] = useState("");
  const [mappingNodeId, setMappingNodeId] = useState("");
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${session.access_token}` }), [session.access_token]);
  const profileById = useMemo(() => new Map((data?.profiles ?? []).map((profile) => [profile.id, profile])), [data?.profiles]);
  const stationById = useMemo(() => new Map((data?.stations ?? []).map((station) => [station.id, station])), [data?.stations]);
  const taskById = useMemo(() => new Map((data?.tasks ?? []).map((task) => [task.id, task])), [data?.tasks]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/services/${serviceId}/coordination`, { headers, cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "無法載入場次協調資料。");
      setData(result);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "無法載入場次協調資料。");
    } finally {
      setIsLoading(false);
    }
  }, [headers, serviceId]);

  useEffect(() => {
    if (isCoordinator) void load();
  }, [isCoordinator, load]);

  const postAction = async (payload: Record<string, unknown>) => {
    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/services/${serviceId}/coordination`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "操作失敗。");
      await load();
      setMessage("已完成更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失敗。");
    } finally {
      setIsSaving(false);
    }
  };

  const remove = async (kind: "coordinator" | "assignment" | "task_mapping", id: string) => {
    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/services/${serviceId}/coordination?kind=${kind}&id=${id}`, { method: "DELETE", headers });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "刪除失敗。");
      await load();
      setMessage("已移除。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刪除失敗。");
    } finally {
      setIsSaving(false);
    }
  };

  if (!isCoordinator) {
    return <main className="min-h-screen bg-[#FFF9F3] p-8 text-center font-bold text-[#F25D6B]">你沒有場次協調權限。</main>;
  }

  return (
    <main className="min-h-screen bg-[#FFF9F3] px-5 py-10 text-[#1F2937]">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/admin/services" className="text-sm font-black text-[#6D55A3]">← 回場次列表</Link>
          {data?.canManageSchedule && <Link href={`/admin/services/${serviceId}/schedule`} className="rounded-xl bg-white px-4 py-2 text-sm font-black text-[#6D55A3] shadow-sm">編輯本堂排程</Link>}
        </div>
        <header className="rounded-[28px] bg-white p-6 shadow-lg shadow-[#6D55A3]/10">
          <p className="text-xs font-black tracking-widest text-[#00A6A6]">{data?.canManageSchedule ? "管理員團隊排班" : "帶領者／協調員唯讀"}</p>
          <h1 className="mt-2 text-2xl font-black">{data ? `${data.service.service_date}｜${data.service.service_type}` : "場次團隊"}</h1>
          <p className="mt-2 text-sm font-medium text-[#7B7B74]">協調員可查看團隊與任務；排班、任務對應及協調權限由管理員維護。</p>
        </header>

        {message && <p role="status" className="rounded-2xl border border-[#E6EAF0] bg-white px-4 py-3 text-sm font-bold text-[#6D55A3]">{message}</p>}
        {isLoading ? <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#6D55A3]" /> : data && (
          <>
            {data.canManageSchedule && <form onSubmit={(event) => { event.preventDefault(); void postAction({ action: "grant_coordinator", accountCode: coordinatorCode }); }} className="rounded-[28px] border border-[#E6EAF0] bg-white p-6">
              <h2 className="text-lg font-black">授權帶領者／協調員</h2>
              <div className="mt-4 flex gap-3"><input value={coordinatorCode} onChange={(event) => setCoordinatorCode(event.target.value)} required placeholder="服事帳號" className="min-w-0 flex-1 rounded-2xl border border-[#D9DEE7] px-4 py-3" /><button disabled={isSaving} className="rounded-2xl bg-[#6D55A3] px-5 py-3 font-black text-white disabled:opacity-60">授權</button></div>
              <div className="mt-4 space-y-2">{data.coordinators.map((coordinator) => <div key={coordinator.id} className="flex items-center justify-between rounded-2xl bg-[#FFF9F3] px-4 py-3 text-sm font-bold"><span>{profileById.get(coordinator.user_id)?.display_name ?? "協調員"}</span><button type="button" onClick={() => void remove("coordinator", coordinator.id)} className="text-[#D73A49]">撤銷</button></div>)}</div>
            </form>}

            {data.canManageSchedule && <form onSubmit={(event: FormEvent) => { event.preventDefault(); void postAction({ action: "create_assignment", accountCode, roleLabel, stationId }); }} className="rounded-[28px] border border-[#E6EAF0] bg-white p-6">
              <div className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-[#6D55A3]" /><h2 className="text-lg font-black">新增服事分派</h2></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><input value={accountCode} onChange={(event) => setAccountCode(event.target.value)} required placeholder="同工服事帳號" className="rounded-2xl border border-[#D9DEE7] px-4 py-3" /><input value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} required maxLength={80} placeholder="角色" className="rounded-2xl border border-[#D9DEE7] px-4 py-3" /><select value={stationId} onChange={(event) => setStationId(event.target.value)} className="rounded-2xl border border-[#D9DEE7] bg-white px-4 py-3"><option value="">尚未分派崗位</option>{data.stations.filter((station) => station.is_active).map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}</select></div>
              <button disabled={isSaving} className="mt-4 w-full rounded-2xl bg-[#00A6A6] px-5 py-3 font-black text-white disabled:opacity-60">新增分派</button>
            </form>}

            <section className="rounded-[28px] border border-[#E6EAF0] bg-white p-6">
              <h2 className="text-lg font-black">場次團隊</h2>
              <div className="mt-4 space-y-2">{data.assignments.length ? data.assignments.map((assignment) => <div key={assignment.id} className="flex items-start justify-between gap-3 rounded-2xl bg-[#FFF9F3] px-4 py-3 text-sm"><div><p className="font-black">{profileById.get(assignment.user_id)?.display_name ?? "同工"}｜{assignment.role_label}</p><p className="mt-1 font-medium text-[#7B7B74]">{assignment.station_id ? stationById.get(assignment.station_id)?.name ?? "未知崗位" : "尚未分派崗位"}｜{assignment.status}</p></div>{data.canManageSchedule && <button type="button" onClick={() => void remove("assignment", assignment.id)} className="font-bold text-[#D73A49]">移除</button>}</div>) : <p className="text-sm font-medium text-[#7B7B74]">尚未建立同工分派。</p>}</div>
            </section>

            {data.canManageSchedule && <form onSubmit={(event: FormEvent) => { event.preventDefault(); void postAction({ action: "map_task", assignmentId: mappingAssignmentId, nodeId: mappingNodeId }); }} className="rounded-[28px] border border-[#E6EAF0] bg-white p-6">
              <h2 className="text-lg font-black">分派任務</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><select required value={mappingAssignmentId} onChange={(event) => setMappingAssignmentId(event.target.value)} className="rounded-2xl border border-[#D9DEE7] bg-white px-4 py-3"><option value="">選擇同工分派</option>{data.assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{profileById.get(assignment.user_id)?.display_name ?? "同工"}｜{assignment.role_label}</option>)}</select><select required value={mappingNodeId} onChange={(event) => setMappingNodeId(event.target.value)} className="rounded-2xl border border-[#D9DEE7] bg-white px-4 py-3"><option value="">選擇任務</option>{data.tasks.map((task) => <option key={task.id} value={task.id}>{task.time ?? "--:--"}｜{task.title ?? "未命名任務"}</option>)}</select></div>
              <button disabled={isSaving} className="mt-4 w-full rounded-2xl bg-[#6D55A3] px-5 py-3 font-black text-white disabled:opacity-60">加入任務</button>
              <div className="mt-4 space-y-2">{data.taskMappings.map((mapping) => { const assignment = data.assignments.find((item) => item.id === mapping.assignment_id); return <div key={mapping.id} className="flex items-center justify-between rounded-2xl bg-[#FFF9F3] px-4 py-3 text-sm font-bold"><span>{assignment ? profileById.get(assignment.user_id)?.display_name : "同工"}｜{taskById.get(mapping.timeline_node_id)?.title ?? "任務"}</span><button type="button" onClick={() => void remove("task_mapping", mapping.id)} className="text-[#D73A49]">移除</button></div>; })}</div>
            </form>}

            {!data.canManageSchedule && <section className="rounded-[28px] border border-[#E6EAF0] bg-white p-6"><h2 className="text-lg font-black">任務分派</h2><div className="mt-4 space-y-2">{data.taskMappings.length ? data.taskMappings.map((mapping) => { const assignment = data.assignments.find((item) => item.id === mapping.assignment_id); return <div key={mapping.id} className="rounded-2xl bg-[#FFF9F3] px-4 py-3 text-sm font-bold">{assignment ? profileById.get(assignment.user_id)?.display_name : "同工"}｜{taskById.get(mapping.timeline_node_id)?.title ?? "任務"}</div>; }) : <p className="text-sm text-[#7B7B74]">尚未分派任務。</p>}</div></section>}
          </>
        )}
      </div>
    </main>
  );
}
