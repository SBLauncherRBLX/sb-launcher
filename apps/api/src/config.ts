import { config as loadEnv } from "dotenv";
import { z } from "zod";
import { isAllowedCloudBaseUrl } from "./lib/safeUrl.js";

loadEnv();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string(),
  APP_URL: z.string().url(),
  DESKTOP_PROTOCOL: z.string().default("sblauncher"),
  SESSION_SECRET: z.string().min(16),
  TOKEN_ENCRYPTION_KEY: z.string().min(64),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  ROBLOX_CLIENT_ID: z.string().optional().default(""),
  ROBLOX_CLIENT_SECRET: z.string().optional().default(""),
  ROBLOX_REDIRECT_URI: z.string().url(),
  ROBLOX_SCOPES: z
    .string()
    .default("openid profile user.social:read user.inventory-item:read"),
  SB_BUILD_ID: z.string().optional().default(""),
  SB_APP_VERSION: z.string().optional().default("2.3.2"),
  /** Cloudflare Worker base URL. Empty/whitespace falls back to the public Worker. */
  SB_CLOUD_URL: z.preprocess(
    (value) => {
      if (typeof value !== "string" || !value.trim()) {
        return "https://sb-launcher-cloud.sblauncherrblx.workers.dev";
      }
      return value.trim().replace(/\/+$/, "");
    },
    z.string().url(),
  ),
  /** Shared with native host so we never adopt a foreign process on :8787. */
  SB_INSTANCE_TOKEN: z.string().optional().default(""),
});

export const env = EnvSchema.parse(process.env);

if (!isAllowedCloudBaseUrl(env.SB_CLOUD_URL)) {
  throw new Error(
    `SB_CLOUD_URL host is not allowed: ${env.SB_CLOUD_URL}. Use the official *.workers.dev Worker.`,
  );
}

// Roblox supports Authorization Code + PKCE for public desktop clients,
// so a Client ID is sufficient and no secret is embedded in the app.
export const oauthConfigured = Boolean(env.ROBLOX_CLIENT_ID);
