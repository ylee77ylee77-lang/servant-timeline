"use client";

import { useId } from "react";
import type { AvatarConfig } from "@/lib/profile/avatar";
import {
  AVATAR_CANVAS_SIZE,
  AVATAR_FRAME,
  getAvatarScene,
} from "@/lib/profile/avatar-scene";

/**
 * One renderer for editor, saved profile, service roster and communication UI.
 * Full-canvas assets share the exact same artboard, so every layer scales
 * together at any display size (including mobile and compact chat avatars).
 */
export function AvatarRenderer({
  config,
  size = 48,
  className = "",
}: {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
}) {
  const { portrait, companion, gradient } = getAvatarScene(config);
  const id = useId().replace(/:/g, "");
  const clipId = `avatar-circle-${id}`;
  const gradientId = `avatar-bg-${id}`;
  const { cx, cy, radius, stroke } = AVATAR_FRAME;
  const label = `3D 頭像${companion ? `，陪伴動物：${companion.name}` : ""}`;

  return (
    <svg
      role="img"
      aria-label={label}
      focusable="false"
      viewBox={`0 0 ${AVATAR_CANVAS_SIZE} ${AVATAR_CANVAS_SIZE}`}
      width={size}
      height={size}
      className={`inline-block shrink-0 align-middle ${className}`}
      style={{ overflow: "visible", filter: "drop-shadow(0 3px 5px rgb(83 61 118 / 13%))" }}
    >
      <defs>
        <radialGradient id={gradientId} cx="27%" cy="20%" r="85%">
          <stop offset="0%" stopColor={gradient.from} />
          <stop offset="58%" stopColor={gradient.middle} />
          <stop offset="100%" stopColor={gradient.to} />
        </radialGradient>
        <clipPath id={clipId}>
          <circle cx={cx} cy={cy} r={radius} />
        </clipPath>
      </defs>

      {/* 1. Changeable background, entirely separate from transparent artwork. */}
      <circle cx={cx} cy={cy} r={radius} fill={`url(#${gradientId})`} />

      <g clipPath={`url(#${clipId})`}>
        {/* 2. Portrait and 3. companion's rear silhouette stay inside the frame. */}
        <image href={portrait} x="0" y="0" width={AVATAR_CANVAS_SIZE} height={AVATAR_CANVAS_SIZE} />
        {companion && (
          <image href={companion.behind} x="0" y="0" width={AVATAR_CANVAS_SIZE} height={AVATAR_CANVAS_SIZE} />
        )}
      </g>

      {/* 4. White rim passes in front of the companion's body. */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#fff"
        strokeWidth={stroke}
      />

      {/* 5. Only the paws / claws / ear passing over the rim go in front. */}
      {companion && (
        <image href={companion.inFront} x="0" y="0" width={AVATAR_CANVAS_SIZE} height={AVATAR_CANVAS_SIZE} />
      )}
    </svg>
  );
}