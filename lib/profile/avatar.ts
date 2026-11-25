import type { AvatarColorHex, AvatarColorPart } from "./avatar-color-wheel.ts";

export type AvatarStyle = "masculine" | "feminine" | "neutral";
export type AvatarSkinTone = "light" | "warm" | "medium" | "deep";
export type AvatarHair = "short" | "side" | "wave" | "bob" | "long" | "bun";
export type AvatarHairColor = "dark" | "brown" | "auburn" | "gray" | "blonde";
export type AvatarGlassesStyle = "classic" | "round" | "square";
export type AvatarOutfit = "shirt" | "polo" | "knit" | "jacket";
export type AvatarBackground = "lavender" | "peach" | "mint" | "sky" | "sand";
export type AvatarEyeStyle = "soft" | "bright" | "smile";
export type AvatarAccessory = "none" | "earrings" | "hairclip" | "cap";
export type AvatarPet = "none" | "sheep" | "doe" | "lion" | "eagle";
export type AvatarDisplayMode = "custom" | "default" | "name";
export type AvatarIconType = "cross" | "bible" | "prayer" | "angel" | "palm" | "church";
export type AvatarIconTone = "warm" | "cool" | "charcoal" | "beige" | "blue" | "lavender";
export type AvatarMaterialColors = Partial<Record<AvatarColorPart, AvatarColorHex>>;
export const AVATAR_FAMILY_STYLES = {
  "male-a": "masculine", "male-b": "masculine",
  "female-a": "feminine", "female-b": "feminine",
} as const;
export type AvatarFamilyId = keyof typeof AVATAR_FAMILY_STYLES;
export type AvatarFamilySelection = {
  id: AvatarFamilyId;
  hair: AvatarHair;
  glassesStyle: AvatarGlassesStyle;
};

export const AVATAR_DISPLAY_LABELS: Record<AvatarDisplayMode, string> = {
  custom: "大頭貼",
  default: "圖示",
  name: "姓名識別",
};

export type AvatarConfig = {
  style: AvatarStyle;
  skinTone: AvatarSkinTone;
  hair: AvatarHair;
  hairColor: AvatarHairColor;
  outfit: AvatarOutfit;
  background: AvatarBackground;
  eyeStyle: AvatarEyeStyle;
  glasses: boolean;
  /** Optional, explicit opt-in; absent means the original v2 portrait. */
  portraitVersion?: "v2-tone" | "v3";
  /** Explicit new family selection; original portrait preferences remain intact. */
  portraitFamily?: AvatarFamilySelection;
  /** Separate from the existing on/off flag for backwards compatibility. */
  glassesStyle?: AvatarGlassesStyle;
  /** Explicit opt-in for source-aligned legacy round/square frames. */
  eyewearVersion?: "v1";
  /** Only explicit color choices override source artwork; absent keeps the original. */
  materialColors?: AvatarMaterialColors;
  accessory: AvatarAccessory;
  pet: AvatarPet;
  displayMode: AvatarDisplayMode;
  iconType: AvatarIconType;
  iconTone: AvatarIconTone;
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
    displayMode: "custom",
    iconType: "cross",
    iconTone: "lavender",
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
    displayMode: "custom",
    iconType: "cross",
    iconTone: "lavender",
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
    displayMode: "custom",
    iconType: "cross",
    iconTone: "lavender",
  },
};

const styles = new Set<AvatarStyle>(["masculine", "feminine", "neutral"]);
const skins = new Set<AvatarSkinTone>(["light", "warm", "medium", "deep"]);
const hairs = new Set<AvatarHair>(["short", "side", "wave", "bob", "long", "bun"]);
const hairColors = new Set<AvatarHairColor>(["dark", "brown", "auburn", "gray", "blonde"]);
const outfits = new Set<AvatarOutfit>(["shirt", "polo", "knit", "jacket"]);
const backgrounds = new Set<AvatarBackground>(["lavender", "peach", "mint", "sky", "sand"]);
const eyeStyles = new Set<AvatarEyeStyle>(["soft", "bright", "smile"]);
const glassesStyles = new Set<AvatarGlassesStyle>(["classic", "round", "square"]);
const accessories = new Set<AvatarAccessory>(["none", "earrings", "hairclip", "cap"]);
const pets = new Set<AvatarPet>(["none", "sheep", "doe", "lion", "eagle"]);
const displayModes = new Set<AvatarDisplayMode>(["custom", "default", "name"]);
const iconTypes = new Set<AvatarIconType>(["cross", "bible", "prayer", "angel", "palm", "church"]);
const iconTones = new Set<AvatarIconTone>(["warm", "cool", "charcoal", "beige", "blue", "lavender"]);

