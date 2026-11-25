import type { AvatarConfig, AvatarStyle } from "./avatar.ts";
import type { AvatarColorHex, AvatarClothingColorPart } from "./avatar-color-wheel.ts";
import { getAvatarIndependent } from "./avatar-independent.ts";
import { getAvatarCandidateOutfitFit } from "./avatar-outfit-fit.ts";

export type FormalOutfitId = "dress-shirt" | "suit-tie" | "blazer" | "blouse" | "tailored-suit" | "formal-dress";
export type CasualOutfitId = "casual-polo" | "casual-crewneck" | "casual-knit" | "casual-cardigan";
export type AvatarGarmentId = FormalOutfitId | CasualOutfitId;
export type AvatarOutfitColors = Partial<Record<AvatarClothingColorPart, AvatarColorHex>>;
// Keep the historical persisted key and type for existing P5 profiles.
export type AvatarFormalOutfit = { id: AvatarGarmentId; colors?: AvatarOutfitColors };
type Character = Exclude<AvatarStyle, "neutral">;
type OutfitOption = Readonly<{
  id: AvatarGarmentId;
  style: Character;
  label: string;
  originals: Readonly<AvatarOutfitColors>;
}>;
export const AVATAR_FORMAL_OUTFITS: readonly OutfitOption[] = [
  { id: "dress-shirt", style: "masculine", label: "正式襯衫", originals: { clothing: "#D9E5EF" } },
  { id: "suit-tie", style: "masculine", label: "西裝領帶", originals: { clothing: "#293D57", lining: "#EEF1F4", tie: "#943F56" } },
  { id: "blazer", style: "masculine", label: "西裝便服", originals: { clothing: "#465B6E", lining: "#E9E2D6" } },
  { id: "blouse", style: "feminine", label: "正式女衫", originals: { clothing: "#D8C9DD" } },
  { id: "tailored-suit", style: "feminine", label: "女士西裝", originals: { clothing: "#39465C", lining: "#F2E6D9" } },
  { id: "formal-dress", style: "feminine", label: "典雅洋裝", originals: { clothing: "#576A88" } },
];

export const AVATAR_CASUAL_OUTFITS: readonly OutfitOption[] = [
  { id: "casual-polo", style: "masculine", label: "休閒 POLO 衫", originals: { clothing: "#617F78" } },
  { id: "casual-crewneck", style: "masculine", label: "圓領針織衫", originals: { clothing: "#9B8471" } },
  { id: "casual-knit", style: "feminine", label: "柔軟針織衫", originals: { clothing: "#C58B94" } },
  { id: "casual-cardigan", style: "feminine", label: "休閒開襟衫", originals: { clothing: "#8C9B82", lining: "#F2E6D9" } },
];
export function getAvatarCasualOptions(style: AvatarStyle) {
  return AVATAR_CASUAL_OUTFITS.filter(item => item.style === style);
}
export function getAvatarOutfitOptions(style: AvatarStyle) {
  return [...getAvatarFormalOptions(style), ...getAvatarCasualOptions(style)];
}
const PARTS = ["clothing", "lining", "tie"] as const;
export function getAvatarFormalOptions(style: AvatarStyle) {
  return AVATAR_FORMAL_OUTFITS.filter(item => item.style === style);
}
export function normalizeAvatarFormalOutfit(input: unknown, style: AvatarStyle): AvatarFormalOutfit | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const value = input as Record<string, unknown>;
  const choice = Object.hasOwn(value, "id") && getAvatarOutfitOptions(style).find(item => item.id === value.id);
  if (!choice) return;
  const colors: AvatarOutfitColors = {};
  if (Object.hasOwn(value, "colors") && value.colors && typeof value.colors === "object" && !Array.isArray(value.colors)) {
    const supplied = value.colors as Record<string, unknown>;
    for (const part of PARTS) {
      const color = supplied[part];
      if (Object.hasOwn(choice.originals, part) && Object.hasOwn(supplied, part) && typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) colors[part] = color.toUpperCase() as AvatarColorHex;
    }
  }
  return { id: choice.id, ...(Object.keys(colors).length ? { colors } : {}) };
}
export function selectAvatarFormalOutfit(avatar: AvatarConfig, id: AvatarGarmentId | "original"): AvatarConfig {
  if (id === "original") {
    if (!avatar.formalOutfit) return avatar;
    const next = { ...avatar };
    delete next.formalOutfit;
    return next;
  }
  if (id === avatar.formalOutfit?.id) return avatar;
  const outfit = normalizeAvatarFormalOutfit({ id, colors: avatar.formalOutfit?.colors }, avatar.style);
  return outfit ? { ...avatar, formalOutfit: outfit } : avatar;
}
export function setAvatarOutfitColor(avatar: AvatarConfig, part: AvatarClothingColorPart, color: AvatarColorHex | null): AvatarConfig {
  if (!avatar.formalOutfit) return avatar;
  const choice = getAvatarOutfitOptions(avatar.style).find(item => item.id === avatar.formalOutfit?.id);
  if (!choice || !Object.hasOwn(choice.originals, part)) return avatar;
  const colors = { ...avatar.formalOutfit.colors };
  if (color === null) delete colors[part]; else colors[part] = color;
  const normalized = normalizeAvatarFormalOutfit({ id: choice.id, colors }, avatar.style);
  return normalized ? { ...avatar, formalOutfit: normalized } : avatar;
}
export function getAvatarOutfitChannels(avatar: AvatarConfig) {
  const choice = getAvatarOutfitOptions(avatar.style).find(item => item.id === avatar.formalOutfit?.id);
  return choice ? PARTS.flatMap(part => {
    const original = choice.originals[part];
    return original ? [{ part, original }] : [];
  }) : [];
}

