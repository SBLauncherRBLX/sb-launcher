export class RobloxApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "RobloxApiError";
  }
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  retries = 3,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.headers ?? {}),
        },
      });
      if (res.status === 429 && attempt < retries) {
        const retryAfter = Number(res.headers.get("retry-after") ?? "");
        const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1200 * 2 ** attempt;
        await sleep(waitMs);
        continue;
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let message = text || `Roblox API error ${res.status}`;
        try {
          const parsed = JSON.parse(text) as {
            errors?: Array<{ message?: string }>;
            error?: string;
            message?: string;
          };
          message =
            parsed.errors?.[0]?.message ||
            parsed.error ||
            parsed.message ||
            message;
        } catch {
          // keep raw text
        }
        if (res.status === 429) {
          throw new RobloxApiError("Too Many Requests", 429, "RATE_LIMITED");
        }
        throw new RobloxApiError(message, res.status);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (err instanceof RobloxApiError && err.status === 429 && attempt < retries) {
        await sleep(1500 * 2 ** attempt);
        continue;
      }
      if (attempt < retries && !(err instanceof RobloxApiError)) await sleep(300 * 2 ** attempt);
      else if (attempt < retries && err instanceof RobloxApiError && err.status >= 500) {
        await sleep(300 * 2 ** attempt);
      } else {
        break;
      }
    }
  }
  throw lastError;
}
