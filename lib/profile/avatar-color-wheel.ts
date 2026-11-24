/** Pure, local draft color-wheel math. No renderer or persistence changes.
 * HSV hue is red at the top, clockwise; saturation is distance from the
 * center. Skin uses a continuous warm-color disc (no rainbow wrap seam).
 * Its provisional gamut must be visually approved with the source art.
 */
export type AvatarColorPart = "hair" | "skin" | "frame";
export type AvatarColorHex = `#${string}`;
export type AvatarColorSelection = Readonly<{
  x: number;
  y: number;
  brightness: number;
}>;

export const AVATAR_COLOR_LABELS: Record<AvatarColorPart, string> = {
  hair: "髮色",
  skin: "膚色",
  frame: "鏡框色",
};

export const AVATAR_COLOR_WHEEL_SIZE = 192;
const SKIN = { hueMin: 15, hueMax: 43, saturationMin: 0.16, saturationMax: 0.72, brightnessMin: 0.30 } as const;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
const interpolate = (min: number, max: number, fraction: number) => min + (max - min) * fraction;

export function minAvatarBrightness(part: AvatarColorPart) {
  return part === "skin" ? SKIN.brightnessMin : 0;
}

export function normalizeAvatarColorSelection(part: AvatarColorPart, value: AvatarColorSelection): AvatarColorSelection {
  let x = finite(value.x, 0);
  let y = finite(value.y, 0);
  // Bound components before hypot to avoid overflow for malformed inputs.
  const largest = Math.max(1, Math.abs(x), Math.abs(y));
  x /= largest;
  y /= largest;
  const radius = Math.hypot(x, y);
  if (radius > 1) {
    x /= radius;
    y /= radius;
  }
  return {
    x, y,
    brightness: clamp(finite(value.brightness, 1), minAvatarBrightness(part), 1),
  };
}

function hsvForSelection(part: AvatarColorPart, selection: AvatarColorSelection) {
  const { x, y, brightness } = normalizeAvatarColorSelection(part, selection);
  if (part === "skin") {
    return {
      h: interpolate(SKIN.hueMin, SKIN.hueMax, (x + 1) / 2),
      s: interpolate(SKIN.saturationMin, SKIN.saturationMax, (y + 1) / 2),
      v: brightness,
    };
  }
  return {
    h: (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360,
    s: Math.min(1, Math.hypot(x, y)),
    v: brightness,
  };
}

function rgbForSelection(part: AvatarColorPart, selection: AvatarColorSelection): [number, number, number] {
  const { h, s, v } = hsvForSelection(part, selection);
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return [f(5), f(3), f(1)];
}

export function getAvatarColorHex(part: AvatarColorPart, selection: AvatarColorSelection): AvatarColorHex {
  return `#${rgbForSelection(part, selection).map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** For opening a picker with its source color; does not apply an override. */
export function avatarColorSelectionFromHex(part: AvatarColorPart, hex: AvatarColorHex): AvatarColorSelection {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Invalid avatar color");
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const v = Math.max(r, g, b);
  const d = v - Math.min(r, g, b);
  const s = v === 0 ? 0 : d / v;
  let h = 0;
  if (d > 0) {
    h = 60 * (v === r ? (g - b) / d : v === g ? (b - r) / d + 2 : (r - g) / d + 4);
    h = (h + 360) % 360;
  }
  if (part === "skin") {
    return normalizeAvatarColorSelection(part, {
      x: 2 * (clamp(h, SKIN.hueMin, SKIN.hueMax) - SKIN.hueMin) / (SKIN.hueMax - SKIN.hueMin) - 1,
      y: 2 * (clamp(s, SKIN.saturationMin, SKIN.saturationMax) - SKIN.saturationMin) / (SKIN.saturationMax - SKIN.saturationMin) - 1,
      brightness: v,
    });
  }
  const angle = h * Math.PI / 180;
  return normalizeAvatarColorSelection(part, { x: Math.sin(angle) * s, y: -Math.cos(angle) * s, brightness: v });
}

/** One math path for both display and pointer selection, no CSS hue mismatch. */
export function rasterizeAvatarColorWheel(part: AvatarColorPart, brightness: number, size = AVATAR_COLOR_WHEEL_SIZE): Uint8ClampedArray {
  if (!Number.isInteger(size) || size < 2 || size > 256) throw new Error("Invalid color wheel size");
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = (col + 0.5) * 2 / size - 1;
      const y = (row + 0.5) * 2 / size - 1;
      if (Math.hypot(x, y) > 1) continue;
      const [r, g, b] = rgbForSelection(part, { x, y, brightness });
      const i = (row * size + col) * 4;
      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = 255;
    }
  }
  return pixels;
}
