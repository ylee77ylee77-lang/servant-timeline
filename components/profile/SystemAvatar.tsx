"use client";

import type { AvatarConfig } from "@/lib/profile/avatar";
import { Avatar3DPortrait } from "@/components/profile/Avatar3DPortrait";

export function SystemAvatar({
  config,
  size = 48,
  className = "",
}: {
  config?: AvatarConfig | null;
  size?: number;
  className?: string;
}) {
  return <Avatar3DPortrait config={config} size={size} className={className} />;
}
