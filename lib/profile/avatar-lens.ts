import type { AvatarConfig } from "./avatar.ts";
import type { AvatarColorHex } from "./avatar-color-wheel.ts";

export const AVATAR_LENS_DEFAULT_COLOR: AvatarColorHex = "#627B91";
export type AvatarLens = Readonly<{color?: AvatarColorHex; transparency?: number}>;

function validColor(value: unknown): value is AvatarColorHex {
  return typeof value === "string" && value.length === 7 && /^#[0-9a-f]{6}$/i.test(value);
}
function validTransparency(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
}
export function normalizeAvatarLens(value: unknown): AvatarLens | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const rawColor = Object.hasOwn(input,"color") ? input.color : undefined;
  const rawTransparency = Object.hasOwn(input,"transparency") ? input.transparency : undefined;
  const color = validColor(rawColor) ? rawColor.toUpperCase() as AvatarColorHex : undefined;
  const transparency = validTransparency(rawTransparency) ? Math.round(rawTransparency / 5) * 5 : undefined;
  const result = {
    ...(color && color !== AVATAR_LENS_DEFAULT_COLOR ? {color} : {}),
    ...(transparency !== undefined && transparency !== 100 ? {transparency} : {}),
  };
  return Object.keys(result).length ? result : undefined;
}
export function getAvatarLensSettings(avatar: AvatarConfig) {
  const lens = normalizeAvatarLens(avatar.lens);
  const transparency = lens?.transparency ?? 100;
  return {color: lens?.color ?? AVATAR_LENS_DEFAULT_COLOR, transparency, opacity:(100-transparency)/100};
}
function updateLens(avatar: AvatarConfig, value: unknown): AvatarConfig {
  if (avatar.style === "neutral") return avatar;
  const next = {...avatar};
  const lens = normalizeAvatarLens(value);
  if (lens) next.lens = lens;
  else delete next.lens;
  return next;
}
export function setAvatarLensColor(avatar: AvatarConfig, color: AvatarColorHex | null) {
  if (color !== null && !validColor(color)) return avatar;
  return updateLens(avatar,{...avatar.lens,color});
}
export function setAvatarLensTransparency(avatar: AvatarConfig, transparency: number) {
  if (!validTransparency(transparency)) return avatar;
  return updateLens(avatar,{...avatar.lens,transparency});
}
export function resetAvatarLens(avatar: AvatarConfig) { return updateLens(avatar,undefined); }
export function getAvatarLensShades(color: AvatarColorHex) {
  const safe = validColor(color) ? color : AVATAR_LENS_DEFAULT_COLOR;
  const rgb = [1,3,5].map(i=>parseInt(safe.slice(i,i+2),16));
  const mix = (target:number,amount:number) => "#" + rgb.map(v=>Math.round(v*(1-amount)+target*amount).toString(16).padStart(2,"0")).join("").toUpperCase();
  return {upper:mix(255,.18),middle:safe,lower:mix(0,.09)};
}
