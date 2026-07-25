import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { env } from "../config.js";
import { invalidateCachesOnUpgrade } from "./cache.js";

function markerPath(): string {
  const dbUrl = env.DATABASE_URL.replace(/^file:/, "");
  const dbDir = dirname(dbUrl);
  return join(dbDir, "api-build.txt");
}

export async function ensureBuildFreshness(): Promise<void> {
  const buildId = env.SB_BUILD_ID?.trim();
  if (!buildId) return;

  const marker = markerPath();
  mkdirSync(dirname(marker), { recursive: true });

  let previous = "";
  try {
    if (existsSync(marker)) previous = readFileSync(marker, "utf8").trim();
  } catch {
    // ignore
  }

  if (previous === buildId) return;

  await invalidateCachesOnUpgrade();
  writeFileSync(marker, buildId, "utf8");
}
