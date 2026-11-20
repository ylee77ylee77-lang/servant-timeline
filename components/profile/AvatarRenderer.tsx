"use client";

import { useId } from "react";
import type { AvatarConfig } from "@/lib/profile/avatar";
import {
  AVATAR_CANVAS_SIZE,
  AVATAR_FRAME,
  AVATAR_PORTRAIT_BOUNDS,
  AVATAR_COMPANION_THUMBNAIL,
  AVATAR_COMPANIONS,
  type CompanionKind,
  getAvatarScene,
} from "@/lib/profile/avatar-scene";

/**
 * One renderer for editor, saved profile, service roster and communication UI.
 * Full-canvas assets share the exact same artboard, so every layer scales
 * together at any display size (including mobile and compact chat avatars).
 * The existing companion art is clipped inside the circular frame; the old
 * paw / talon foreground overlay is deliberately absent.
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
  const label = `${portrait ? "3D 頭像" : "系統預設頭像"}${companion ? `，陪伴動物：${companion.name}` : ""}`;

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
        {/* 2. Portrait and 3. animal head/upper body stay inside the frame. */}
        {portrait ? (
          <image
            href={portrait}
            x={AVATAR_PORTRAIT_BOUNDS.x}
            y={AVATAR_PORTRAIT_BOUNDS.y}
            width={AVATAR_PORTRAIT_BOUNDS.size}
            height={AVATAR_PORTRAIT_BOUNDS.size}
          />
        ) : (
          <g aria-hidden="true" fill="#FFFFFF" opacity="0.72">
            <circle cx="256" cy="205" r="81" />
            <path d="M98 485 C103 370 165 333 256 333 C347 333 409 370 414 485 Z" />
          </g>
        )}
        {companion && (
          <image href={companion.behind} x="0" y="0" width={AVATAR_CANVAS_SIZE} height={AVATAR_CANVAS_SIZE} />
        )}
      </g>

      {/* 4. White rim conceals the lower body. No separate feet/claw layer. */}
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#fff"
        strokeWidth={stroke}
      />

    </svg>
  );
}
/** Reuse an existing animal asset for a simple picker thumbnail, not a new image. */
export function AvatarCompanionThumbnail({ pet, size = 56 }: {
  pet: CompanionKind;
  size?: number;
}) {
  const { x, y, width, height } = AVATAR_COMPANION_THUMBNAIL;
  return (
    <svg aria-hidden="true" focusable="false"
      viewBox={`${x} ${y} ${width} ${height}`}
      width={size} height={size} className="block shrink-0">
      <image href={AVATAR_COMPANIONS[pet].behind}
        x="0" y="0" width={AVATAR_CANVAS_SIZE} height={AVATAR_CANVAS_SIZE} />
    </svg>
  );
}
