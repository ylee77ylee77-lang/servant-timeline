import { normalizeAvatarConfig, type AvatarConfig, type AvatarPet } from "./avatar.ts";

/**
 * Stable, versioned full-canvas artwork contract.
 * Every asset is a 512x512 transparent WebP aligned to this same artboard.
 * The canvas, NOT per-device CSS offsets, determines how animals touch the frame.
 */
export const AVATAR_CANVAS_SIZE = 512;
export const AVATAR_FRAME = Object.freeze({ cx: 256, cy: 256, radius: 236, stroke: 16 });
export const AVATAR_LAYER_ORDER = [
  "background",
  "portrait",
  "companion-behind-frame",
  "white-frame",
  "companion-in-front-of-frame",
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
  inFront: string;
}> = {
  sheep: {
    name: "綿羊",
    behind: `${AVATAR_ART_DIR}/sheep-behind.webp`,
    inFront: `${AVATAR_ART_DIR}/sheep-front.webp`,
  },
  doe: {
    name: "母鹿",
    behind: `${AVATAR_ART_DIR}/doe-behind.webp`,
    inFront: `${AVATAR_ART_DIR}/doe-front.webp`,
  },
  lion: {
    name: "獅子",
    behind: `${AVATAR_ART_DIR}/lion-behind.webp`,
    inFront: `${AVATAR_ART_DIR}/lion-front.webp`,
  },
  eagle: {
    name: "老鷹",
    behind: `${AVATAR_ART_DIR}/eagle-behind.webp`,
    inFront: `${AVATAR_ART_DIR}/eagle-front.webp`,
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
  // Existing neutral profiles retain their historical fallback appearance.
  const base = avatar.style === "feminine" ? "feminine" : "masculine";
  const portraits = AVATAR_PORTRAITS[base];
  const companion = avatar.pet === "none" ? null : AVATAR_COMPANIONS[avatar.pet];
  return {
    avatar,
    portrait: avatar.glasses ? portraits.glasses : portraits.plain,
    companion,
    gradient: AVATAR_BACKGROUNDS[avatar.background],
  };
}