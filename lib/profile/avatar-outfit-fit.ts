import type { AvatarStyle } from "./avatar.ts";

export type AvatarOutfitArtworkFit = Readonly<{
  transform: string;
  bodyPath: string;
}>;
type CandidateFit = AvatarOutfitArtworkFit & Readonly<{
  style: Exclude<AvatarStyle, "neutral">;
  headCutout: readonly string[];
}>;

// Measured on the six independent 512px portraits. Transform the garment
// only, never the character. Its oversized fabric field is clipped to the
// source silhouette when fitted, so the original shoulder edge is retained.
// These paths are not derived from the color-ownership masks.
const bodyPath = "M-48 350H560V550H-48Z";
const maleHead = "M-512 -512H1024V398H334L334 400L251 433L178 400L178 398H-512Z";
const femaleHead = "M-512 -512H1024V399H315Q318 403 332 408L255 436L180 408Q195 403 198 399H-512Z";
const femaleLongHair = [
  "M80 350H210V395Q210 408 195 415Q177 425 155 425Q137 426 122 418Q104 409 96 392Z",
  "M304 350H432L417 389Q408 410 388 419Q368 425 348 425Q318 423 307 408Z",
] as const;
const femaleBob = [
  "M75 350H209V392Q207 410 191 414Q171 421 150 421Q130 420 113 408Q93 395 83 378Z",
  "M306 350H437L423 383Q416 404 394 411Q374 420 348 418Q323 418 306 405Z",
] as const;

const maleFit: CandidateFit = {
  style: "masculine", bodyPath,
  // Released garment collar (189,388)-(338,388) fits (178,400)-(334,400).
  transform: "matrix(1.046979866 0 0 0.903225806 -19.87919463 49.54838710)",
  headCutout: [maleHead],
};
const femaleFit: CandidateFit = {
  style: "feminine", bodyPath,
  // Released collar (210,408)-(344,407) fits (180,408)-(332,407).
  transform: "matrix(1.134328358 0 0 1 -58.20895522 0)",
  headCutout: [femaleHead],
};
const CANDIDATE_FITS = {
  "male-b": maleFit,
  "male-b-short": maleFit,
  "male-b-side": maleFit,
  "female-b": {...femaleFit, headCutout: [femaleHead, ...femaleLongHair]},
  "female-b-bob": {...femaleFit, headCutout: [femaleHead, ...femaleBob]},
  "female-b-bun": femaleFit,
} as const satisfies Record<string,CandidateFit>;

// Explicitly allowlisted offline candidate fits. Not a runtime registration.
export function getAvatarCandidateOutfitFit(id: string): CandidateFit | null {
  return Object.hasOwn(CANDIDATE_FITS,id) ? CANDIDATE_FITS[id as keyof typeof CANDIDATE_FITS] : null;
}
