import { normalizeAvatarConfig, type AvatarConfig, type AvatarPet } from "./avatar.ts";
import { AVATAR_ICON_TONES } from "./avatar-icon.ts";

/**
 * Stable, versioned full-canvas artwork contract.
 * Every asset is a 512x512 transparent WebP aligned to this same artboard.
 * The canvas, NOT per-device CSS offsets, determines where the animal rests.
 * Only existing animal head/upper-body artwork is rendered; feet are not drawn.
 */
export const AVATAR_CANVAS_SIZE = 512;
export const AVATAR_FRAME = Object.freeze({ cx: 256, cy: 256, radius: 236, stroke: 16 });
/** One safe portrait frame for all 3D people and all display sizes. */
export const AVATAR_PORTRAIT_BOUNDS = Object.freeze({ x: 20, y: 28, size: 472 });
/** Shared head-only view into the existing lower-left companion imagery. */
export const AVATAR_COMPANION_THUMBNAIL = Object.freeze({
  x: 0, y: 185, width: 225, height: 230,
});
export const AVATAR_LAYER_ORDER = [
  "background",
  "portrait",
  "companion-behind-frame",
  "white-frame",
] as const;

export const AVATAR_ART_DIR = "/avatar/scenes/v2";

export const AVATAR_PORTRAITS = {
  masculine: {
    plain: `${AVATAR_ART_DIR}/male.webp`,
    glasses: `${AVATAR_ART_DIR}/male-glasses.webp`,
  },
  feminine: {
    plain: `${AVATAR_ART_DIR}/female.webp`,
    glasses: `${AVATAR_ART_DIR}/female-glasses.webp`,
  },
} as const;

export type CompanionKind = Exclude<AvatarPet, "none">;

export const AVATAR_COMPANIONS: Record<CompanionKind, {
  name: string;
  behind: string;
}> = {
  sheep: {
    name: "綿羊",
    behind: `${AVATAR_ART_DIR}/sheep-behind.webp`,
  },
  doe: {
    name: "母鹿",
    behind: `${AVATAR_ART_DIR}/doe-behind.webp`,
  },
  lion: {
    name: "獅子",
    behind: `${AVATAR_ART_DIR}/lion-behind.webp`,
  },
  eagle: {
    name: "老鷹",
    behind: `${AVATAR_ART_DIR}/eagle-behind.webp`,
  },
};

export type AvatarGradient = { from: string; middle: string; to: string };
export const AVATAR_BACKGROUNDS: Record<AvatarConfig["background"], AvatarGradient> = {
  lavender: { from: "#FAF7FF", middle: "#E4D9FC", to: "#C8B5EF" },
  peach: { from: "#FFF7F0", middle: "#FBE2D6", to: "#F0C8BB" },
  mint: { from: "#F5FFFA", middle: "#D6F2E6", to: "#BCE2D1" },
  sky: { from: "#F5FAFF", middle: "#D9EEFF", to: "#B4D8F5" },
  sand: { from: "#FFFCF5", middle: "#F8E8D1", to: "#E9D1AE" },
};

export function getAvatarScene(input: unknown) {
  const avatar = normalizeAvatarConfig(input);
  // Neutral means the user has not selected a base portrait.
  const custom = avatar.displayMode === "custom";
  const base = custom && avatar.style !== "neutral" ? avatar.style : null;
  const portraits = base ? AVATAR_PORTRAITS[base] : null;
  const companion = custom && avatar.pet !== "none" ? AVATAR_COMPANIONS[avatar.pet] : null;
  return {
    avatar,
    portrait: portraits ? (avatar.glasses ? portraits.glasses : portraits.plain) : null,
    companion,
    gradient: avatar.displayMode === "default"
      ? AVATAR_ICON_TONES[avatar.iconTone].gradient
      : AVATAR_BACKGROUNDS[custom ? avatar.background : "lavender"],
  };
}