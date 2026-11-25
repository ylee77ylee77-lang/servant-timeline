import type { AvatarConfig, AvatarGlassesStyle, AvatarStyle } from "./avatar.ts";
import type { AvatarColorHex } from "./avatar-color-wheel.ts";

// Explicit b1 opt-in only. Never activate a dormant portraitFamily or legacy hair value.
const SOURCES = [
  { id: "male-b", style: "masculine", label: "原版髮型", sourceSha256: "be5add2bdbd710c850b2feeb3c6d3380ab7060a9d13af10d123afeb0d62a26f5", coverageSha256: "f44460513c5a6dad7348777f40cb673b759b08bdc6b375cf45adf8cefe79f8f5" },
  { id: "male-b-short", style: "masculine", label: "俐落短髮", sourceSha256: "f5969c1199de6054d647f2a1ad80499c3728dfb9c48b3b574199ea1a99b41278", coverageSha256: "9be943357773015364bf4989d3759394cb3d83d6953d953c9955c8d80d7ef23c" },
  { id: "male-b-side", style: "masculine", label: "經典側分", sourceSha256: "1190d5815ed55a3b82d380f8107a77f43838af4507e62b9cef75d345538c5a56", coverageSha256: "7bc7d34021142bd4ab37dfa4b1c92c46886676aa01b688819a03025f05097422" },
  { id: "female-b", style: "feminine", label: "原版髮型", sourceSha256: "a430def8598cf69c2087a1d203530f0e1b23bfa00538de513e5137c6f4741a0f", coverageSha256: "f91248a0dee0d67a9c2a5bcb15ad569c03d08110a00ba94440c78130b75702d4" },
  { id: "female-b-bob", style: "feminine", label: "鮑伯短髮", sourceSha256: "439e80963e7ff4a8af815d72cc34dbf52d386d62df8393570cfb3d871c569ba8", coverageSha256: "95807b1bf4133ca06ba0a9f8042e4dd3c17ef375fbab784e0d11236818046e23" },
  { id: "female-b-bun", style: "feminine", label: "自然盤髮", sourceSha256: "e16b0ec6078a5d316c5e0ec0034082ca1d5846032bc38f02695dc63dce3176d5", coverageSha256: "ff1cc301962284662c98a7802828b5cd9cdcbbeb9079ecf8c61dd2cfa5f56e2c" },
] as const;
const FITS = {
  "male-b": { headSha256: "5d7c787256d3b3276da55c041c0b2d4cf7e9393195623b5f3380bcefd35055fb", garmentSha256: "0382df402b9af9e021a2799c4fe719ec7c3bfde1caf1e866c1f24c90038af2e7" },
  "female-b": { headSha256: "25b6900c02fe1e133eb071a6782d44b8be0e38708b9f570bc78b5e2e94f0d536", garmentSha256: "16d896f704cdd07b0714f242b1df1a8d6e05c85a6276f7838b50096faf8b90ce" },
  "female-b-bob": { headSha256: "e46c50eab1a3e5e577d6cc7eaf259d6eb78bf744e0e1c5f12fd9cbe53fac7739", garmentSha256: "b1cbb00d3da42e0f3326cf1a9fb0904652f0d1a0e98b9bcf79d7245f0ed61a60" },
  "female-b-bun": { headSha256: "c07a674b463569d2f0783cac27c04e149b092b066e77007bd4b10b42a7600bd4", garmentSha256: "70049d6bafc82a5b59f7bb4db0e36971569446614850ca12a2e4a411adf948db" },
} as const;
const ORIGINALS: Record<"masculine" | "feminine", {hair: AvatarColorHex; skin: AvatarColorHex}> = {
  masculine: {hair:"#624536",skin:"#E8B18D"},
  feminine: {hair:"#6A4632",skin:"#EFB998"},
};
export type AvatarIndependentId = typeof SOURCES[number]["id"];
export type AvatarIndependentSelection = {version:"b1"; id:AvatarIndependentId; glassesStyle:AvatarGlassesStyle};
export const AVATAR_INDEPENDENT_SOURCES = SOURCES.map(source => {
  const base = source.style === "masculine" ? "male-b" : "female-b";
  const fitId = source.style === "masculine" ? "male-b" : source.id as keyof typeof FITS;
  return {...source, base, src:`/avatar/scenes/b1/${source.id}.webp`, coverageUri:`/avatar/materials/b1/${source.id}.png`,
    originals:ORIGINALS[source.style], headUri:`/avatar/fits/b1/${fitId}-head.png`, garmentUri:`/avatar/fits/b1/${fitId}-garment.png`, ...FITS[fitId]};
});
export function normalizeAvatarIndependent(value: unknown, style: AvatarStyle): AvatarIndependentSelection | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const input=value as Record<string,unknown>;
  if (!Object.hasOwn(input,"version") || input.version!=="b1" || !Object.hasOwn(input,"id")) return;
  const source=SOURCES.find(s=>s.id===input.id&&s.style===style);
  if(!source)return;
  const choice=Object.hasOwn(input,"glassesStyle")?input.glassesStyle:null;
  return {version:"b1",id:source.id,glassesStyle:choice==="round"||choice==="square"?choice:"classic"};
}
export function getAvatarIndependent(avatar:AvatarConfig) {
  const selected=normalizeAvatarIndependent(avatar.independentPortrait,avatar.style);
  return AVATAR_INDEPENDENT_SOURCES.find(s=>s.id===selected?.id)??null;
}
export function getAvatarIndependentBySource(src:string) {
  return AVATAR_INDEPENDENT_SOURCES.find(s=>s.src===src)??null;
}
export function getAvatarIndependentOptions(style:AvatarStyle) {
  return AVATAR_INDEPENDENT_SOURCES.filter(s=>s.style===style);
}
export function selectAvatarIndependent(avatar:AvatarConfig,id:AvatarIndependentId|"original"):AvatarConfig {
  if(id==="original"){
    if(!avatar.independentPortrait)return avatar;
    const next={...avatar};delete next.independentPortrait;return next;
  }
  if(!SOURCES.some(s=>s.id===id&&s.style===avatar.style))return avatar;
  if(getAvatarIndependent(avatar)?.id===id)return avatar;
  const legacyFrame=avatar.portraitVersion!=="v3"&&avatar.eyewearVersion==="v1"&&(avatar.glassesStyle==="round"||avatar.glassesStyle==="square")?avatar.glassesStyle:"classic";
  const current=getAvatarIndependent(avatar)?avatar.independentPortrait?.glassesStyle:undefined;
  return {...avatar,independentPortrait:{version:"b1",id,glassesStyle:current??legacyFrame}};
}
