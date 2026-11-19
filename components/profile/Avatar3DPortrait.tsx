"use client";

import type { AvatarConfig, AvatarPet, AvatarStyle } from "@/lib/profile/avatar";
import { normalizeAvatarConfig } from "@/lib/profile/avatar";

type SpriteKind = "masculine" | "feminine" | "dog" | "cat" | "bird";

const positions: Record<SpriteKind, string> = {
  masculine: "0% 50%",
  feminine: "25% 50%",
  dog: "50% 50%",
  cat: "75% 50%",
  bird: "100% 50%",
};

const backgrounds: Record<AvatarConfig["background"], string> = {
  lavender: "linear-gradient(145deg,#F8F4FF,#E8DDFD)",
  peach: "linear-gradient(145deg,#FFF8F2,#FFE1D5)",
  mint: "linear-gradient(145deg,#F5FFFB,#DFF5E9)",
  sky: "linear-gradient(145deg,#F4FAFF,#DDEBFF)",
  sand: "linear-gradient(145deg,#FFF9EF,#F1E2C9)",
};

function Sprite({
  kind,
  size,
  className = "",
}: {
  kind: SpriteKind;
  size: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        width: size,
        height: size,
        display: "block",
        backgroundImage: "url(/avatar/approved-3d-sprites.webp)",
        backgroundRepeat: "no-repeat",
        backgroundSize: "500% 100%",
        backgroundPosition: positions[kind],
      }}
    />
  );
}

export function Avatar3DPortrait({
  config,
  size = 96,
  className = "",
}: {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
}) {
  const avatar = normalizeAvatarConfig(config);
  const style: Extract<AvatarStyle, "masculine" | "feminine"> =
    avatar.style === "feminine" ? "feminine" : "masculine";
  const pet = avatar.pet === "none" ? null : avatar.pet;
  const petSize = Math.round(size * 0.38);

  return (
    <span
      role="img"
      aria-label="3D 風格大頭貼"
      className={`relative inline-flex shrink-0 overflow-hidden rounded-full border-4 border-white shadow-lg shadow-[#6D55A3]/15 ${className}`}
      style={{
        width: size,
        height: size,
        background: backgrounds[avatar.background],
      }}
    >
      <Sprite kind={style} size={size} className="absolute inset-0 h-full w-full bg-cover" />

      {avatar.glasses && (
        <span
          aria-hidden="true"
          className="absolute left-1/2 top-[42%] h-[22%] w-[54%] -translate-x-1/2"
        >
          <span className="absolute left-0 top-0 h-full w-[42%] rounded-[42%] border-[2px] border-[#3E3632]" />
          <span className="absolute right-0 top-0 h-full w-[42%] rounded-[42%] border-[2px] border-[#3E3632]" />
          <span className="absolute left-[42%] top-[43%] h-[2px] w-[16%] bg-[#3E3632]" />
        </span>
      )}

      {pet && (
        <span
          className="absolute bottom-[2%] right-[1%] overflow-hidden rounded-full border-2 border-white bg-white shadow-md"
          style={{ width: petSize, height: petSize }}
        >
          <Sprite kind={pet as AvatarPet & SpriteKind} size={petSize} className="h-full w-full bg-cover" />
        </span>
      )}
    </span>
  );
}

export function Avatar3DPet({
  pet,
  size = 56,
}: {
  pet: Exclude<AvatarPet, "none">;
  size?: number;
}) {
  return (
    <span
      className="inline-flex overflow-hidden rounded-2xl border border-[#E6EAF0] bg-white shadow-sm"
      style={{ width: size, height: size }}
    >
      <Sprite kind={pet} size={size} className="h-full w-full bg-cover" />
    </span>
  );
}
