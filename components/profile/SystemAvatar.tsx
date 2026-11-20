"use client";

import type { AvatarConfig } from "@/lib/profile/avatar";
import { AvatarRenderer } from "@/components/profile/AvatarRenderer";

/** Backward-compatible application entry point. Delegates to the sole renderer. */
export function SystemAvatar({
  config,
  size = 48,
  className = "",
  displayName,
}: {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
  displayName?: string | null;
}) {
  return <AvatarRenderer config={config} size={size} className={className} displayName={displayName} />;
}