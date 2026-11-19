"use client";

import type { AvatarConfig, AvatarPet } from "@/lib/profile/avatar";
import { normalizeAvatarConfig } from "@/lib/profile/avatar";

/**
 * Eight alpha-channel 3D assets in a single 4x2 AVIF spritesheet.
 * Row 1: male, female, male-with-glasses, female-with-glasses.
 * Row 2: sheep, doe, lion, eagle.
 *
 * Every tile is 256x256. The assets have transparent backgrounds; the app
 * controls the circular background independently.
 */
type SpriteKind =
  | "male" | "female" | "male-glasses" | "female-glasses"
  | Exclude<AvatarPet, "none">;

const tiles: Record<SpriteKind, readonly [number, number]> = {
  male: [0, 0],
  female: [1, 0],
  "male-glasses": [2, 0],
  "female-glasses": [3, 0],
  sheep: [0, 1],
  doe: [1, 1],
  lion: [2, 1],
  eagle: [3, 1],
};

const backgrounds: Record<AvatarConfig["background"], string> = {
  lavender: "radial-gradient(circle at 28% 20%, #F8F1FF 0%, #DFCFFA 70%, #CFB9F1 100%)",
  peach: "radial-gradient(circle at 28% 20%, #FFF4ED 0%, #F8D8CB 70%, #F1C6B9 100%)",
  mint: "radial-gradient(circle at 28% 20%, #F2FFF7 0%, #CFEADD 70%, #BCE1D2 100%)",
  sky: "radial-gradient(circle at 28% 20%, #F0F9FF 0%, #C8E1FA 70%, #B0D3F1 100%)",
  sand: "radial-gradient(circle at 28% 20%, #FFFBF2 0%, #F3E2C4 70%, #E9D1AE 100%)",
};

function SpriteTile({ kind, className = "" }: {
  kind: SpriteKind;
  className?: string;
}) {
  const [column, row] = tiles[kind];
  return (
    <span
      aria-hidden="true"
      className={`block pointer-events-none ${className}`}
      style={{
        backgroundImage: "url(/avatar/3d-companions-v1.avif)",
        backgroundPosition: `${(column / 3) * 100}% ${row * 100}%`,
        backgroundSize: "400% 200%",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

const petPlacement: Record<Exclude<AvatarPet, "none">, {
  left: string;
  bottom: string;
  scale: number;
}> = {
  sheep: { left: "-8%", bottom: "-6%", scale: 0.47 },
  doe: { left: "-7%", bottom: "-6%", scale: 0.49 },
  lion: { left: "-7%", bottom: "-6%", scale: 0.49 },
  eagle: { left: "-10%", bottom: "-6%", scale: 0.49 },
};

export function Avatar3DPortrait({
  config,
  size = 96,
  className = "",
}: {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
}) {
  const a = normalizeAvatarConfig(config);
  const base = a.style === "feminine" ? "female" : "male";
  const portraitKind: SpriteKind = a.glasses ? `${base}-glasses` : base;
  const pet = a.pet !== "none" ? a.pet : null;
  const borderWidth = Math.max(1, Math.round(size * 0.035));
  const placement = pet ? petPlacement[pet] : null;
  const petSize = placement ? Math.round(size * placement.scale) : 0;
  const animalLabels: Record<Exclude<AvatarPet, "none">, string> = {
    sheep: "綿羊",
    doe: "母鹿",
    lion: "獅子",
    eagle: "老鷹",
  };

  return (
    <span
      role="img"
      aria-label={`3D 風格大頭貼${pet ? `，陪伴動物：${animalLabels[pet]}` : ""}`}
      className={`relative inline-block shrink-0 align-middle ${className}`}
      style={{
        width: size,
        height: size,
      }}
    >
      <span
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: backgrounds[a.background],
          border: `${borderWidth}px solid white`,
          boxShadow: "0 3px 12px rgb(83 61 118 / 14%)",
        }}
      >
        <SpriteTile kind={portraitKind} className="absolute inset-0" />
      </span>

      {pet && placement && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-10"
          style={{
            width: petSize,
            height: petSize,
            left: placement.left,
            bottom: placement.bottom,
            filter: "drop-shadow(0 1px 1px rgb(60 38 57 / 10%))",
          }}
        >
          <SpriteTile kind={pet} className="h-full w-full" />
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
      role="img"
      aria-label={pet === "sheep" ? "綿羊" : pet === "doe" ? "母鹿" : pet === "lion" ? "獅子" : "老鷹"}
      className="relative inline-block overflow-hidden rounded-xl bg-gradient-to-br from-[#FFFDFC] to-[#F6F2FC]"
      style={{ width: size, height: size }}
    >
      <SpriteTile kind={pet} className="absolute inset-0" />
    </span>
  );
}
