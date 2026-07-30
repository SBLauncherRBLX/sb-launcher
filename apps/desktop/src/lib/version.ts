/** App release version - keep in sync with package.json / native / installer. */
export const APP_VERSION = "2.5.0";
export const APP_YEAR = 2026;

/** Compare dotted semver-like versions. Returns positive if a > b. */
export function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(/[.+-]/).map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

