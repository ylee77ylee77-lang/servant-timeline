import type {
  AvatarConfig,
  AvatarGlassesStyle,
  AvatarHair,
  AvatarHairColor,
  AvatarStyle,
} from "./avatar.ts";

import { getAvatarLegacyEyewearChoice } from "./avatar-eyewear.ts";

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

type CharacterStyle = Exclude<AvatarStyle, "neutral">;

/** Locked original hair silhouette with individually checked pre-rendered black-hair variants.
 * Do not use these complete portraits as interchangeable v3 hair layers.
 */
export const AVATAR_CLASSIC_DARK_PORTRAITS = {
  masculine: {
    plain: "/avatar/scenes/v2-tones/male-dark.webp",
    glasses: "/avatar/scenes/v2-tones/male-dark-glasses.webp",
  },
  feminine: {
    plain: "/avatar/scenes/v2-tones/female-dark.webp",
    glasses: "/avatar/scenes/v2-tones/female-dark-glasses.webp",
  },
} as const satisfies Record<CharacterStyle, { plain: string; glasses: string }>;

export type ClassicHairTone = "brown" | "dark";
export const AVATAR_CLASSIC_HAIR_TONES = [
  { value: "brown", label: "深棕色" },
  { value: "dark", label: "黑色" },
] as const satisfies readonly { value: ClassicHairTone; label: string }[];

/** Old hairColor values were never rendered by v2. Require an explicit opt-in. */
export function getClassicHairTone(avatar: AvatarConfig): ClassicHairTone {
  return avatar.style !== "neutral" && avatar.portraitVersion === "v2-tone" && avatar.hairColor === "dark"
    ? "dark"
    : "brown";
}

export function selectClassicHairTone(avatar: AvatarConfig, tone: ClassicHairTone): AvatarConfig {
  if (avatar.style === "neutral") return avatar;
  return {
    ...avatar,
    portraitVersion: tone === "dark" ? "v2-tone" : undefined,
    hairColor: tone,
  };
}

type LayerAsset = `/avatar/scenes/v3/${string}.webp`;
type NonEmpty<T> = readonly [T, ...T[]];

export type AvatarHairArtwork = {
  value: AvatarHairColor;
  label: string;
  /** Already aligned to the common 512px portrait artboard. */
  back?: LayerAsset;
  front: LayerAsset;
};

export type AvatarHairChoice = {
  value: AvatarHair;
  label: string;
  colors: NonEmpty<AvatarHairArtwork>;
};

/**
 * Each approved family uses one matching 3D character rig and lighting.
 * All assets are pre-rendered transparent WebP, not CSS-drawn facial features.
 * The first hair and color entries are safe defaults for unsupported choices.
 */
export type AvatarPortraitFamily = {
  style: CharacterStyle;
  faceBody: LayerAsset;
  hairStyles: NonEmpty<AvatarHairChoice>;
  eyewear: Readonly<Partial<Record<AvatarGlassesStyle, LayerAsset>> & { classic: LayerAsset }>;
};

/**
 * P2 artwork release gate. Add only complete, visually reviewed families.
 * An empty catalog deliberately keeps the approved v2 portraits and controls.
 * Do not register placeholder paths or expose choices with missing artwork.
 */
export const AVATAR_LAYERED_PORTRAITS: readonly AvatarPortraitFamily[] = [];

export const AVATAR_GLASSES_LABELS: Record<AvatarGlassesStyle, string> = {
  classic: "原款",
  round: "圓框",
  square: "方框",
};

export type AvatarPortraitLayer = {
  kind: "legacy" | "tone-variant" | "hair-back" | "face-body" | "eyewear" | "hair-front";
  src: string;
};

/** Shared editor and renderer selection resolver; never constructs URLs from user input. */
export function getAvatarPortraitOptions(
  avatar: AvatarConfig,
  catalog: readonly AvatarPortraitFamily[] = AVATAR_LAYERED_PORTRAITS,
) {
  const family = catalog.find((item) => item.style === avatar.style);
  if (!family) return null;
  const hair = family.hairStyles.find((item) => item.value === avatar.hair) ?? family.hairStyles[0];
  const color = hair.colors.find((item) => item.value === avatar.hairColor) ?? hair.colors[0];
  const glassesStyle = avatar.glassesStyle && family.eyewear[avatar.glassesStyle]
    ? avatar.glassesStyle
    : "classic";
  return {
    family,
    hair,
    color,
    glassesStyle,
    active: avatar.portraitVersion === "v3",
    glassesStyles: (Object.keys(AVATAR_GLASSES_LABELS) as AvatarGlassesStyle[])
      .filter((style) => Boolean(family.eyewear[style])),
  };
}

/** An explicit choice only: legacy saved hair fields must never migrate the visible portrait. */
export function selectAvatarPortraitVersion(
  avatar: AvatarConfig,
  layered: boolean,
  catalog: readonly AvatarPortraitFamily[] = AVATAR_LAYERED_PORTRAITS,
): AvatarConfig {
  if (!layered) return avatar.portraitVersion === "v3" ? { ...avatar, portraitVersion: undefined } : avatar;
  const options = getAvatarPortraitOptions(avatar, catalog);
  if (!options) return avatar;
  return {
    ...avatar,
    portraitVersion: "v3",
    hair: options.hair.value,
    hairColor: options.color.value,
    glassesStyle: options.glassesStyle,
  };
}

export function getAvatarPortraitPlan(
  avatar: AvatarConfig,
  catalog: readonly AvatarPortraitFamily[] = AVATAR_LAYERED_PORTRAITS,
): { portrait: string | null; layers: AvatarPortraitLayer[] } {
  if (avatar.displayMode !== "custom" || avatar.style === "neutral") {
    return { portrait: null, layers: [] };
  }
  const options = getAvatarPortraitOptions(avatar, catalog);
  if (!options?.active) {
    const dark = getClassicHairTone(avatar) === "dark";
    const assets = dark ? AVATAR_CLASSIC_DARK_PORTRAITS[avatar.style] : AVATAR_PORTRAITS[avatar.style];
    const eyewear = getAvatarLegacyEyewearChoice(avatar);
    // Independent frames use the plain source; original settings retain exact art.
    const portrait = eyewear === "classic" ? assets.glasses : assets.plain;
    return { portrait, layers: [{ kind: dark ? "tone-variant" : "legacy", src: portrait }] };
  }
  const { family, color, glassesStyle } = options;
  const layers: AvatarPortraitLayer[] = [];
  if (color.back) layers.push({ kind: "hair-back", src: color.back });
  layers.push({ kind: "face-body", src: family.faceBody });
  if (avatar.glasses) {
    layers.push({ kind: "eyewear", src: family.eyewear[glassesStyle] ?? family.eyewear.classic });
  }
  layers.push({ kind: "hair-front", src: color.front });
  return { portrait: family.faceBody, layers };
}
