"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AvatarOptionCard } from "@/components/profile/AvatarOptionCard";
import {
  AVATAR_COLOR_LABELS,
  AVATAR_COLOR_WHEEL_SIZE,
  avatarColorSelectionFromHex,
  getAvatarColorHex,
  minAvatarBrightness,
  normalizeAvatarColorSelection,
  rasterizeAvatarColorWheel,
  type AvatarColorHex,
  type AvatarPickerPart,
  type AvatarColorSelection,
} from "@/lib/profile/avatar-color-wheel";

export type AvatarColorChannel = Readonly<{ part: AvatarPickerPart; original: AvatarColorHex }>;
type ColorValues = Readonly<Partial<Record<AvatarPickerPart, AvatarColorHex>>>;
type DraftCache = Partial<Record<AvatarPickerPart, Readonly<{
  color: AvatarColorHex;
  selection: AvatarColorSelection;
}>>>;

function ColorWheel({
  channel,
  color,
  custom,
  selection,
  onChange,
}: {
  channel: AvatarColorChannel;
  color: AvatarColorHex;
  custom: boolean;
  selection: AvatarColorSelection;
  onChange: (next: AvatarColorSelection | null) => void;
}) {
  const { part } = channel;
  const label = AVATAR_COLOR_LABELS[part];
  const current = normalizeAvatarColorSelection(part, selection);
  const { x, y, brightness } = current;
  const saturation = Math.min(1, Math.hypot(x, y));
  const hue = saturation > 0 ? (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360 : 0;
  const hueDegrees = Math.min(359, Math.round(hue));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detailsRef = useRef<HTMLDetailsElement>(null);

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
          aria-label={`${label}漸層色輪，目前 ${color}，可用方向鍵選色或啟用精細調整`}
          className="relative aspect-square w-full max-w-[220px] touch-none select-none rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6D55A3]"
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            pick(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) pick(event);
          }}
          onClick={(event) => {
            // Keyboard and assistive-technology activation expose native
            // sliders; pointer selection continues to use the disc itself.
            if (event.detail === 0 && detailsRef.current) detailsRef.current.open = true;
          }}
          onKeyDown={onKeyDown}
        >
          <canvas ref={canvasRef} aria-hidden="true" width={AVATAR_COLOR_WHEEL_SIZE} height={AVATAR_COLOR_WHEEL_SIZE} className="block size-full rounded-full" />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_1px_#424242,0_1px_5px_#0005]"
            style={{ left: `${(x + 1) * 50}%`, top: `${(y + 1) * 50}%`, backgroundColor: color }}
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
      <details ref={detailsRef} className="rounded-xl border border-[#E6EAF0] px-3">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-bold text-[#6D55A3]">精細調整</summary>
        <div className="space-y-1 pb-2">
          <label className="flex min-h-11 items-center gap-3 text-xs font-bold text-[#52545B]">
            <span className="shrink-0">{part === "skin" ? "冷暖" : "色相"}</span>
            <input
              type="range"
              min={0}
              max={part === "skin" ? 100 : 359}
              step={1}
              value={part === "skin" ? Math.round((x + 1) * 50) : hueDegrees}
              aria-label={`${label}${part === "skin" ? "冷暖" : "色相"}`}
              aria-valuetext={part === "skin" ? `${Math.round((x + 1) * 50)}%，由紅潤至暖黃` : `${hueDegrees} 度`}
              className="min-w-0 flex-1 accent-[#6D55A3]"
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (part === "skin") {
                  onChange(normalizeAvatarColorSelection(part, { x: next / 50 - 1, y, brightness }));
                } else {
                  const angle = next * Math.PI / 180;
                  // Retain the chosen hue at visually zero saturation so
                  // raising saturation afterwards uses this hue, not red.
                  const radius = Math.max(saturation, 1e-9);
                  onChange(normalizeAvatarColorSelection(part, { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius, brightness }));
                }
              }}
            />
            <span className="w-9 shrink-0 text-right tabular-nums">{part === "skin" ? `${Math.round((x + 1) * 50)}%` : `${hueDegrees}°`}</span>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-xs font-bold text-[#52545B]">
            <span className="shrink-0">濃淡</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={part === "skin" ? Math.round((y + 1) * 50) : Math.round(saturation * 100)}
              aria-label={`${label}飽和度`}
              className="min-w-0 flex-1 accent-[#6D55A3]"
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (part === "skin") {
                  onChange(normalizeAvatarColorSelection(part, { x, y: next / 50 - 1, brightness }));
                } else {
                  const angle = hue * Math.PI / 180;
                  const radius = Math.max(next / 100, 1e-9);
                  onChange(normalizeAvatarColorSelection(part, { x: Math.sin(angle) * radius, y: -Math.cos(angle) * radius, brightness }));
                }
              }}
            />
            <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(part === "skin" ? (y + 1) * 50 : saturation * 100)}%</span>
          </label>
        </div>
      </details>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#7B7B74]">{custom ? "自訂色彩" : "原色"}</span>
        <button type="button" disabled={!custom} onClick={() => onChange(null)} className="min-h-11 rounded-xl border border-[#E6EAF0] px-3 text-xs font-bold text-[#6D55A3] disabled:opacity-50">
          還原原色
        </button>
      </div>
    </div>
  );
}

