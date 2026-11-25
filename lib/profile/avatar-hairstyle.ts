import type { AvatarConfig, AvatarStyle } from "./avatar.ts";
import type { AvatarColorHex } from "./avatar-color-wheel.ts";

/** Complete source-locked illustrations, not interchangeable 3D hair layers.
 * Every variant owns its exact two-channel material coverage. Legacy profiles
 * never select an illustration implicitly from the old dormant hair field.
 */
const SOURCES = [
  { id: "male-short", style: "masculine", label: "俐落短髮", sourceSha256: "7eac00218d55eea3c127fbacba7367e295dc612bbf664170d1c14fa8fe7a8eaf", coverageSha256: "0fa66df9e242d450acd2907b7c6b12b9d86e6bad7fb976ee3d376f125c4df04f" },
  { id: "male-side", style: "masculine", label: "經典側分", sourceSha256: "0616e60f5be4cdc094db211a9ebbf62c289b517311a5a7330c614c3cd06211f3", coverageSha256: "82f5d6472bef68a84ce17e9e9dc7d81c6e8eab0ad15d8b42a7c55c8628966c25" },
  { id: "female-bob", style: "feminine", label: "鮑伯短髮", sourceSha256: "fbd3d966ae8759eaace7dff2fae87e06c531f4288013dd66a6ded2c566c83f4d", coverageSha256: "4cc3b253249a576f407dbb3f3b83a9e3b30d96aa11f443dfe2e9eda6201b8b42" },
  { id: "female-bun", style: "feminine", label: "自然盤髮", sourceSha256: "4f63b6743ae41fe0e61c01bd39083033de36c7d0ea58cc117f026041420e8e68", coverageSha256: "12f7e3a2c7704237e0a8703e54a8933dff60892407c16563f8b6493eb724c5df" },
] as const;
export type AvatarHairstyleId = typeof SOURCES[number]["id"];
type Character = Exclude<AvatarStyle, "neutral">;
const ORIGINALS: Record<Character, Readonly<{ hair: AvatarColorHex; skin: AvatarColorHex }>> = {
  masculine: { hair: "#674637", skin: "#EDB18D" },
  feminine: { hair: "#784E3B", skin: "#F2BC9C" },
};
export const AVATAR_HAIRSTYLES = SOURCES.map(source => ({
  ...source,
  src: `/avatar/scenes/v3/hairstyles/${source.id}.webp`,
  coverageUri: `/avatar/materials/v3/hairstyles/${source.id}.png`,
  originals: ORIGINALS[source.style],
}));
export function normalizeAvatarHairstyle(value: unknown, style: AvatarStyle): AvatarHairstyleId | undefined {
  return SOURCES.find(source => source.id === value && source.style === style)?.id;
}
export function getAvatarHairstyle(avatar: AvatarConfig) {
  return AVATAR_HAIRSTYLES.find(source => source.id === avatar.hairstyleVariant && source.style === avatar.style) ?? null;
}
export function getAvatarHairstyleBySource(src: string) {
  return AVATAR_HAIRSTYLES.find(source => source.src === src) ?? null;
}
export function getAvatarHairstyleOptions(style: AvatarStyle) {
  return AVATAR_HAIRSTYLES.filter(source => source.style === style);
}
export function selectAvatarHairstyle(avatar: AvatarConfig, id: AvatarHairstyleId | "original"): AvatarConfig {
  if (id === "original") {
    if (!avatar.hairstyleVariant) return avatar;
    const next = { ...avatar };
    delete next.hairstyleVariant;
    return next;
  }
  if (normalizeAvatarHairstyle(id, avatar.style) !== id) return avatar;
  if (avatar.hairstyleVariant === id && !avatar.portraitFamily) return avatar;
  const next = { ...avatar, hairstyleVariant: id };
  delete next.portraitFamily;
  return next;
}
