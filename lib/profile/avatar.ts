export type AvatarStyle = "masculine" | "feminine" | "neutral";
export type AvatarSkinTone = "light" | "warm" | "medium" | "deep";
export type AvatarHair = "short" | "side" | "wave" | "bob" | "long" | "bun";
export type AvatarHairColor = "dark" | "brown" | "auburn" | "gray" | "blonde";
export type AvatarOutfit = "shirt" | "polo" | "knit" | "jacket";
export type AvatarBackground = "lavender" | "peach" | "mint" | "sky" | "sand";
export type AvatarEyeStyle = "soft" | "bright" | "smile";
export type AvatarAccessory = "none" | "earrings" | "hairclip" | "cap";
export type AvatarPet = "none" | "dog" | "cat" | "bird";

export type AvatarConfig = {
  style: AvatarStyle;
  skinTone: AvatarSkinTone;
  hair: AvatarHair;
  hairColor: AvatarHairColor;
  outfit: AvatarOutfit;
  background: AvatarBackground;
  eyeStyle: AvatarEyeStyle;
  glasses: boolean;
  accessory: AvatarAccessory;
  pet: AvatarPet;
};

export const AVATAR_DEFAULTS: Record<AvatarStyle, AvatarConfig> = {
  masculine: {
    style: "masculine",
    skinTone: "warm",
    hair: "side",
    hairColor: "dark",
    outfit: "polo",
    background: "sky",
    eyeStyle: "bright",
    glasses: false,
    accessory: "none",
    pet: "none",
  },
  feminine: {
    style: "feminine",
    skinTone: "warm",
    hair: "long",
    hairColor: "brown",
    outfit: "knit",
    background: "peach",
    eyeStyle: "bright",
    glasses: false,
    accessory: "none",
    pet: "none",
  },
  neutral: {
    style: "neutral",
    skinTone: "warm",
    hair: "short",
    hairColor: "dark",
    outfit: "shirt",
    background: "lavender",
    eyeStyle: "soft",
    glasses: false,
    accessory: "none",
    pet: "none",
  },
};

const styles = new Set<AvatarStyle>(["masculine", "feminine", "neutral"]);
const skins = new Set<AvatarSkinTone>(["light", "warm", "medium", "deep"]);
const hairs = new Set<AvatarHair>(["short", "side", "wave", "bob", "long", "bun"]);
const hairColors = new Set<AvatarHairColor>(["dark", "brown", "auburn", "gray", "blonde"]);
const outfits = new Set<AvatarOutfit>(["shirt", "polo", "knit", "jacket"]);
const backgrounds = new Set<AvatarBackground>(["lavender", "peach", "mint", "sky", "sand"]);
const eyeStyles = new Set<AvatarEyeStyle>(["soft", "bright", "smile"]);
const accessories = new Set<AvatarAccessory>(["none", "earrings", "hairclip", "cap"]);
const pets = new Set<AvatarPet>(["none", "dog", "cat", "bird"]);

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
    eyeStyle: eyeStyles.has(input.eyeStyle as AvatarEyeStyle)
      ? (input.eyeStyle as AvatarEyeStyle)
      : base.eyeStyle,
    glasses: input.glasses === true,
    accessory: accessories.has(input.accessory as AvatarAccessory)
      ? (input.accessory as AvatarAccessory)
      : base.accessory,
    pet: pets.has(input.pet as AvatarPet)
      ? (input.pet as AvatarPet)
      : base.pet,
  };
}

export function isAvatarPersonalized(value: unknown) {
  const avatar = normalizeAvatarConfig(value);
  const base = getDefaultAvatarConfig();
  return (
    avatar.style !== base.style
    || avatar.skinTone !== base.skinTone
    || avatar.hair !== base.hair
    || avatar.hairColor !== base.hairColor
    || avatar.outfit !== base.outfit
    || avatar.background !== base.background
    || avatar.eyeStyle !== base.eyeStyle
    || avatar.glasses !== base.glasses
    || avatar.accessory !== base.accessory
    || avatar.pet !== base.pet
  );
}
