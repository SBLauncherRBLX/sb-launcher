const ALLOWED_CLOUD_HOST_SUFFIXES = ["sblauncherrblx.workers.dev"];

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  "sblauncherrblx.github.io",
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
]);

/** Desktop deep-link after OAuth — protocol only, never http(s)/javascript. */
export function sanitizeDesktopRedirect(
  value: string | null | undefined,
  protocol: string,
): string | null {
  const fallback = `${protocol}://auth`;
  if (!value || !value.trim()) return fallback;
  try {
    const url = new URL(value.trim());
    if (url.protocol.replace(/:$/, "").toLowerCase() !== protocol.toLowerCase()) {
      return null;
    }
    // Drop any attacker-supplied query/hash; token is delivered out-of-band.
    return `${protocol}://auth`;
  } catch {
    return null;
  }
}

/** Public cosmetic / media URLs shown in the WebView. */
export function sanitizeMediaUrl(value: string | null | undefined): string | undefined {
  if (!value || typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return undefined;
    if (url.username || url.password) return undefined;
    // Block obvious script/data hosts and local network.
    const host = url.hostname.toLowerCase();
    // Virtual WebView hosts are local-only and cannot be shared via cloud cosmetics.
    if (host.endsWith(".sblauncher")) {
      return undefined;
    }
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function isAllowedCloudBaseUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return ALLOWED_CLOUD_HOST_SUFFIXES.some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export function sanitizeDownloadUrl(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (!ALLOWED_DOWNLOAD_HOSTS.has(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const MAGIC: Array<{ type: string; test: (b: Buffer) => boolean }> = [
  { type: "image/png", test: (b) => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  {
    type: "image/jpeg",
    test: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    type: "image/gif",
    test: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x39 || b[4] === 0x37) &&
      b[5] === 0x61,
  },
  {
    type: "image/webp",
    test: (b) =>
      b.length >= 12 &&
      b.toString("ascii", 0, 4) === "RIFF" &&
      b.toString("ascii", 8, 12) === "WEBP",
  },
  {
    type: "video/mp4",
    test: (b) => b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp",
  },
  {
    type: "video/webm",
    test: (b) => b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3,
  },
];

/** Infer media type from magic bytes; ignore attacker-supplied Content-Type. */
export function detectMediaContentType(bytes: Buffer): string | null {
  for (const entry of MAGIC) {
    if (entry.test(bytes)) return entry.type;
  }
  return null;
}
