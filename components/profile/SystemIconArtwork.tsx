"use client";

import { useId } from "react";
import { AVATAR_ICON_TONES } from "@/lib/profile/avatar-icon";
import type { AvatarIconTone, AvatarIconType } from "@/lib/profile/avatar";

/** One scalable, themeable vector language for the six system icons.
 * The church mask is derived directly from the user-supplied Shekinah silhouette,
 * tinted at render time (one underlying illustration, all six tonal choices).
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
  const color = AVATAR_ICON_TONES[tone].ink;
  const churchMaskId = `shekinah-building-${useId().replace(/:/g, "")}`;
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      x={x}
      y={y}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      color={color}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {icon === "cross" && (
          <g strokeWidth="3">
            <path d="M27 7h10v20h19v10H37v20H27V37H8V27h19Z" fill="currentColor" fillOpacity=".10" />
            <path d="M32 7v50M8 32h48" strokeOpacity=".38" strokeWidth="1.4" />
          </g>
        )}
        {icon === "bible" && (
          <g strokeWidth="2.6">
            <path d="M32 17C25 12 17 11 8 13v36c10-2 18-1 24 5 6-6 14-7 24-5V13c-9-2-17-1-24 4Z" fill="currentColor" fillOpacity=".09" />
            <path d="M32 17v37M12 23c7-1 12 0 16 3M12 31c7-1 12 0 16 3M36 26c4-3 9-4 16-3M36 34c4-3 9-4 16-3" strokeWidth="1.4" strokeOpacity=".7" />
          </g>
        )}
        {icon === "prayer" && (
          <g strokeWidth="2.6">
            <path d="M29 52 14 40a8 8 0 0 1-2.9-6L10 23c-.2-3 3-4 4.5-1l6 11-4-18c-.8-3 3.2-4.4 4.4-1.6l8 19c1.4 3.5 2 6.7 2 10V52Z" fill="currentColor" fillOpacity=".08" />
            <path d="M35 52 50 40a8 8 0 0 0 2.9-6L54 23c.2-3-3-4-4.5-1l-6 11 4-18c.8-3-3.2-4.4-4.4-1.6l-8 19c-1.4 3.5-2 6.7-2 10V52Z" fill="currentColor" fillOpacity=".08" />
            <path d="M24 57h12M32 24v19" strokeOpacity=".65" strokeWidth="1.6" />
          </g>
        )}
        {icon === "angel" && (
          <g strokeWidth="2.2">
            <ellipse cx="32" cy="9" rx="10" ry="3.2" fill="currentColor" fillOpacity=".13" />
            <circle cx="32" cy="20" r="6" fill="currentColor" fillOpacity=".12" />
            <path d="M26 29c-6 3-8 10-9 17 4 4 9 7 15 10 6-3 11-6 15-10-1-7-3-14-9-17" fill="currentColor" fillOpacity=".12" />
            <path d="M24 30c-9-6-17-6-20-2 4 6 4 12 14 16M40 30c9-6 17-6 20-2-4 6-4 12-14 16" fill="currentColor" fillOpacity=".07" />
            <path d="M32 31v21M18 48l-5 4M46 48l5 4" strokeWidth="1.6" strokeOpacity=".6" />
          </g>
        )}
        {icon === "palm" && (
          <g strokeWidth="2.1">
            <path d="M11 55C25 43 36 29 54 10" strokeWidth="3" />
            <path d="M17 49C11 40 7 35 5 29c9 2 16 6 18 13M25 40C15 31 13 23 13 17c10 5 16 11 18 17M34 31C28 21 27 14 28 8c8 6 12 12 13 16M43 21c0-8 5-14 12-17 0 9-2 15-7 21M27 40c11 0 20 0 27-8-9-2-16-1-23 2M36 31c10-2 16-6 21-13-8 0-14 1-20 5" fill="currentColor" fillOpacity=".13" />
          </g>
        )}
        {icon === "church" && (
          <>
            <defs>
              <mask
                id={churchMaskId}
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
            </defs>
            <rect
              x="0"
              y="0"
              width="64"
              height="64"
              fill="currentColor"
              stroke="none"
              mask={`url(#${churchMaskId})`}
            />
          </>
        )}
      </g>
    </svg>
  );
}
