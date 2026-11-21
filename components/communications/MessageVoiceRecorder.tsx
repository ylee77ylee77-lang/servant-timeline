"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Play, Square, Trash2, X } from "lucide-react";
import {
  MAX_VOICE_NOTE_BYTES,
  MAX_VOICE_NOTE_SECONDS,
  baseMediaMime,
  extensionForVoiceMime,
  isVoiceMime,
  supportedRecordingMime,
} from "@/lib/communications/media-types";

type Props = {
  onClose: () => void;
  onSend: (file: File) => Promise<boolean>;
};

function timeLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MessageVoiceRecorder({ onClose, onSend }: Props) {
  const [phase, setPhase] = useState<"idle" | "recording" | "review" | "sending">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [draft, setDraft] = useState<File | null>(null);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const mountedRef = useRef(true);
  const discardRef = useRef(false);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      discardRef.current = true;
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") recorder.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!draft) return;
    const url = URL.createObjectURL(draft);
    // State change is deferred to avoid a synchronous effect update.
    const task = window.setTimeout(() => setPreviewUrl(url), 0);
    return () => {
      window.clearTimeout(task);
      URL.revokeObjectURL(url);
    };
  }, [draft]);

  const stopRecording = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") recorder.stop();
  };

  const record = async () => {
    if (phase !== "idle") return;
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("目前瀏覽器不支援語音錄製，請改用文字留言。");
      return;
    }

    try {
      // Request permission as a result of the explicit recording action.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mime = typeof MediaRecorder.isTypeSupported === "function"
        ? supportedRecordingMime(MediaRecorder.isTypeSupported.bind(MediaRecorder))
        : "";
      if (!mime) {
        stream.getTracks().forEach((track) => track.stop());
        setError("此裝置無法錄製相容的語音格式，請改用文字留言。");
        return;
      }
      streamRef.current = stream;
      discardRef.current = false;
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        discardRef.current = true;
        if (mountedRef.current) {
          setPhase("idle");
          setError("錄音中斷，請重新錄製。");
        }
        stopRecording();
      };
      recorder.onstop = () => {
        if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
        intervalRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        if (!mountedRef.current || discardRef.current) return;

        const durationMs = Date.now() - startedRef.current;
        if (durationMs > (MAX_VOICE_NOTE_SECONDS + 2) * 1000) {
          setError("錄音超過 60 秒，請重新錄製。");
          setPhase("idle");
          return;
        }
        const kind = baseMediaMime(recorder.mimeType || mime);
        const blob = new Blob(chunks, { type: kind });
        if (!isVoiceMime(kind) || !blob.size || blob.size > MAX_VOICE_NOTE_BYTES) {
          setError("語音內容無效或超過 4MB，請重新錄製。");
          setPhase("idle");
          return;
        }
        const extension = extensionForVoiceMime(kind);
        setDraft(new File([blob], `語音留言.${extension}`, { type: kind }));
        setPhase("review");
      };

      recorder.start();
      startedRef.current = Date.now();
      setElapsed(0);
      setPhase("recording");
      intervalRef.current = window.setInterval(() => {
        const seconds = Math.floor((Date.now() - startedRef.current) / 1000);
        setElapsed(Math.min(seconds, MAX_VOICE_NOTE_SECONDS));
        if (seconds >= MAX_VOICE_NOTE_SECONDS) stopRecording();
      }, 250);
    } catch (cause) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setPhase("idle");
      setError(cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "請先允許瀏覽器使用麥克風，才能錄製語音留言。"
        : "無法開始錄音，請確認麥克風設定。");
    }
  };

  const erase = () => {
    setPreviewUrl("");
    setDraft(null);
    setElapsed(0);
    setError("");
    setPhase("idle");
  };

  const send = async () => {
    if (!draft || phase !== "review") return;
    setError("");
    setPhase("sending");
    const sent = await onSend(draft).catch(() => false);
    if (sent) {
      onClose();
    } else {
      setError("語音留言傳送失敗，錄音已保留，可以重試。");
      setPhase("review");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 sm:items-center" role="dialog" aria-modal="true" aria-label="錄製語音留言">
      <div className="w-full max-w-md rounded-t-[28px] bg-white p-5 shadow-2xl sm:rounded-[28px]">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-[#1F2937]">語音留言</h2>
            <p className="mt-1 text-xs text-[#7B7B74]">最多 60 秒，錄完可先試聽再傳送</p>
          </div>
          <button type="button" onClick={onClose} disabled={phase === "sending"} aria-label="關閉錄音" className="rounded-full p-2 text-[#7B7B74] disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        {phase === "recording" ? (
          <div className="rounded-2xl bg-[#FFF2F4] p-5 text-center">
            <div className="text-xs font-bold text-[#D73A49]">● 錄音中</div>
            <div className="my-3 text-3xl font-black tabular-nums text-[#1F2937]">{timeLabel(elapsed)}</div>
            <button type="button" onClick={stopRecording} className="inline-flex items-center gap-2 rounded-full bg-[#D73A49] px-5 py-3 text-sm font-bold text-white">
              <Square className="h-4 w-4" /> 停止錄音
            </button>
          </div>
        ) : phase === "review" || phase === "sending" ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-[#FFF9F3] p-4">
              <p className="mb-2 text-xs font-bold text-[#7B7B74]">錄製完成 · {timeLabel(elapsed)}</p>
              {previewUrl ? <audio src={previewUrl} controls preload="metadata" className="w-full" /> : <div className="text-xs text-[#7B7B74]">準備試聽…</div>}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={erase} disabled={phase === "sending"} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-[#E6EAF0] px-3 py-3 text-sm font-bold text-[#7B7B74] disabled:opacity-40">
                <Trash2 className="h-4 w-4" /> 重錄
              </button>
              <button type="button" onClick={() => void send()} disabled={phase === "sending"} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[#6D55A3] px-3 py-3 text-sm font-bold text-white disabled:opacity-50">
                {phase === "sending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {phase === "sending" ? "傳送中" : "傳送語音"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => void record()} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#6D55A3] px-5 py-4 text-sm font-bold text-white">
            <Mic className="h-5 w-5" /> 開始錄音
          </button>
        )}
        {error && <p role="alert" className="mt-3 text-xs font-bold text-[#D73A49]">{error}</p>}
      </div>
    </div>
  );
}
