"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { Eraser, Loader2, RotateCcw, Send, X } from "lucide-react";
import {
  canvasPointFromClient,
  type DrawingBounds,
  type DrawingPoint,
} from "@/lib/communications/handwriting-canvas";

type Stroke = DrawingPoint[];

type Props = {
  onClose: () => void;
  onSend: (file: File) => Promise<boolean>;
};

const WIDTH = 900;
const HEIGHT = 540;
const PEN_WIDTH = 6;

// A portal renders only after hydration; SSR and the first hydrated render
// agree (null), so the modal does not cause a hydration mismatch.
const noopSubscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function HandwritingComposer({ onClose, onSend }: Props) {
  const ready = useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const activePointerRef = useRef<number | null>(null);
  const strokeBoundsRef = useRef<DrawingBounds | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const preparePen = (ctx: CanvasRenderingContext2D) => {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1F2937";
    ctx.fillStyle = "#1F2937";
    ctx.lineWidth = PEN_WIDTH;
  };

  const drawDot = (point: DrawingPoint) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    preparePen(ctx);
    ctx.beginPath();
    ctx.arc(point.x, point.y, PEN_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const drawSegment = (from: DrawingPoint, to: DrawingPoint) => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    preparePen(ctx);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const redraw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1F2937";
    ctx.fillStyle = "#1F2937";
    ctx.lineWidth = PEN_WIDTH;

    for (const stroke of strokesRef.current) {
      if (!stroke.length) continue;
      if (stroke.length === 1) {
        ctx.beginPath();
        ctx.arc(stroke[0].x, stroke[0].y, PEN_WIDTH / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    redraw();
  }, [ready, redraw]);

  useEffect(() => {
    if (!ready) return;

    // This composer used to live under the application's overflow-hidden
    // container. It now portals to body and freezes the background page,
    // preventing rubber-band/page scrolling from moving the drawing surface.
    const body = document.body;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const old = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      rootOverflow: root.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    root.style.overflow = "hidden";

    const canvas = canvasRef.current;
    // iOS Safari sometimes treats a finger drag as page scrolling even when
    // the canvas has touch-action:none. Use a non-passive native listener as
    // a focused fallback, without blocking taps on dialog controls.
    const blockCanvasScroll = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault();
    };
    canvas?.addEventListener("touchstart", blockCanvasScroll, { passive: false });
    canvas?.addEventListener("touchmove", blockCanvasScroll, { passive: false });

    return () => {
      canvas?.removeEventListener("touchstart", blockCanvasScroll);
      canvas?.removeEventListener("touchmove", blockCanvasScroll);
      body.style.position = old.position;
      body.style.top = old.top;
      body.style.left = old.left;
      body.style.right = old.right;
      body.style.width = old.width;
      body.style.overflow = old.overflow;
      root.style.overflow = old.rootOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [ready]);

  const pointFor = (event: PointerEvent<HTMLCanvasElement>) => {
    const bounds = strokeBoundsRef.current ?? event.currentTarget.getBoundingClientRect();
    return canvasPointFromClient(event.clientX, event.clientY, bounds, WIDTH, HEIGHT);
  };

  const begin = (event: PointerEvent<HTMLCanvasElement>) => {
    if (saving || !event.isPrimary || activePointerRef.current !== null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    strokeBoundsRef.current = event.currentTarget.getBoundingClientRect();
    const point = pointFor(event);
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    strokesRef.current.push([point]);
    setHasInk(true);
    drawDot(point);
  };

  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    const stroke = strokesRef.current[strokesRef.current.length - 1];
    if (!stroke?.length) return;
    const previous = stroke[stroke.length - 1];
    const point = pointFor(event);
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.5) return;
    stroke.push(point);
    // Draw only the new segment. Repainting the entire canvas on every touch
    // move made long handwritten messages increasingly slow on phones.
    drawSegment(previous, point);
  };

  const end = (event: PointerEvent<HTMLCanvasElement>) => {
    if (activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    strokeBoundsRef.current = null;
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

  if (!ready) return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/45 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="手寫留言"
    >
      <div className="max-h-[calc(100dvh-0.75rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[28px] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[28px]">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-[#1F2937]">手寫留言</h2>
            <p className="text-xs text-[#7B7B74]">可畫字或示意圖，傳送後直接顯示在聊天中</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="關閉手寫" className="rounded-full p-2 text-[#7B7B74] disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#D9DEE7] bg-white" style={{ touchAction: "none" }}>
          <canvas
            ref={canvasRef}
            width={WIDTH}
            height={HEIGHT}
            className="block w-full select-none"
            draggable={false}
            style={{ touchAction: "none", aspectRatio: "5 / 3", userSelect: "none", WebkitUserSelect: "none" }}
            aria-label="手寫區域"
            onPointerDown={begin}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onLostPointerCapture={() => {
              activePointerRef.current = null;
              strokeBoundsRef.current = null;
            }}
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
    </div>,
    document.body
  );
}
