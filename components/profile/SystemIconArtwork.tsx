"use client";

import { useId } from "react";
import { AVATAR_ICON_ARTWORK, AVATAR_ICON_TONES } from "@/lib/profile/avatar-icon";
import type { AvatarIconTone, AvatarIconType } from "@/lib/profile/avatar";

/**
 * One art renderer for both avatar picker cards and the circular profile avatar.
 * The five illustrated subjects are transparent 512px assets with a shared
 * composition contract. The Shekinah silhouette keeps its existing user-supplied
 * alpha mask. Tone changes use one subtle SVG filter instead of duplicating art.
 */
export function SystemIconArtwork({
  icon,
  tone,
  size = 48,
  x,
  y,
}: {
  icon: AvatarIconType;
  tone: AvatarIconTone;
  size?: number;
  x?: number;
  y?: number;
}) {
  const ink = AVATAR_ICON_TONES[tone].ink;
  const id = useId().replace(/:/g, "");
  const maskId = `shekinah-building-${id}`;
  const filterId = `soft-icon-tone-${id}`;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id={filterId} x="-8%" y="-8%" width="116%" height="116%" colorInterpolationFilters="sRGB">
          <feColorMatrix type="saturate" values="0.70" result="softArt" />
          <feFlood floodColor={ink} floodOpacity="0.21" result="toneWash" />
          <feComposite in="toneWash" in2="SourceAlpha" operator="in" result="toneMasked" />
          <feBlend in="softArt" in2="toneMasked" mode="soft-light" />
        </filter>
        {icon === "church" && (
          <mask
            id={maskId}
            x="0"
            y="0"
            width="64"
            height="64"
            maskUnits="userSpaceOnUse"
            style={{ maskType: "alpha" }}
          >
            <image
              href="/avatar/icons/shekinah-silhouette-mask.png"
              x="0"
              y="0"
              width="64"
              height="64"
            />
          </mask>
        )}
      </defs>

      {icon === "church" ? (
        <rect x="0" y="0" width="64" height="64" fill={ink} mask={`url(#${maskId})`} />
      ) : (
        <image
          href={AVATAR_ICON_ARTWORK[icon]}
          x="0"
          y="0"
          width="64"
          height="64"
          preserveAspectRatio="xMidYMid meet"
          filter={`url(#${filterId})`}
        />
      )}
    </svg>
  );
}
