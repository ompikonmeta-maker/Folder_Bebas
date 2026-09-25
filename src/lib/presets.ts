import type { PlatformPreset } from "../types";

// Social-media output presets. Portrait 9:16 uses center-crop; landscape 16:9 passes through.
export const PRESETS: PlatformPreset[] = [
  { key: "yt_shorts", label: "YouTube Shorts", width: 1080, height: 1920, ratio: "9:16" },
  { key: "ig_reels", label: "Instagram Reels", width: 1080, height: 1920, ratio: "9:16" },
  { key: "tiktok", label: "TikTok", width: 1080, height: 1920, ratio: "9:16" },
  { key: "story", label: "WA / IG Story", width: 1080, height: 1920, ratio: "9:16" },
  { key: "yt_video", label: "YouTube Video", width: 1920, height: 1080, ratio: "16:9" },
];

export const RESOLUTIONS = [
  { key: "SD", label: "SD 480p", scale: 480 },
  { key: "HD", label: "HD 1080p", scale: 1080 },
  { key: "UHD", label: "Ultra HD 4K", scale: 2160 },
] as const;

export function presetByKey(key: string): PlatformPreset {
  return PRESETS.find((p) => p.key === key) ?? PRESETS[0];
}
