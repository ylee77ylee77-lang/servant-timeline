import type { AvatarIconTone, AvatarIconType } from "./avatar.ts";

/** Single source for user-facing labels and softly grayed icon colors. */
export const AVATAR_ICON_OPTIONS: ReadonlyArray<{ value: AvatarIconType; label: string }> = [
  { value: "cross", label: "十字架" },
  { value: "bible", label: "聖經" },
  { value: "prayer", label: "禱告" },
  { value: "angel", label: "天使" },
  { value: "palm", label: "棕樹枝" },
  { value: "church", label: "教會" },
];

export type IconTonePalette = {
  label: string;
  swatch: string;
  ink: string;
  gradient: { from: string; middle: string; to: string };
};

export const AVATAR_ICON_TONES: Record<AvatarIconTone, IconTonePalette> = {
  warm: {
    label: "暖灰", swatch: "#BBAFA7", ink: "#776558",
    gradient: { from: "#FCFAF8", middle: "#E9E0DB", to: "#CFC2B8" },
  },
  cool: {
    label: "冷灰", swatch: "#ABB1BF", ink: "#626B7D",
    gradient: { from: "#FBFCFD", middle: "#E0E3E9", to: "#C4C9D2" },
  },
  charcoal: {
    label: "炭灰", swatch: "#757780", ink: "#444853",
    gradient: { from: "#F7F7F9", middle: "#C8CBD2", to: "#9B9DA6" },
  },
  beige: {
    label: "米灰", swatch: "#C6B9AD", ink: "#877362",
    gradient: { from: "#FFFCF9", middle: "#E8DED3", to: "#D5C5B8" },
  },
  blue: {
    label: "藍灰", swatch: "#9AACC1", ink: "#576F8F",
    gradient: { from: "#F8FBFF", middle: "#DDE5F0", to: "#B6C5D7" },
  },
  lavender: {
    label: "薰衣草灰", swatch: "#AE9FC4", ink: "#786098",
    gradient: { from: "#FCF9FF", middle: "#E9E1F3", to: "#C8B9DC" },
  },
};
