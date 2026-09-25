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
