// Deterministic default avatar using DiceBear shapes style.
// Same seed always produces the same image — safe to cache at CDN level.
// Shapes are abstract, minimal, and theme-neutral; no personal data is encoded.
const DICEBEAR_BASE = 'https://api.dicebear.com/7.x/shapes/png';

export const getDefaultAvatarUrl = (seed) =>
  `${DICEBEAR_BASE}?seed=${encodeURIComponent(seed || 'default')}&size=200`;
