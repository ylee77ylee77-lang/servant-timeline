"use client";

import type { AvatarConfig } from "@/lib/profile/avatar";
import { normalizeAvatarConfig } from "@/lib/profile/avatar";

const bg: Record<string, string> = {
  lavender: "#EDE6FF",
  peach: "#FFE5DD",
  mint: "#DDF6EF",
  sky: "#DCEEFF",
  sand: "#F3E7D3",
};
const skin: Record<string, string> = {
  light: "#F4D4BD",
  warm: "#E8B58E",
  medium: "#C98B63",
  deep: "#8D5A40",
};
const hair: Record<string, string> = {
  dark: "#2E2A2A",
  brown: "#6B4734",
  gray: "#77716E",
};
const outfit: Record<string, string> = {
  shirt: "#6D55A3",
  polo: "#3B7EA1",
  knit: "#C76F7A",
  jacket: "#50677A",
};

export function SystemAvatar({
  config,
  size = 48,
  className = "",
}: {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
}) {
  const a = normalizeAvatarConfig(config);
  const faceWidth = a.style === "masculine" ? 54 : a.style === "feminine" ? 50 : 52;
  const browY = a.style === "masculine" ? 43 : 45;
  const mouthCurve = a.style === "feminine" ? "M43 62 Q50 67 57 62" : "M43 62 Q50 65 57 62";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="系統大頭圖"
      className={className}
    >
      <rect width="100" height="100" rx="50" fill={bg[a.background]} />
      <path d="M20 100 C23 77 35 71 50 71 C65 71 77 77 80 100 Z" fill={outfit[a.outfit]} />
      {a.outfit === "shirt" && <path d="M44 74 L50 84 L56 74" fill="#FFF" opacity="0.9" />}
      {a.outfit === "polo" && <path d="M43 73 L50 79 L57 73" fill="none" stroke="#FFF" strokeWidth="3" opacity="0.75" />}
      <ellipse cx="50" cy="50" rx={faceWidth / 2} ry="28" fill={skin[a.skinTone]} />
      {a.hair === "short" && <path d="M27 43 Q29 19 50 20 Q72 20 74 43 Q63 34 50 34 Q37 34 27 43" fill={hair[a.hairColor]} />}
      {a.hair === "side" && <path d="M25 44 Q28 20 51 20 Q72 21 75 42 Q61 33 48 34 Q34 34 25 44 M50 20 Q43 34 27 39" fill={hair[a.hairColor]} />}
      {a.hair === "wave" && <path d="M23 45 Q25 19 49 19 Q75 20 77 47 Q69 39 64 42 Q57 32 48 38 Q38 29 29 43 Z" fill={hair[a.hairColor]} />}
      {a.hair === "bob" && <path d="M22 50 Q22 20 50 18 Q78 21 78 51 L70 67 L66 42 Q50 31 33 41 L30 66 Z" fill={hair[a.hairColor]} />}
      {a.hair === "long" && <path d="M20 54 Q20 20 50 18 Q80 20 80 56 L72 78 L67 43 Q50 31 33 43 L28 78 Z" fill={hair[a.hairColor]} />}
      {a.hair === "bun" && <>
        <circle cx="67" cy="20" r="10" fill={hair[a.hairColor]} />
        <path d="M24 47 Q25 20 50 20 Q75 20 76 47 Q65 35 50 35 Q35 35 24 47" fill={hair[a.hairColor]} />
      </>}
      <path d={`M35 ${browY} Q40 ${browY - 2} 44 ${browY}`} fill="none" stroke="#5A4035" strokeWidth={a.style === "masculine" ? 2.8 : 2.2} strokeLinecap="round" />
      <path d={`M56 ${browY} Q61 ${browY - 2} 65 ${browY}`} fill="none" stroke="#5A4035" strokeWidth={a.style === "masculine" ? 2.8 : 2.2} strokeLinecap="round" />
      <circle cx="40" cy="50" r="2.2" fill="#252525" />
      <circle cx="60" cy="50" r="2.2" fill="#252525" />
      <path d="M50 51 Q47 56 50 57" fill="none" stroke="#A56E56" strokeWidth="1.8" strokeLinecap="round" />
      <path d={mouthCurve} fill="none" stroke="#9D5B5B" strokeWidth="2" strokeLinecap="round" />
      {a.glasses && <>
        <rect x="32" y="45" width="16" height="11" rx="5" fill="none" stroke="#494949" strokeWidth="2" />
        <rect x="52" y="45" width="16" height="11" rx="5" fill="none" stroke="#494949" strokeWidth="2" />
        <path d="M48 50 H52" stroke="#494949" strokeWidth="2" />
      </>}
    </svg>
  );
}