export function getDefaultAvatarConfig(style: AvatarStyle = "neutral"): AvatarConfig {
  return { ...AVATAR_DEFAULTS[style] };
}

function normalizeMaterialColors(value: unknown): AvatarMaterialColors | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const colors: AvatarMaterialColors = {};
  for (const part of ["hair", "skin", "frame"] as const) {
    if (!Object.hasOwn(input, part)) continue;
    const color = input[part];
    if (typeof color === "string" && color.length === 7 && /^#[0-9a-f]{6}$/i.test(color)) {
      colors[part] = color.toUpperCase() as AvatarColorHex;
    }
  }
  // The picker limits skin choices to its natural-tone gamut. Persistence keeps
  // exact RGB values: projecting through the picker again can introduce drift.
  return Object.keys(colors).length ? colors : undefined;
}

function normalizePortraitFamily(value: unknown, style: AvatarStyle): AvatarFamilySelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (!Object.hasOwn(input, "id") || typeof input.id !== "string"
      || !Object.hasOwn(AVATAR_FAMILY_STYLES, input.id)) return undefined;
  const id = input.id as AvatarFamilyId;
  if (AVATAR_FAMILY_STYLES[id] !== style) return undefined;
  return {
    id,
    hair: Object.hasOwn(input, "hair") && hairs.has(input.hair as AvatarHair)
      ? input.hair as AvatarHair : AVATAR_DEFAULTS[style].hair,
    glassesStyle: Object.hasOwn(input, "glassesStyle") && glassesStyles.has(input.glassesStyle as AvatarGlassesStyle)
      ? input.glassesStyle as AvatarGlassesStyle : "classic",
  };
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
  const materialColors = Object.hasOwn(input, "materialColors")
    ? normalizeMaterialColors(input.materialColors)
    : undefined;

  const portraitFamily = Object.hasOwn(input, "portraitFamily")
    ? normalizePortraitFamily(input.portraitFamily, style) : undefined;
  return {
    style,
    ...(portraitFamily ? { portraitFamily } : {}),
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
    ...(style !== "neutral" && input.portraitVersion === "v3"
      ? { portraitVersion: "v3" as const }
      : style !== "neutral" && input.portraitVersion === "v2-tone" && input.hairColor === "dark"
        ? { portraitVersion: "v2-tone" as const }
        : {}),
    ...(glassesStyles.has(input.glassesStyle as AvatarGlassesStyle)
      ? { glassesStyle: input.glassesStyle as AvatarGlassesStyle } : {}),
    ...(style !== "neutral" && input.portraitVersion !== "v3" && Object.hasOwn(input, "eyewearVersion")
        && input.eyewearVersion === "v1" && (input.glassesStyle === "round" || input.glassesStyle === "square")
      ? { eyewearVersion: "v1" as const } : {}),
    ...(materialColors ? { materialColors } : {}),
    accessory: accessories.has(input.accessory as AvatarAccessory)
      ? (input.accessory as AvatarAccessory)
      : base.accessory,
    pet: pets.has(input.pet as AvatarPet)
      ? (input.pet as AvatarPet)
      : base.pet,
    displayMode: displayModes.has(input.displayMode as AvatarDisplayMode)
      ? (input.displayMode as AvatarDisplayMode)
      : base.displayMode,
    iconType: iconTypes.has(input.iconType as AvatarIconType)
      ? (input.iconType as AvatarIconType)
      : base.iconType,
    iconTone: iconTones.has(input.iconTone as AvatarIconTone)
      ? (input.iconTone as AvatarIconTone)
      : base.iconTone,
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


/** Short, user-chosen profile name mark for the communication avatar.
 * Not an identity or authorization token. Empty names fall back to a generic icon.
 */
export function getAvatarNameMark(displayName?: string | null): string {
  const name = typeof displayName === "string" ? displayName.trim().replace(/\s+/g, " ") : "";
  if (!name) return "";

  const words = name.split(" ");
  if (words.length >= 2 && /[A-Za-z]/.test(name) && !/\p{Script=Han}/u.test(name)) {
    return words.slice(0, 2).map((word) => Array.from(word)[0]?.toUpperCase() || "").join("");
  }

  const characters = Array.from(name.replace(/\s/g, ""));
  return /\p{Script=Han}/u.test(name)
    ? characters.slice(-2).join("")
    : (characters[0] || "").toUpperCase();
}