/** Source-specific cutouts remove the old painted garment, retaining face,
 * hair and the visible neck. Paths are expressed in the pinned 512px source
 * artboard, not in CSS or device-dependent coordinates. The upper and side
 * edges extend beyond the image bounds so clipping cannot multiply the
 * fractional antialias coverage of the original image or filter viewport. */
const MALE = "M-512 -512H1024V318H351Q337 339 329 345L330 368Q331 380 338 391L269 425Q260 430 251 425L188 391Q196 380 195 365L195 344Q179 331 171 318H-512Z";
// A garment cutout is not a color-ownership mask. Keep the ENTIRE
// upper portrait in a single contiguous path, including the hairline,
// eyebrows, ears, and all transparent antialiased silhouette pixels.
// Trace only the original sweater's lower edge and the front long hair.
// The earlier union of hair/skin color paths left gaps through the face.
const FEMALE_LONG_HAIR = "M-512 -512H1024V448H512L451 447C426 440 404 433 385 426C367 421 354 413 342 416C332 432 311 437 282 439C255 441 229 435 211 423C216 442 213 462 202 477C195 492 193 504 197 512H52C51 484 54 466 68 452Q75 446 82 442H-512Z";
// Bob and bun have no original sweater above y393. Preserve the full
// fringe, the bob silhouette, and the loose bun wisps before the collar.
const FEMALE_HEAD = "M-512 -512H1024V393H329Q333 405 343 414Q324 430 302 436Q275 443 249 436Q221 431 209 420Q218 408 211 393H-512Z";
const FITS: Record<string, readonly string[]> = Object.fromEntries([
  ["/avatar/scenes/v2/male.webp", [MALE]],
  ["/avatar/scenes/v2/male-glasses.webp", [MALE]],
  ["/avatar/scenes/v2-tones/male-dark.webp", [MALE]],
  ["/avatar/scenes/v2-tones/male-dark-glasses.webp", [MALE]],
  ["/avatar/scenes/v3/hairstyles/male-short.webp", [MALE]],
  ["/avatar/scenes/v3/hairstyles/male-side.webp", [MALE]],
  ["/avatar/scenes/v2/female.webp", [FEMALE_LONG_HAIR]],
  ["/avatar/scenes/v2/female-glasses.webp", [FEMALE_LONG_HAIR]],
  ["/avatar/scenes/v2-tones/female-dark.webp", [FEMALE_LONG_HAIR]],
  ["/avatar/scenes/v2-tones/female-dark-glasses.webp", [FEMALE_LONG_HAIR]],
  ["/avatar/scenes/v3/hairstyles/female-bob.webp", [FEMALE_HEAD]],
  ["/avatar/scenes/v3/hairstyles/female-bun.webp", [FEMALE_HEAD]],
]);
export function getAvatarFormalOutfitPlan(avatar: AvatarConfig, portrait: string | null) {
  if (!portrait || avatar.displayMode !== "custom") return null;
  const independent = getAvatarIndependent(avatar);
  const fitted = independent?.src === portrait ? getAvatarCandidateOutfitFit(independent.id) : null;
  const cutout = fitted?.headCutout ?? (Object.hasOwn(FITS, portrait) ? FITS[portrait] : null);
  if (!cutout) return null;
  const choice = getAvatarOutfitOptions(avatar.style).find(item => item.id === avatar.formalOutfit?.id);
  if (!choice) return null;
  return { id: choice.id, style: choice.style, cutout, colors: { ...choice.originals, ...avatar.formalOutfit?.colors } };
}

/** Same palette math for every material; preserve highlight/shadow at black and white. */
export function outfitShades(color: AvatarColorHex) {
  const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : "#465B6E";
  const rgb = [1, 3, 5].map(i => parseInt(safe.slice(i, i+2), 16));
  const mix = (target: number, amount: number) => "#" + rgb.map(v => Math.round(v*(1-amount)+target*amount).toString(16).padStart(2,"0")).join("");
  return { light: mix(255,.24), mid: mix(20,.05), dark: mix(0,.32), deep: mix(0,.53), edge: mix(255,.42) };
}
