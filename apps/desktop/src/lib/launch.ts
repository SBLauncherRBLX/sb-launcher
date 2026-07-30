import { api } from "./api";
import { useAppStore } from "../store";
import { ensureLaunchAccountMatches } from "./launchGate";

async function resolveGameIconUrl(placeId?: string, iconUrl?: string | null): Promise<string | undefined> {
  const existing = iconUrl?.trim();
  if (existing) return existing;
  const id = placeId?.trim();
  if (!id) return undefined;
  try {
    const res = await fetch(
      `https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${encodeURIComponent(id)}&size=512x512&format=Png&isCircular=false`,
    );
    if (!res.ok) return undefined;
    const data = (await res.json()) as { data?: Array<{ imageUrl?: string }> };
    return data.data?.[0]?.imageUrl?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function launchExperience(input: {
  placeId?: string;
  gameInstanceId?: string;
  userId?: string;
  accessCode?: string;
  universeId?: string;
  name?: string;
  iconUrl?: string | null;
  creatorName?: string | null;
  serverType?: "public" | "private" | "reserved";
}) {
  const allowed = await ensureLaunchAccountMatches();
  if (!allowed) return null;

  const accessCode = input.accessCode?.trim() || undefined;
  const result = await api.launch({ ...input, accessCode });
  const open = window.sbDesktop?.openRoblox;
  if (open) {
    const serverType =
      input.serverType ??
      (accessCode ? "private" : input.gameInstanceId?.trim() ? "public" : undefined);
    const placeId = input.placeId != null && String(input.placeId).trim()
      ? String(input.placeId).trim()
      : undefined;
    const gameInstanceId =
      input.gameInstanceId != null && String(input.gameInstanceId).trim()
        ? String(input.gameInstanceId).trim()
        : undefined;
    const universeId =
      input.universeId != null && String(input.universeId).trim()
        ? String(input.universeId).trim()
        : undefined;
    const playing = input.name?.trim() || "Roblox";
    const creatorName = input.creatorName?.trim() || undefined;

    // Launch first — Discord art must not delay opening Roblox.
    const graphics = useAppStore.getState().graphics;
    const res = await open(result.deepLink, graphics);
    if (!res.ok) {
      await window.sbDesktop?.openExternal(result.webUrl);
    }

    const baseActivity = {
      mode: "playing" as const,
      playing,
      placeId,
      gameInstanceId,
      universeId,
      creatorName,
      serverType,
    };
    void window.sbDesktop?.setDiscordActivity?.({
      ...baseActivity,
      iconUrl: input.iconUrl?.trim() || undefined,
    });
    void resolveGameIconUrl(input.placeId, input.iconUrl).then((iconUrl) => {
      if (!iconUrl) return;
      void window.sbDesktop?.setDiscordActivity?.({
        ...baseActivity,
        iconUrl,
      });
    });
  } else {
    window.open(result.webUrl, "_blank");
  }
  const installed = useAppStore.getState().robloxInstalled;
  if (installed === false) {
    await window.sbDesktop?.openExternal("https://www.roblox.com/download");
  }
  return result;
}
