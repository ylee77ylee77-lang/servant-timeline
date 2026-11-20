"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { Eraser, Loader2, RotateCcw, Send, X } from "lucide-react";

type Point = { x: number; y: number };
type Stroke = Point[];

type Props = {
  onClose: () => void;
  onSend: (file: File) => Promise<boolean>;
};

const WIDTH = 900;
const HEIGHT = 540;

export function HandwritingComposer({ onClose, onSend }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activePointerRef = useRef<number | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const redraw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1F2937";
    ctx.fillStyle = "#1F2937";
    ctx.lineWidth = 6;
    for (const stroke of strokesRef.current) {
      if (!stroke.length) continue;
      if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, 3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        stroke.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      }
    }
  }, []);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const position = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) * WIDTH / rect.width)),
      y: Math.max(0, Math.min(HEIGHT, (event.clientY - rect.top) * HEIGHT / rect.height)),
    };
  };

  const begin = (event: PointerEvent<HTMLCanvasElement>) => {
    if (saving || activePointerRef.current !== null) return;
    event.preventDefault();
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    strokesRef.current.push([position(event)]);
    setHasInk(true);
    redraw();
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const last = strokesRef.current[strokesRef.current.length - 1];
    if (!last) return;
    last.push(position(event));
    redraw();
  };

  const end = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const undo = () => {
    strokesRef.current.pop();
    setHasInk(strokesRef.current.length > 0);
    redraw();
  };

  const clear = () => {
    strokesRef.current = [];
    setHasInk(false);
    redraw();
  };

  const send = async () => {
    if (!hasInk || saving || !canvasRef.current) return;
    setSaving(true);
    setError("");
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvasRef.current?.toBlob((output) => {
          if (output) resolve(output);
          else reject(new Error("圖片產生失敗"));
        }, "image/png");
      });
      const file = new File([blob], "手寫留言.png", { type: "image/png" });
      const sent = await onSend(file);
      if (sent) onClose();
      else setError("手寫留言傳送失敗，內容已保留，可以重試。");
    } catch {
      setError("目前無法傳送手寫留言，請重試。");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 sm:items-center" role="dialog" aria-modal="true" aria-label="手寫留言">
      <div className="w-full max-w-lg rounded-t-[28px] bg-white p-4 shadow-2xl sm:rounded-[28px]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-[#1F2937]">手寫留言</h2>
            <p className="text-xs text-[#7B7B74]">用手指或觸控筆書寫，會以圖片傳送</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="關閉手寫" className="rounded-full p-2 text-[#7B7B74] disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#D9DEE7] bg-white">
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            className="block w-full"
            style={{ touchAction: "none", aspectRatio: "5 / 3" }}
            aria-label="手寫區域"
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={undo} disabled={!hasInk || saving} className="flex items-center gap-1.5 rounded-xl border border-[#E6EAF0] px-3 py-2 text-xs font-bold text-[#7B7B74] disabled:opacity-40">
            <RotateCcw className="h-4 w-4" /> 復原
          </button>
          <button type="button" onClick={clear} disabled={!hasInk || saving} className="flex items-center gap-1.5 rounded-xl border border-[#E6EAF0] px-3 py-2 text-xs font-bold text-[#7B7B74] disabled:opacity-40">
            <Eraser className="h-4 w-4" /> 清除
          </button>
          <button type="button" onClick={() => void send()} disabled={!hasInk || saving} className="ml-auto flex items-center gap-1.5 rounded-xl bg-[#6D55A3] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {saving ? "傳送中" : "傳送手寫"}
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-xs font-bold text-[#D73A49]">{error}</p>}
      </div>
    </div>
  );
}
