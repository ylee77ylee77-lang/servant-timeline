"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RehearsalParticipantAction, RehearsalParticipantState } from "@/lib/services/rehearsal-participant-contract";
import { isServiceType } from "@/lib/services/catalog";
import { isUuid } from "@/lib/services/check-in";

type Snapshot = RehearsalParticipantState & { onChurchNetwork: boolean };
type Scoped<T> = { owner: string; value: T };

function parseState(value: unknown): Snapshot | null {
  if (!value || typeof value !== "object") throw new Error("演練資料無效。");
  const data = value as Record<string, unknown>;
  if (data.enabled === false) return null;
  if (data.enabled !== true || typeof data.onChurchNetwork !== "boolean"
    || typeof data.formalCheckIn !== "boolean" || !Array.isArray(data.nodes)
    || (data.checkedInAt !== null && typeof data.checkedInAt !== "string")) throw new Error("演練資料無效。");
  const r = data.rehearsal as Snapshot["rehearsal"];
  if (r !== null && (!r || typeof r.id !== "string" || !isUuid(r.id) || !isServiceType(r.serviceType)
    || !Number.isFinite(Date.parse(r.startedAt)))) throw new Error("演練場次無效。");
  if (data.formalCheckIn && r !== null) throw new Error("報到狀態衝突。");
  return data as unknown as Snapshot;
}

// Server state is authoritative; local selection is only a view preference.
// Never store rehearsal IDs or check-in state in the formal check-in cache.
export function useServiceRehearsal({ eligible, token, userId, tab }: {
  eligible: boolean; token: string; userId: string; tab: string;
}) {
  const [snapshot, setSnapshot] = useState<Scoped<Snapshot | null> | null>(null);
  const [choice, setChoice] = useState<Scoped<string | null> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const generation = useRef(0);
  const getRequest = useRef<AbortController | null>(null);
  const writeRequest = useRef<AbortController | null>(null);
  const leftModeRef = useRef(false);
  const modeRef = useRef<{ disabled: boolean; hasRehearsal: boolean; checkedIn: boolean }>({ disabled: false, hasRehearsal: false, checkedIn: false });

  const data = eligible && snapshot?.owner === userId ? snapshot.value : null;
  const selectedId = eligible && choice?.owner === userId && choice.value !== "formal" ? choice.value : null;
  const inMode = Boolean(selectedId);
  const current = data && data.rehearsal?.id === selectedId && !data.formalCheckIn ? data : null;

  const refresh = useCallback(async (afterWrite = false): Promise<Snapshot | null> => {
    if (!eligible || !token || (writeRequest.current && !afterWrite)) return null;
    if (getRequest.current) {
      if (!afterWrite) return null;
      getRequest.current.abort();
    }
    const version = generation.current;
    const controller = new AbortController();
    getRequest.current = controller;
    setChecking(true);
    if (!writeRequest.current) setPending(false);
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch("/api/rehearsal", {
        headers: { Authorization: "Bearer " + token }, cache: "no-store", signal: controller.signal,
      });
      const body = await res.json();
      if (version !== generation.current || getRequest.current !== controller) return null;
      if (!res.ok) throw new Error(body.error || "無法讀取演練狀態。");
      const next = parseState(body);
      modeRef.current = { disabled: next === null, hasRehearsal: Boolean(next?.rehearsal), checkedIn: Boolean(next?.checkedInAt) };
      setSnapshot({ owner: userId, value: next });
      setError("");
      setChoice(previous => {
        const value = previous?.owner === userId ? previous.value : null;
        const id = next?.rehearsal?.id;
        if (!id || next?.formalCheckIn) return { owner: userId, value: null };
        if (value === "formal") return { owner: userId, value };
        if (value === id || next.checkedInAt) return { owner: userId, value: id };
        return { owner: userId, value: null };
      });
      return next;
    } catch (err) {
      if (version === generation.current && getRequest.current === controller) {
        setSnapshot({ owner: userId, value: null });
        setError(err instanceof Error && err.name !== "AbortError" ? err.message : "演練連線中斷，請重新檢查。");
      }
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (getRequest.current === controller) {
        getRequest.current = null;
        if (version === generation.current) setChecking(false);
      }
    }
  }, [eligible, token, userId]);

  useEffect(() => {
    if (!eligible || !token) return;
    let disposed = false;
    let timer: number | undefined;
    let sequence = 0;
    const tick = async () => {
      if (disposed || document.hidden) return;
      const attempt = ++sequence;
      await refresh();
      if (disposed || attempt !== sequence || document.hidden || modeRef.current.disabled) return;
      const fast = tab === "checkin" && modeRef.current.hasRehearsal && !modeRef.current.checkedIn;
      timer = window.setTimeout(() => void tick(), fast ? 1000 : modeRef.current.hasRehearsal ? 5000 : 10000);
    };
    const restart = () => {
      sequence += 1;
      window.clearTimeout(timer);
      if (!document.hidden) void tick();
    };
    timer = window.setTimeout(() => void tick(), 0);
    document.addEventListener("visibilitychange", restart);
    window.addEventListener("online", restart);
    window.addEventListener("pageshow", restart);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", restart);
      window.removeEventListener("online", restart);
      window.removeEventListener("pageshow", restart);
    };
  }, [eligible, token, refresh, tab]);

  useEffect(() => {
    return () => {
      generation.current++;
      getRequest.current?.abort();
      getRequest.current = null;
      writeRequest.current?.abort();
      writeRequest.current = null;
    };
  }, [eligible, token, userId]);

  const enter = () => {
    if (!data?.rehearsal || data.formalCheckIn) return;
    leftModeRef.current = false;
    setChoice({ owner: userId, value: data.rehearsal.id });
    void refresh();
  };
  const leave = () => {
    leftModeRef.current = true;
    setChoice({ owner: userId, value: "formal" });
  };

  const run = async (action: RehearsalParticipantAction): Promise<Snapshot | null> => {
    if (!eligible || !current?.rehearsal || current.rehearsal.id !== action.rehearsalId
      || writeRequest.current || (action.action === "check-in" && !current.onChurchNetwork)
      || (action.action === "set-item" && !current.checkedInAt)) return null;
    const version = generation.current;
    const controller = new AbortController();
    writeRequest.current = controller;
    getRequest.current?.abort();
    getRequest.current = null;
    setChecking(false);
    setPending(true);
    setError("");
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch("/api/rehearsal", {
        method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(action), signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (version !== generation.current) return null;
      if (!res.ok || body?.ok !== true) {
        // An end, role loss, or formal report must clear stale controls.
        await refresh(true);
        if (version === generation.current) setError(body?.error || "演練操作尚未確認。");
        return null;
      }
      const next = await refresh(true);
      return !leftModeRef.current && next?.rehearsal?.id === action.rehearsalId && next.checkedInAt ? next : null;
    } catch {
      if (version === generation.current) {
        await refresh(true);
        if (version === generation.current) setError("尚未確認操作，請重新檢查。");
      }
      return null;
    } finally {
      window.clearTimeout(timeout);
      if (writeRequest.current === controller) {
        writeRequest.current = null;
        if (version === generation.current) setPending(false);
      }
    }
  };

  return { available: Boolean(data?.rehearsal && !data.formalCheckIn), inMode, current, pending, checking, error, refresh, enter, leave, run };
}
