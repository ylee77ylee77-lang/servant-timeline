import type {
  AvatarConfig,
  AvatarFamilyId,
  AvatarGlassesStyle,
  AvatarHair,
  AvatarHairColor,
  AvatarStyle,
} from "./avatar.ts";

import type { AvatarColorHex, AvatarColorPart } from "./avatar-color-wheel.ts";
import { AVATAR_FAMILY_STYLES } from "./avatar.ts";
import { getAvatarHairstyle } from "./avatar-hairstyle.ts";
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
export type AvatarLayerMaterial = Readonly<{
  part: AvatarColorPart;
  original: AvatarColorHex;
  coverageUri: `/avatar/materials/v3/${string}.png`;
  sourceSha256: string;
  coverageSha256: string;
}>;
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
  id: AvatarFamilyId;
  label: string;
  style: CharacterStyle;
  faceBody: LayerAsset;
  hairStyles: NonEmpty<AvatarHairChoice>;
  eyewear: Readonly<Partial<Record<AvatarGlassesStyle, LayerAsset>> & { classic: LayerAsset }>;
  materials: Readonly<Partial<Record<LayerAsset, AvatarLayerMaterial>>>;
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
  kind: "legacy" | "tone-variant" | "hairstyle" | "hair-back" | "face-body" | "eyewear" | "hair-front";
  src: string;
};

/** Explicit same-style family selection. Profile values never become paths. */
export function getAvatarPortraitOptions(
  avatar: AvatarConfig,
  catalog: readonly AvatarPortraitFamily[] = AVATAR_LAYERED_PORTRAITS,
) {
  const families = catalog.filter(item => item.style === avatar.style && AVATAR_FAMILY_STYLES[item.id] === avatar.style);
  const selected = families.find(item => item.id === avatar.portraitFamily?.id);
  const family = selected ?? families[0];
  if (!family) return null;
  const hair = family.hairStyles.find(item => item.value === (selected ? avatar.portraitFamily?.hair : avatar.hair))
    ?? family.hairStyles[0];
  const color = hair.colors[0];
  const requested = selected ? avatar.portraitFamily?.glassesStyle : avatar.glassesStyle;
  const glassesStyle = requested && family.eyewear[requested] ? requested : "classic";
  return { family, families, hair, color, glassesStyle, active: selected !== undefined,
    glassesStyles: (Object.keys(AVATAR_GLASSES_LABELS) as AvatarGlassesStyle[]).filter(style => Boolean(family.eyewear[style])) };
}

export function selectAvatarPortraitFamily(avatar: AvatarConfig, id: AvatarFamilyId,
  catalog: readonly AvatarPortraitFamily[] = AVATAR_LAYERED_PORTRAITS): AvatarConfig {
  const family = catalog.find(item => item.id === id && item.style === avatar.style && AVATAR_FAMILY_STYLES[id] === avatar.style);
  if (!family) return avatar;
  const hair = family.hairStyles.find(item => item.value === (avatar.portraitFamily?.hair ?? avatar.hair)) ?? family.hairStyles[0];
  const previous = avatar.portraitFamily?.glassesStyle ?? avatar.glassesStyle;
  const glassesStyle = previous && family.eyewear[previous] ? previous : "classic";
  const next = { ...avatar, portraitFamily: { id, hair: hair.value, glassesStyle } };
  delete next.hairstyleVariant;
  return next;
}

export function selectAvatarPortraitVersion(avatar: AvatarConfig, layered: boolean,
  catalog: readonly AvatarPortraitFamily[] = AVATAR_LAYERED_PORTRAITS): AvatarConfig {
  if (!layered) {
    const next = { ...avatar };
    delete next.portraitFamily;
    return next;
  }
  const options = getAvatarPortraitOptions(avatar, catalog);
  return options ? selectAvatarPortraitFamily(avatar, options.family.id, catalog) : avatar;
}

export function selectAvatarFamilyHair(avatar: AvatarConfig, hair: AvatarHair,
  catalog: readonly AvatarPortraitFamily[] = AVATAR_LAYERED_PORTRAITS): AvatarConfig {
  const options = getAvatarPortraitOptions(avatar, catalog);
  if (!options?.active || !avatar.portraitFamily || !options.family.hairStyles.some(item => item.value === hair)) return avatar;
  return { ...avatar, portraitFamily: { ...avatar.portraitFamily, hair } };
}

export function selectAvatarFamilyGlasses(avatar: AvatarConfig, style: AvatarGlassesStyle | "none",
  catalog: readonly AvatarPortraitFamily[] = AVATAR_LAYERED_PORTRAITS): AvatarConfig {
  const options = getAvatarPortraitOptions(avatar, catalog);
  if (!options?.active || !avatar.portraitFamily) return avatar;
  if (style === "none") return { ...avatar, glasses: false };
  if (!options.glassesStyles.includes(style)) return avatar;
  return { ...avatar, glasses: true, portraitFamily: { ...avatar.portraitFamily, glassesStyle: style } };
}

export function getAvatarLayerMaterial(src: string,
  catalog: readonly AvatarPortraitFamily[] = AVATAR_LAYERED_PORTRAITS): AvatarLayerMaterial | null {
  if (!/^\/avatar\/scenes\/v3\/[a-z0-9/_-]+\.webp$/.test(src) || src.includes("..")) return null;
  for (const family of catalog) {
    const materials: Readonly<Partial<Record<string, AvatarLayerMaterial>>> = family.materials;
    if (Object.hasOwn(materials, src)) return materials[src] ?? null;
  }
  return null;
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
    const hairstyle = getAvatarHairstyle(avatar);
    if (hairstyle) return { portrait: hairstyle.src, layers: [{ kind: "hairstyle", src: hairstyle.src }] };
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
