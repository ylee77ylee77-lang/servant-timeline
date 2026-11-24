"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  AVATAR_COLOR_LABELS,
  AVATAR_COLOR_WHEEL_SIZE,
  avatarColorSelectionFromHex,
  getAvatarColorHex,
  minAvatarBrightness,
  normalizeAvatarColorSelection,
  rasterizeAvatarColorWheel,
  type AvatarColorHex,
  type AvatarColorPart,
  type AvatarColorSelection,
} from "@/lib/profile/avatar-color-wheel";

type Channel = Readonly<{ part: AvatarColorPart; original: AvatarColorHex }>;
type Draft = Readonly<Partial<Record<AvatarColorPart, AvatarColorSelection | null>>>;

function ColorWheel({
  channel,
  selection,
  onChange,
}: {
  channel: Channel;
  selection: AvatarColorSelection | null;
  onChange: (next: AvatarColorSelection | null) => void;
}) {
  const { part, original } = channel;
  const label = AVATAR_COLOR_LABELS[part];
  const current = normalizeAvatarColorSelection(part, selection ?? avatarColorSelectionFromHex(part, original));
  const { x, y, brightness } = current;
  const actualColor = selection ? getAvatarColorHex(part, current) : original;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Only redraw the disc when brightness or channel changes, not on every
  // pointer movement. Marker/preview update from the controlled local draft.
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const image = context.createImageData(AVATAR_COLOR_WHEEL_SIZE, AVATAR_COLOR_WHEEL_SIZE);
    image.data.set(rasterizeAvatarColorWheel(part, brightness));
    context.putImageData(image, 0, 0);
  }, [part, brightness]);

  function pick(event: PointerEvent<HTMLButtonElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    onChange(normalizeAvatarColorSelection(part, {
      x: (event.clientX - bounds.left) * 2 / bounds.width - 1,
      y: (event.clientY - bounds.top) * 2 / bounds.height - 1,
      brightness,
    }));
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 0.12 : 0.03;
    const delta: Record<string, readonly [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0],
      ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const movement = delta[event.key];
    if (!movement) return;
    event.preventDefault();
    onChange(normalizeAvatarColorSelection(part, { x: x + movement[0], y: y + movement[1], brightness }));
  }

  return (
    <div className="space-y-3 px-3 pb-4 pt-1">
      <div className="flex justify-center px-3 py-2">
        <button
          type="button"
          aria-label={`${label}漸層色輪，目前 ${actualColor}，可用方向鍵選色`}
          className="relative aspect-square w-full max-w-[220px] touch-none select-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6D55A3]"
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pick(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
          }}
          onKeyDown={onKeyDown}
        >
          <canvas ref={canvasRef} aria-hidden="true" width={AVATAR_COLOR_WHEEL_SIZE} height={AVATAR_COLOR_WHEEL_SIZE} className="block size-full rounded-full" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_#424242,0_1px_5px_#0005]"
            style={{ left: `${(x + 1) * 50}%`, top: `${(y + 1) * 50}%`, backgroundColor: getAvatarColorHex(part, current) }}
          />
        </button>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-xs font-bold text-[#52545B]">
        <span className="shrink-0">明暗</span>
        <input
          type="range"
          min={Math.round(minAvatarBrightness(part) * 100)}
          max={100}
          step={1}
          value={Math.round(brightness * 100)}
          aria-label={`${label}明暗`}
          className="min-w-0 flex-1 accent-[#6D55A3]"
          onChange={(event) => onChange(normalizeAvatarColorSelection(part, { x, y, brightness: Number(event.currentTarget.value) / 100 }))}
        />
        <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(brightness * 100)}%</span>
      </label>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#7B7B74]">{selection ? "自訂色彩" : "原色"}</span>
        <button type="button" disabled={!selection} onClick={() => onChange(null)} className="min-h-11 rounded-xl border border-[#E6EAF0] px-3 text-xs font-bold text-[#6D55A3] disabled:opacity-50">
          還原原色
        </button>
      </div>
    </div>
  );
}

/**
 * Shared, controlled UI for future registration/profile integration.
 * Parent may pass ONLY channels backed by visually approved material assets.
 * Deliberately not mounted in AvatarEditor while the runtime catalog is empty.
 * A null draft means "use the original source material", not a new color.
 */
export function AvatarColorControls({
  channels,
  values,
  onChange,
}: {
  channels: readonly Channel[];
  values: Draft;
  onChange: (part: AvatarColorPart, value: AvatarColorSelection | null) => void;
}) {
  const [openPart, setOpenPart] = useState<AvatarColorPart | null>(null);
  const id = useId();

  return (
    <div className="space-y-2">
      {channels.map((channel) => {
        const { part, original } = channel;
        const value = values[part] ?? null;
        const color = value ? getAvatarColorHex(part, value) : original;
        const open = part === openPart;
        const panelId = `${id}-${part}`;
        return (
          <section key={part} className="rounded-2xl border border-[#E6EAF0] bg-white">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpenPart((previous) => previous === part ? null : part)}
              className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-sm font-bold text-[#1F2937]"
            >
              <span className="flex-1">{AVATAR_COLOR_LABELS[part]}</span>
              <span aria-hidden="true" className="size-7 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: color }} />
              <span aria-hidden="true" className="text-[#6D55A3]">{open ? "−" : "+"}</span>
            </button>
            <div id={panelId} hidden={!open}>
              {open && <ColorWheel channel={channel} selection={value} onChange={(next) => onChange(part, next)} />}
            </div>
          </section>
        );
      })}
    </div>
  );
}
