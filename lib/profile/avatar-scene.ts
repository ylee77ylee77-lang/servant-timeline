import { normalizeAvatarConfig, type AvatarConfig, type AvatarPet } from "./avatar.ts";

/**
 * Stable, versioned full-canvas artwork contract.
 * Every asset is a 512x512 transparent WebP aligned to this same artboard.
 * The canvas, NOT per-device CSS offsets, determines where the animal rests.
 * Only existing animal head/upper-body artwork is rendered; feet are not drawn.
 */
export const AVATAR_CANVAS_SIZE = 512;
export const AVATAR_FRAME = Object.freeze({ cx: 256, cy: 256, radius: 236, stroke: 16 });
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
  const base = avatar.style === "neutral" ? null : avatar.style;
  const portraits = base ? AVATAR_PORTRAITS[base] : null;
  const companion = avatar.pet === "none" ? null : AVATAR_COMPANIONS[avatar.pet];
  return {
    avatar,
    portrait: portraits ? (avatar.glasses ? portraits.glasses : portraits.plain) : null,
    companion,
    gradient: AVATAR_BACKGROUNDS[avatar.background],
  };
}