/**
 * Shared RGB controls for registration/profile. The parent passes only channels
 * supported by the current portrait. Unset RGB means the exact source artwork.
 * Preserve local disc coordinates while their RGB still matches the controlled
 * value, including hue/saturation while brightness is zero. Opening a picker
 * never writes or reprojects a saved color.
 */
export function AvatarColorControls({
  channels,
  values,
  onChange,
  lensTransparency,
  openPart,
  onTogglePart,
}: {
  channels: readonly AvatarColorChannel[];
  values: ColorValues;
  onChange: (part: AvatarPickerPart, value: AvatarColorHex | null) => void;
  lensTransparency?: {value:number;custom:boolean;onChange:(value:number)=>void;onReset:()=>void};
  openPart: AvatarPickerPart | null;
  onTogglePart: (part: AvatarPickerPart) => void;
}) {
  // Controlled by the editor, so opening a color closes every other option card.
  const [drafts, setDrafts] = useState<DraftCache>({});
  const id = useId();

  function changeColor(part: AvatarPickerPart, next: AvatarColorSelection | null) {
    if (next === null) {
      setDrafts((previous) => {
        const updated = { ...previous };
        delete updated[part];
        return updated;
      });
      onChange(part, null);
      return;
    }
    const selection = normalizeAvatarColorSelection(part, next);
    const color = getAvatarColorHex(part, selection);
    setDrafts((previous) => ({ ...previous, [part]: { color, selection } }));
    onChange(part, color);
  }

  return (
    <>
      {channels.map((channel) => {
        const {part,original}=channel;
        const value=values[part];
        const color=value??original;
        const cached=drafts[part];
        const open=part===openPart;
        const summary=part==="lens"&&lensTransparency
          ? `${lensTransparency.value}% 透明`
          : value===undefined?"原色":"自訂色彩";
        return (
          <AvatarOptionCard key={part} title={AVATAR_COLOR_LABELS[part]} summary={summary}
            expanded={open} onToggle={()=>onTogglePart(part)}>
            <ColorWheel channel={channel} color={color} custom={value!==undefined}
              selection={value!==undefined&&cached?.color===value?cached.selection:avatarColorSelectionFromHex(part,color)}
              onChange={next=>changeColor(part,next)}/>
            {part==="lens"&&lensTransparency&&(
              <div className="space-y-1.5 border-t border-[#E6EAF0] px-3 pb-3 pt-2">
                <label className="flex items-center justify-between gap-2 text-sm font-bold text-[#1F2937]" htmlFor={`${id}-lens-transparency`}>
                  鏡片透明度 <span className="tabular-nums text-[#6D55A3]">{lensTransparency.value}%</span>
                </label>
                <input id={`${id}-lens-transparency`} type="range" min={0} max={100} step={5} value={lensTransparency.value}
                  className="h-8 w-full accent-[#6D55A3]" onChange={event=>lensTransparency.onChange(Number(event.currentTarget.value))}/>
                <div className="flex justify-between text-xs text-[#7B7B74]"><span>不透明</span><span>完全透明</span></div>
                {lensTransparency.value===100&&<p className="text-xs text-[#7B7B74]">降低透明度即可顯示鏡片色。</p>}
                <button type="button" disabled={!lensTransparency.custom} onClick={lensTransparency.onReset}
                  className="min-h-11 rounded-xl border border-[#E6EAF0] px-3 text-xs font-bold text-[#6D55A3] disabled:opacity-50">還原透明鏡片</button>
              </div>
            )}
          </AvatarOptionCard>
        );
      })}
    </>
  );
}
