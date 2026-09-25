import type { PlatformPreset } from "../types";

// Social-media output presets, grouped by aspect ratio. Baseline dims use the
// HD short-side of 1080; targetDims() scales them per resolution.
export const PRESETS: PlatformPreset[] = [
  // Portrait 9:16
  { key: "yt_shorts", label: "YouTube Shorts", width: 1080, height: 1920, ratio: "9:16" },
  { key: "ig_reels", label: "Instagram Reels", width: 1080, height: 1920, ratio: "9:16" },
  { key: "tiktok", label: "TikTok", width: 1080, height: 1920, ratio: "9:16" },
  { key: "fb_reels", label: "Facebook Reels", width: 1080, height: 1920, ratio: "9:16" },
  { key: "threads", label: "Threads", width: 1080, height: 1920, ratio: "9:16" },
  { key: "story", label: "IG / WA / FB Story", width: 1080, height: 1920, ratio: "9:16" },
  // Square 1:1
  { key: "ig_feed", label: "Instagram Feed", width: 1080, height: 1080, ratio: "1:1" },
  { key: "fb_feed", label: "Facebook Feed", width: 1080, height: 1080, ratio: "1:1" },
  // Landscape 16:9
  { key: "youtube", label: "YouTube", width: 1920, height: 1080, ratio: "16:9" },
  { key: "x_twitter", label: "X / Twitter", width: 1920, height: 1080, ratio: "16:9" },
  { key: "facebook", label: "Facebook", width: 1920, height: 1080, ratio: "16:9" },
];

export const RATIOS: { ratio: string; label: string }[] = [
  { ratio: "9:16", label: "Portrait 9:16" },
  { ratio: "1:1", label: "Square 1:1" },
  { ratio: "16:9", label: "Landscape 16:9" },
];

export const RESOLUTIONS = [
  { key: "SD", label: "SD", note: "480p", scale: 480 },
  { key: "HD", label: "HD", note: "1080p", scale: 1080 },
  { key: "UHD", label: "4K", note: "2160p", scale: 2160 },
] as const;

export function presetByKey(key: string): PlatformPreset {
  return PRESETS.find((p) => p.key === key) ?? PRESETS[0];
}

export type ResolutionKey = (typeof RESOLUTIONS)[number]["key"];

/**
 * Output dimensions for a preset at a given resolution. Presets are defined at
 * the HD baseline (short side = 1080); we scale by (shortSide / 1080) and round
 * to even numbers, which H.264 requires.
 */
export function targetDims(presetKey: string, resKey: string): { w: number; h: number } {
  const p = presetByKey(presetKey);
  const res = RESOLUTIONS.find((r) => r.key === resKey) ?? RESOLUTIONS[1];
  const factor = res.scale / 1080;
  const even = (n: number) => Math.max(2, Math.round((n * factor) / 2) * 2);
  return { w: even(p.width), h: even(p.height) };
}
