"use client";

import { useId } from "react";
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
  light: "#F5D8C4",
  warm: "#E9B990",
  medium: "#C98B63",
  deep: "#8D5A40",
};
const hair: Record<string, string> = {
  dark: "#2C292A",
  brown: "#6B4734",
  auburn: "#8C4C3F",
  gray: "#77716E",
  blonde: "#B99362",
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
  const uid = useId().replace(/:/g, "");
  const bgId = `avatar-bg-${uid}`;
  const faceId = `avatar-face-${uid}`;
  const outfitId = `avatar-outfit-${uid}`;
  const shadowId = `avatar-shadow-${uid}`;

  const faceWidth = a.style === "masculine" ? 55 : a.style === "feminine" ? 51 : 53;
  const faceHeight = a.style === "masculine" ? 29 : 30;
  const browY = a.style === "masculine" ? 43 : 44;
  const eyeRx = a.eyeStyle === "bright" ? 5.1 : 4.5;
  const eyeRy = a.eyeStyle === "bright" ? 5.8 : 5.1;

  const renderOpenEye = (cx: number) => (
    <>
      <ellipse cx={cx} cy="50" rx={eyeRx} ry={eyeRy} fill="#FFF" />
      <ellipse cx={cx} cy="50.5" rx="2.7" ry="3.4" fill="#5A4035" />
      <ellipse cx={cx} cy="50.7" rx="1.25" ry="1.7" fill="#1F1A18" />
      <circle cx={cx - 0.9} cy="49.2" r="0.8" fill="#FFF" />
    </>
  );

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="系統大頭貼"
      className={className}
    >
      <defs>
        <radialGradient id={bgId} cx="36%" cy="28%" r="75%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.92" />
          <stop offset="55%" stopColor={bg[a.background]} />
          <stop offset="100%" stopColor={bg[a.background]} stopOpacity="0.88" />
        </radialGradient>
        <linearGradient id={faceId} x1="28%" y1="20%" x2="78%" y2="88%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.24" />
          <stop offset="24%" stopColor={skin[a.skinTone]} />
          <stop offset="100%" stopColor={skin[a.skinTone]} stopOpacity="0.92" />
        </linearGradient>
        <linearGradient id={outfitId} x1="20%" y1="10%" x2="80%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.18" />
          <stop offset="34%" stopColor={outfit[a.outfit]} />
          <stop offset="100%" stopColor={outfit[a.outfit]} stopOpacity="0.88" />
        </linearGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#553D76" floodOpacity="0.16" />
        </filter>
      </defs>

      <rect width="100" height="100" rx="50" fill={`url(#${bgId})`} />
      <circle cx="33" cy="27" r="18" fill="#FFF" opacity="0.18" />
      <path
        d="M18 100 C21 77 34 70 50 70 C66 70 79 77 82 100 Z"
        fill={`url(#${outfitId})`}
        filter={`url(#${shadowId})`}
      />
      {a.outfit === "shirt" && <path d="M43 73 L50 84 L57 73" fill="#FFF" opacity="0.9" />}
      {a.outfit === "polo" && <path d="M42 72 L50 79 L58 72" fill="none" stroke="#FFF" strokeWidth="3" opacity="0.72" />}
      {a.outfit === "jacket" && <path d="M47 72 L43 99 M53 72 L57 99" stroke="#E8EEF3" strokeWidth="2" opacity="0.7" />}

      <ellipse cx="26.5" cy="51" rx="4" ry="6" fill={skin[a.skinTone]} opacity="0.95" />
      <ellipse cx="73.5" cy="51" rx="4" ry="6" fill={skin[a.skinTone]} opacity="0.95" />
      <ellipse
        cx="50"
        cy="50"
        rx={faceWidth / 2}
        ry={faceHeight}
        fill={`url(#${faceId})`}
        filter={`url(#${shadowId})`}
      />

      {a.hair === "short" && <path d="M27 43 Q29 18 50 19 Q72 19 74 43 Q63 33 50 33 Q37 33 27 43" fill={hair[a.hairColor]} />}
      {a.hair === "side" && <path d="M25 44 Q28 19 51 19 Q73 20 75 42 Q61 32 48 33 Q34 33 25 44 M50 19 Q43 33 27 39" fill={hair[a.hairColor]} />}
      {a.hair === "wave" && <path d="M23 45 Q25 18 49 18 Q75 19 77 47 Q69 38 64 41 Q57 31 48 37 Q38 28 29 42 Z" fill={hair[a.hairColor]} />}
      {a.hair === "bob" && <path d="M22 50 Q22 19 50 17 Q78 20 78 51 L70 68 L66 41 Q50 30 33 40 L30 67 Z" fill={hair[a.hairColor]} />}
      {a.hair === "long" && <path d="M20 54 Q20 19 50 17 Q80 19 80 56 L72 80 L67 42 Q50 30 33 42 L28 80 Z" fill={hair[a.hairColor]} />}
      {a.hair === "bun" && (
        <>
          <circle cx="67" cy="19" r="10" fill={hair[a.hairColor]} />
          <path d="M24 47 Q25 19 50 19 Q75 19 76 47 Q65 34 50 34 Q35 34 24 47" fill={hair[a.hairColor]} />
        </>
      )}

      {a.accessory === "cap" && (
        <>
          <path d="M28 30 Q49 15 71 29 L69 36 Q49 29 30 36 Z" fill="#8068B4" />
          <path d="M51 34 Q68 32 77 37 Q65 39 52 38 Z" fill="#6D55A3" />
        </>
      )}
      {a.accessory === "hairclip" && (
        <path d="M66 31 l7 4 l-7 4 l-4-4 z" fill="#F3B6C8" stroke="#FFF" strokeWidth="1" />
      )}

      <path d={`M35 ${browY} Q40 ${browY - 2.4} 44 ${browY}`} fill="none" stroke="#5A4035" strokeWidth={a.style === "masculine" ? 2.7 : 2.2} strokeLinecap="round" />
      <path d={`M56 ${browY} Q61 ${browY - 2.4} 65 ${browY}`} fill="none" stroke="#5A4035" strokeWidth={a.style === "masculine" ? 2.7 : 2.2} strokeLinecap="round" />

      {a.eyeStyle === "smile" ? (
        <>
          <path d="M35 50 Q40 55 45 50" fill="none" stroke="#3C2D27" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M55 50 Q60 55 65 50" fill="none" stroke="#3C2D27" strokeWidth="2.2" strokeLinecap="round" />
        </>
      ) : (
        <>
          {renderOpenEye(40)}
          {renderOpenEye(60)}
        </>
      )}

      <ellipse cx="35" cy="58" rx="5.5" ry="2.4" fill="#E98787" opacity="0.13" />
      <ellipse cx="65" cy="58" rx="5.5" ry="2.4" fill="#E98787" opacity="0.13" />
      <path d="M50 51 Q47 56 50 57" fill="none" stroke="#A56E56" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d={a.style === "feminine" ? "M42 62 Q50 69 58 62" : "M42 62 Q50 67 58 62"}
        fill="none"
        stroke="#9D5B5B"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {a.glasses && (
        <>
          <rect x="31" y="44" width="18" height="13" rx="6" fill="none" stroke="#494949" strokeWidth="1.9" />
          <rect x="51" y="44" width="18" height="13" rx="6" fill="none" stroke="#494949" strokeWidth="1.9" />
          <path d="M49 50 H51" stroke="#494949" strokeWidth="1.9" />
        </>
      )}

      {a.accessory === "earrings" && (
        <>
          <circle cx="26" cy="58" r="2.1" fill="#F0C66A" stroke="#FFF" strokeWidth="0.7" />
          <circle cx="74" cy="58" r="2.1" fill="#F0C66A" stroke="#FFF" strokeWidth="0.7" />
        </>
      )}

      {a.pet === "dog" && (
        <g transform="translate(65 67)" filter={`url(#${shadowId})`}>
          <ellipse cx="10" cy="16" rx="11" ry="12" fill="#C99463" />
          <path d="M2 9 Q-4 4 0 17" fill="#9E704D" />
          <path d="M18 9 Q24 4 20 17" fill="#9E704D" />
          <circle cx="6.5" cy="14" r="1.5" fill="#2B2522" />
          <circle cx="13.5" cy="14" r="1.5" fill="#2B2522" />
          <ellipse cx="10" cy="18" rx="2.2" ry="1.6" fill="#3D302A" />
          <path d="M7 21 Q10 23 13 21" fill="none" stroke="#6D4735" strokeWidth="1.2" />
        </g>
      )}

      {a.pet === "cat" && (
        <g transform="translate(65 67)" filter={`url(#${shadowId})`}>
          <path d="M1 10 L4 2 L9 8 Q12 6 16 8 L21 2 L20 12 Q22 17 19 22 Q15 26 10 25 Q5 26 1 22 Q-2 17 1 10 Z" fill="#8F8A86" />
          <circle cx="6.5" cy="15" r="1.5" fill="#2B2522" />
          <circle cx="14.5" cy="15" r="1.5" fill="#2B2522" />
          <path d="M9 18 L12 18 L10.5 20 Z" fill="#D58D8D" />
          <path d="M-1 18 H6 M15 18 H22" stroke="#5F5A57" strokeWidth="0.8" />
        </g>
      )}

      {a.pet === "bird" && (
        <g transform="translate(68 70)" filter={`url(#${shadowId})`}>
          <ellipse cx="8" cy="12" rx="9" ry="10" fill="#6FA7B7" />
          <circle cx="7" cy="10" r="1.5" fill="#1F2937" />
          <path d="M16 11 L22 14 L16 16 Z" fill="#E8A74B" />
          <path d="M3 15 Q8 10 13 16 Q8 20 3 15" fill="#5D8E9E" opacity="0.85" />
          <path d="M6 22 L5 27 M10 22 L11 27" stroke="#6B5A42" strokeWidth="1.2" />
        </g>
      )}
    </svg>
  );
}
