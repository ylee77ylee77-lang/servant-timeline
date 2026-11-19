export type AvatarStyle = "masculine" | "feminine" | "neutral";
export type AvatarSkinTone = "light" | "warm" | "medium" | "deep";
export type AvatarHair = "short" | "side" | "wave" | "bob" | "long" | "bun";
export type AvatarHairColor = "dark" | "brown" | "gray";
export type AvatarOutfit = "shirt" | "polo" | "knit" | "jacket";
export type AvatarBackground = "lavender" | "peach" | "mint" | "sky" | "sand";

export type AvatarConfig = {
  style: AvatarStyle;
  skinTone: AvatarSkinTone;
  hair: AvatarHair;
  hairColor: AvatarHairColor;
  outfit: AvatarOutfit;
  background: AvatarBackground;
  glasses: boolean;
};

export const AVATAR_DEFAULTS: Record<AvatarStyle, AvatarConfig> = {
  masculine: {
    style: "masculine",
    skinTone: "warm",
    hair: "side",
    hairColor: "dark",
    outfit: "polo",
    background: "sky",
    glasses: false,
  },
  feminine: {
    style: "feminine",
    skinTone: "warm",
    hair: "long",
    hairColor: "brown",
    outfit: "knit",
    background: "peach",
    glasses: false,
  },
  neutral: {
    style: "neutral",
    skinTone: "warm",
    hair: "short",
    hairColor: "dark",
    outfit: "shirt",
    background: "lavender",
    glasses: false,
  },
};

const styles = new Set<AvatarStyle>(["masculine", "feminine", "neutral"]);
const skins = new Set<AvatarSkinTone>(["light", "warm", "medium", "deep"]);
const hairs = new Set<AvatarHair>(["short", "side", "wave", "bob", "long", "bun"]);
const hairColors = new Set<AvatarHairColor>(["dark", "brown", "gray"]);
const outfits = new Set<AvatarOutfit>(["shirt", "polo", "knit", "jacket"]);
const backgrounds = new Set<AvatarBackground>(["lavender", "peach", "mint", "sky", "sand"]);

export function getDefaultAvatarConfig(style: AvatarStyle = "neutral"): AvatarConfig {
  return { ...AVATAR_DEFAULTS[style] };
}

export function normalizeAvatarConfig(value: unknown): AvatarConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getDefaultAvatarConfig();
  }

  const input = value as Record<string, unknown>;
  const style = styles.has(input.style as AvatarStyle)
    ? (input.style as AvatarStyle)
    : "neutral";
  const base = getDefaultAvatarConfig(style);

  return {
    style,
    skinTone: skins.has(input.skinTone as AvatarSkinTone)
      ? (input.skinTone as AvatarSkinTone)
      : base.skinTone,
    hair: hairs.has(input.hair as AvatarHair)
      ? (input.hair as AvatarHair)
      : base.hair,
    hairColor: hairColors.has(input.hairColor as AvatarHairColor)
      ? (input.hairColor as AvatarHairColor)
      : base.hairColor,
    outfit: outfits.has(input.outfit as AvatarOutfit)
      ? (input.outfit as AvatarOutfit)
      : base.outfit,
    background: backgrounds.has(input.background as AvatarBackground)
      ? (input.background as AvatarBackground)
      : base.background,
    glasses: input.glasses === true,
  };
}
