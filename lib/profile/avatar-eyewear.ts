import type { AvatarConfig, AvatarGlassesStyle, AvatarStyle } from "./avatar.ts";
import type { AvatarColorHex } from "./avatar-color-wheel.ts";
import { getAvatarHairstyle } from "./avatar-hairstyle.ts";
import { AVATAR_FRAME_PATHS } from "./avatar-frame-paths.ts";
import { getAvatarIndependent } from "./avatar-independent.ts";
import { getCandidateEyewearPlan } from "./avatar-independent-eyewear.ts";

export type AvatarEyewearChoice = "none" | AvatarGlassesStyle;
type FrameStyle = Exclude<AvatarGlassesStyle, "classic">;
type Character = Exclude<AvatarStyle, "neutral">;
export const AVATAR_EYEWEAR_CHOICES = [
  { value: "none", label: "無眼鏡" }, { value: "classic", label: "原款" },
  { value: "round", label: "圓框" }, { value: "square", label: "方框" },
] as const satisfies readonly { value: AvatarEyewearChoice; label: string }[];

type Geometry = Readonly<{ rims: readonly [string, string]; bridge: string; temples: readonly [string, string]; width: number }>;
/** Original 512px v2 artboard. Character-specific centerlines, clear lenses.
 * Source-aligned vector artwork, not a generic stamp or another full portrait. */
const GEOMETRY = {
  masculine: {
    round: {
      rims: [
        "M165 207 C165 184 181 170 204 170 C227 170 243 184 243 207 C243 229 227 244 204 244 C181 244 165 229 165 207 Z",
        "M275 205 C275 182 291 169 314 169 C337 169 353 183 353 205 C353 227 337 242 314 242 C291 242 275 227 275 205 Z",
      ],
      bridge: "M240 193 Q259 182 278 192", temples: ["M153 190 L169 193", "M349 192 L363 188"], width: 6.2,
    },
    square: {
      rims: [
        "M180 176 L228 176 Q242 176 243 190 L242 228 Q241 241 227 241 L186 241 Q172 241 169 227 L165 191 Q164 177 180 176 Z",
        "M291 174 L340 174 Q354 174 354 188 L351 226 Q349 239 335 240 L291 240 Q277 240 276 226 L275 189 Q275 175 291 174 Z",
      ],
      bridge: "M243 191 Q259 184 275 190", temples: ["M153 187 L166 190", "M353 189 L365 186"], width: 6.8,
    },
  },
  feminine: {
    round: {
      rims: [
        "M167 221 C165 198 181 183 204 181 C228 179 245 195 247 218 C249 240 233 257 209 259 C186 261 169 244 167 221 Z",
        "M282 214 C280 191 296 175 319 173 C342 171 360 186 362 209 C364 231 348 248 325 250 C302 252 284 236 282 214 Z",
      ],
      bridge: "M244 202 Q265 190 285 194", temples: ["M157 205 L170 206", "M359 194 L375 190"], width: 6.0,
    },
    square: {
      rims: [
        "M180 191 L229 185 Q244 184 246 199 L248 236 Q249 250 235 253 L192 259 Q178 261 173 247 L166 210 Q163 194 180 191 Z",
        "M295 182 L345 176 Q359 174 362 188 L363 225 Q364 239 350 242 L306 248 Q291 250 287 236 L280 199 Q277 184 295 182 Z",
      ],
      bridge: "M246 200 Q265 189 282 195", temples: ["M156 205 L167 208", "M362 192 L376 188"], width: 6.6,
    },
  },
} as const satisfies Record<Character, Record<FrameStyle, Geometry>>;
const ORIGINAL: Record<Character, AvatarColorHex> = { masculine: "#3B3935", feminine: "#3A3732" };

/** Dormant legacy glassesStyle values never change existing portraits. */
export function getAvatarLegacyEyewearChoice(avatar: AvatarConfig): AvatarEyewearChoice {
  if (!avatar.glasses || avatar.style === "neutral") return "none";
  if (getAvatarIndependent(avatar)) return avatar.independentPortrait?.glassesStyle ?? "classic";
  if (avatar.portraitVersion !== "v3" && avatar.eyewearVersion === "v1"
      && (avatar.glassesStyle === "round" || avatar.glassesStyle === "square")) return avatar.glassesStyle;
  return "classic";
}
export function selectAvatarLegacyEyewear(avatar: AvatarConfig, choice: AvatarEyewearChoice): AvatarConfig {
  if (avatar.style === "neutral" || !AVATAR_EYEWEAR_CHOICES.some(item => item.value === choice)) return avatar;
  if (getAvatarLegacyEyewearChoice(avatar) === choice) return avatar;
  if (choice === "none") return { ...avatar, glasses: false };
  if (getAvatarIndependent(avatar) && avatar.independentPortrait) return { ...avatar, glasses: true, independentPortrait: { ...avatar.independentPortrait, glassesStyle: choice } };
  if (choice === "classic") {
    const next = { ...avatar, glasses: true, glassesStyle: "classic" as const };
    delete next.eyewearVersion;
    return next;
  }
  return { ...avatar, ...(avatar.portraitVersion === "v3" ? { portraitVersion: undefined } : {}), glasses: true, glassesStyle: choice, eyewearVersion: "v1" };
}
export function getAvatarEyewearPlan(avatar: AvatarConfig) {
  if (avatar.style === "neutral" || avatar.displayMode !== "custom") return null;
  const choice = getAvatarLegacyEyewearChoice(avatar);
  const independent = getAvatarIndependent(avatar);
  if (independent) return choice === "none" ? null : getCandidateEyewearPlan(independent.base, choice, avatar.materialColors?.frame, independent.coverageUri);
  const hairstyle = getAvatarHairstyle(avatar);
  const original = ORIGINAL[avatar.style];
  const shared = { original, color: avatar.materialColors?.frame ?? original, occlusionUri: hairstyle?.coverageUri };
  if (choice === "classic" && hairstyle) {
    // Trace of the released classic rim geometry, used as a clear-lens
    // independent accessory ONLY on the new complete hairstyle sources.
    return { ...shared, choice, artwork: "filled" as const, geometry: AVATAR_FRAME_PATHS[avatar.style === "masculine" ? "male" : "female"] };
  }
  if (choice !== "round" && choice !== "square") return null;
  return { ...shared, choice, artwork: "stroke" as const, geometry: GEOMETRY[avatar.style][choice] };
}
/** Strict RGB and distinct tonal values even at black and white. */
export function getAvatarEyewearShades(color: AvatarColorHex) {
  const safe = /^#[0-9a-f]{6}$/i.test(color) ? color : "#3B3935";
  const rgb = [1, 3, 5].map(i => parseInt(safe.slice(i, i + 2), 16));
  const mix = (target: number, amount: number) =>
    "#" + rgb.map(v => Math.round(v * (1 - amount) + target * amount).toString(16).padStart(2, "0")).join("").toUpperCase();
  return { shadow: mix(0, .56), lower: mix(0, .32), mid: mix(24, .07), upper: mix(255, .28), highlight: mix(255, .58) };
}
