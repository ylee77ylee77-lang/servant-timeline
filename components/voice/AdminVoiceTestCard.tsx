"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Volume2, X } from "lucide-react";
import {
  ADMIN_TEST_QUICK_LEAD_SECONDS,
  ADMIN_TEST_START_WAIT_SECONDS,
  createAdminVoiceTestPlan,
  getAdminVoiceTestDue,
  type AdminVoiceTestCue,
  type AdminVoiceTestPlan,
} from "@/lib/voice/admin-test-plan";
import { formatReminderLeadLabel } from "@/lib/voice/reminder-timing";

type VoiceDetailLevel = "simple" | "standard" | "detailed";
type VoiceProfile = "zephyr" | "iapetus";
type TestStage = "idle" | "preparing" | "waiting" | "completed" | "error";

type Props = {
  accessToken: string;
  voiceProfile: VoiceProfile;
  detailLevel: VoiceDetailLevel;
  configuredLeadSeconds: number;
  advanceEnabled: boolean;
  ontimeEnabled: boolean;
  buildSpeech: (cue: AdminVoiceTestCue, taskTime: string, title: string, detail: VoiceDetailLevel) => string;
};

type TestEvent = { cue: AdminVoiceTestCue; heardAt: string };

const formatClock = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString("zh-TW", {
    hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

export function AdminVoiceTestCard({
  accessToken, voiceProfile, detailLevel, configuredLeadSeconds,
  advanceEnabled, ontimeEnabled, buildSpeech,
}: Props) {
  const [mode, setMode] = useState<"quick" | "personal">("quick");
  const [taskTitle, setTaskTitle] = useState("準備迎接新朋友");
  const [stage, setStage] = useState<TestStage>("idle");
  const [notice, setNotice] = useState("非崇拜時間也能測試。所有音訊只供此裝置試聽，不會更改正式任務。");
  const [plan, setPlan] = useState<AdminVoiceTestPlan | null>(null);
  const [nextCueCountdown, setNextCueCountdown] = useState("");
  const [played, setPlayed] = useState<TestEvent[]>([]);

  const runRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const finishPlaybackRef = useRef<(() => void) | null>(null);
  const queuedRef = useRef<AdminVoiceTestCue[]>([]);
  const isPlayingRef = useRef(false);
  const scheduledRef = useRef({ advance: false, ontime: false });

  const stopResources = useCallback(() => {
    runRef.current += 1;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    queuedRef.current = [];
    scheduledRef.current = { advance: false, ontime: false };
    isPlayingRef.current = false;
    if (activeSourceRef.current) {
      const source = activeSourceRef.current;
      activeSourceRef.current = null;
      source.onended = null;
      try { source.stop(); } catch { /* Already stopped. */ }
      source.disconnect();
    }
    // Stop must also settle the pending playback promise after we detach
    // onended, or a canceled test can keep an async task suspended forever.
    const finish = finishPlaybackRef.current;
    finishPlaybackRef.current = null;
    finish?.();
  }, []);

  useEffect(() => {
    return () => {
      stopResources();
      const context = audioContextRef.current;
      audioContextRef.current = null;
      if (context) void context.close().catch(() => {});
    };
  }, [stopResources]);

  const cancel = () => {
    stopResources();
    setStage("idle");
    setPlan(null);
    setNextCueCountdown("");
    setNotice("已取消測試；正式報時及個人設定沒有改動。");
  };

  const start = async () => {
    if (stage === "preparing" || stage === "waiting") return;
    stopResources();
    const run = runRef.current;
    setStage("preparing");
    setPlayed([]);
    setPlan(null);
    setNextCueCountdown("");
    setNotice("正在啟用手機語音播放器…");

    try {
      const WindowAudioContext = window.AudioContext
        || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!WindowAudioContext) throw new Error("此裝置不支援語音播放器。");
      const context = audioContextRef.current || new WindowAudioContext();
      audioContextRef.current = context;
      // iOS audio must be unlocked directly by this user gesture.
      if (context.state !== "running") await context.resume();
      if (run !== runRef.current) return;
      if (context.state !== "running") throw new Error("手機未允許播放音訊。");

      const preSelected = mode === "quick"
        || (advanceEnabled && (configuredLeadSeconds > 0 || !ontimeEnabled));
      const nowSelected = mode === "quick" || ontimeEnabled;
      if (!preSelected && !nowSelected) {
        throw new Error("你的提前提醒與準點提醒都已關閉，請先啟用其中一項或選擇快速測試。");
      }

      const secondsBefore = mode === "quick"
        ? ADMIN_TEST_QUICK_LEAD_SECONDS
        : preSelected ? configuredLeadSeconds : 0;
      const testPlan = createAdminVoiceTestPlan(new Date(), secondsBefore);
      const selectedTitle = taskTitle.trim() || "服事任務";
      const speech: Record<AdminVoiceTestCue, string> = {
        advance: buildSpeech("advance", testPlan.taskTime, selectedTitle, detailLevel),
        ontime: buildSpeech("ontime", testPlan.taskTime, selectedTitle, detailLevel),
      };
      if (!speech.advance || !speech.ontime) throw new Error("無法建立測試語音。");

      scheduledRef.current = { advance: !preSelected, ontime: !nowSelected };
      setPlan(testPlan);
      setStage("waiting");
      setNotice("模擬任務已排程。請保持此頁面在前景，等待自動播報。");
      const queue = queuedRef;

      const playQueued = async () => {
        if (isPlayingRef.current || run !== runRef.current) return;
        isPlayingRef.current = true;
        try {
          while (queue.current.length > 0 && run === runRef.current) {
            const cue = queue.current.shift();
            if (!cue) continue;
            setNotice(cue === "advance" ? "提前提醒已觸發，正在產生語音…" : "準點提醒已觸發，正在產生語音…");

            const controller = new AbortController();
            abortRef.current = controller;
            const response = await fetch("/api/voice", {
              method: "POST",
              headers: {
                Authorization: "Bearer " + accessToken,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                text: speech[cue],
                voiceProfile,
                preview: true,
              }),
              signal: controller.signal,
            });
            if (!response.ok) {
              const payload = await response.json().catch(() => null);
              throw new Error(payload?.error || "雲端語音服務未能產生音檔。");
            }
            if (!(response.headers.get("Content-Type") || "").includes("audio/")) {
              throw new Error("雲端語音未傳回有效音檔。");
            }
            const bytes = await (await response.blob()).arrayBuffer();
            if (run !== runRef.current || controller.signal.aborted) return;
            const buffer = await context.decodeAudioData(bytes);
            if (run !== runRef.current) return;
            if (context.state !== "running") await context.resume();
            if (context.state !== "running") throw new Error("裝置阻擋了自動播放。");

            await new Promise<void>((resolve, reject) => {
              const source = context.createBufferSource();
              source.buffer = buffer;
              source.connect(context.destination);
              activeSourceRef.current = source;
              const finish = () => {
                source.onended = null;
                source.disconnect();
                if (activeSourceRef.current === source) activeSourceRef.current = null;
                if (finishPlaybackRef.current === finish) finishPlaybackRef.current = null;
                resolve();
              };
              finishPlaybackRef.current = finish;
              source.onended = finish;
              try { source.start(context.currentTime); }
              catch (error) {
                finishPlaybackRef.current = null;
                source.onended = null;
                source.disconnect();
                if (activeSourceRef.current === source) activeSourceRef.current = null;
                reject(error);
              }
            });
            if (run !== runRef.current) return;
            setPlayed((previous) => [...previous, { cue, heardAt: formatClock(Date.now()) }]);
            setNotice(cue === "advance" ? "提前提醒播放完成，等待準點提醒。" : "準點提醒播放完成。");
          }

          if (run === runRef.current && scheduledRef.current.advance
            && scheduledRef.current.ontime && queuedRef.current.length === 0) {
            setStage("completed");
            setNextCueCountdown("");
            setNotice("定時語音測試完成。兩種提醒各自依時間觸發，沒有寫入正式報時紀錄。");
          }
        } catch (error) {
          if (run !== runRef.current) return;
          const reason = error instanceof Error ? error.message : "語音播放失敗。";
          stopResources();
          setStage("error");
          setNextCueCountdown("");
          setNotice("測試未完成：" + reason + " 請檢查音量、靜音、藍牙耳機及網路連線。");
        } finally {
          if (run === runRef.current) {
            isPlayingRef.current = false;
            if (queuedRef.current.length > 0) void playQueued();
          }
        }
      };

      const tick = () => {
        if (run !== runRef.current) return;
        const time = new Date();
        const due = getAdminVoiceTestDue(time, testPlan);
        const nextAt = scheduledRef.current.advance
          ? testPlan.dueAt : testPlan.dueAt - secondsBefore * 1000;
        setNextCueCountdown(String(Math.max(0, Math.ceil((nextAt - time.getTime()) / 1000))) + " 秒");

        // Same priority as live reminders when advance is 0 seconds.
        if (nowSelected && !scheduledRef.current.ontime && due.ontime) {
          scheduledRef.current.ontime = true;
          queue.current.push("ontime");
          void playQueued();
        } else if (preSelected && !scheduledRef.current.advance && due.advance) {
          scheduledRef.current.advance = true;
          queue.current.push("advance");
          void playQueued();
        }
        if (scheduledRef.current.advance && scheduledRef.current.ontime) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
        } else if (time.getTime() > testPlan.dueAt + 3000) {
          stopResources();
          setStage("error");
          setNotice("測試時間已過但未觸發，可能是瀏覽器背景計時被暫停。請保持畫面開啟後重新測試。");
        }
      };

      timerRef.current = window.setInterval(tick, 250);
      tick();
    } catch (error) {
      if (run !== runRef.current) return;
      const reason = error instanceof Error ? error.message : "無法啟動測試。";
      stopResources();
      setStage("error");
      setNotice(reason);
    }
  };

  const busy = stage === "preparing" || stage === "waiting";
  const configuredLabel = formatReminderLeadLabel(
    Math.floor(configuredLeadSeconds / 60), configuredLeadSeconds % 60,
  );

  return (
    <section className="mt-4 rounded-[20px] border border-[#6D55A3]/15 bg-[#F9F7FF] p-4" aria-label="管理員即時語音測試">
      <h4 className="flex items-center gap-2 text-sm font-black text-[#1F2937]">
        <Clock3 className="h-4 w-4 text-[#6D55A3]" />
        管理員即時語音測試
      </h4>
      <p className="mt-2 text-xs font-medium leading-5 text-[#7B7B74]">
        平日也能測試自動提前與準點播報。使用同一套計時規則及任務播報文字；
        試音走管理員專屬 API，不影響報到、排程、正式提醒紀錄或其他同工。
      </p>

      <label htmlFor="admin-voice-test-title" className="mt-4 block text-xs font-bold text-[#1F2937]">
        模擬任務
      </label>
      <input
        id="admin-voice-test-title"
        value={taskTitle}
        onChange={(event) => setTaskTitle(event.target.value)}
        disabled={busy}
        maxLength={40}
        className="mt-1.5 min-h-11 w-full rounded-xl border border-[#E6EAF0] bg-white px-3 text-sm text-[#1F2937] disabled:opacity-60"
      />

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2" role="group" aria-label="測試時間選擇">
        <button
          type="button"
          onClick={() => setMode("quick")}
          disabled={busy}
          aria-pressed={mode === "quick"}
          className={"min-h-12 rounded-xl border px-3 py-2 text-left text-xs font-bold disabled:opacity-60 " +
            (mode === "quick" ? "border-[#6D55A3] bg-[#F0EAFE] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]")}
        >
          快速測試：15 秒提前
        </button>
        <button
          type="button"
          onClick={() => setMode("personal")}
          disabled={busy}
          aria-pressed={mode === "personal"}
          className={"min-h-12 rounded-xl border px-3 py-2 text-left text-xs font-bold disabled:opacity-60 " +
            (mode === "personal" ? "border-[#6D55A3] bg-[#F0EAFE] text-[#6D55A3]" : "border-[#E6EAF0] bg-white text-[#7B7B74]")}
        >
          依個人設定：提前 {configuredLabel}
        </button>
      </div>
      <p className="mt-2 text-[11px] leading-5 text-[#7B7B74]">
        {mode === "quick"
          ? "20 秒後播放提前提醒，再隔 15 秒播放準點提醒。兩種提醒都測試。"
          : "依目前的提醒開關及提前時間測試；若開啟提前提醒，20 秒後先播報，再於所設定的間隔後準點播報。"}
      </p>

      {plan && (
        <div className="mt-3 rounded-xl border border-[#E6EAF0] bg-white p-3 text-xs leading-6 text-[#1F2937]">
          <div>模擬任務時間：<strong>{formatClock(plan.dueAt)}</strong></div>
          <div>提前提醒時間：{formatClock(plan.dueAt - plan.leadSeconds * 1000)}</div>
          {nextCueCountdown && <div>下一次觸發倒數：<strong>{nextCueCountdown}</strong></div>}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void start()}
          disabled={busy}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#6D55A3] px-3 text-sm font-black text-white disabled:opacity-50"
        >
          <Volume2 className="h-4 w-4" />
          {stage === "preparing" ? "準備中…" : "開始定時測試"}
        </button>
        {busy && (
          <button
            type="button"
            onClick={cancel}
            className="flex min-h-11 items-center justify-center gap-1 rounded-xl border border-[#E6EAF0] bg-white px-3 text-xs font-bold text-[#7B7B74]"
          >
            <X className="h-4 w-4" />取消
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className="mt-3 text-xs font-bold leading-5 text-[#6D55A3]">
        {notice}
      </p>
      {played.length > 0 && (
        <div className="mt-2 text-[11px] leading-5 text-[#7B7B74]">
          {played.map((event) => (
            <div key={event.cue}>{event.cue === "advance" ? "提前提醒" : "準點提醒"}：{event.heardAt} 已完成播放</div>
          ))}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-5 text-[#7B7B74]">
        iPhone 請保持畫面在前景。預覽語音仍有網路合成延遲，音檔播放時間可能晚於觸發時間。
      </p>
    </section>
  );
}
