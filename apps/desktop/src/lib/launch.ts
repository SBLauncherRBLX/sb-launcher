import { api } from "../lib/api";
import { useAppStore } from "../store";

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
  universeId?: string;
  name?: string;
  iconUrl?: string | null;
  creatorName?: string | null;
  serverType?: "public" | "private" | "reserved";
}) {
  const result = await api.launch(input);
  const open = window.sbDesktop?.openRoblox;
  if (open) {
    const iconUrl = await resolveGameIconUrl(input.placeId, input.iconUrl);
    const serverType =
      input.serverType ??
      (input.gameInstanceId?.trim() ? "public" : undefined);
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
    void window.sbDesktop?.setDiscordActivity?.({
      mode: "playing",
      playing: input.name?.trim() || "Roblox",
      placeId,
      gameInstanceId,
      universeId,
      iconUrl,
      creatorName: input.creatorName?.trim() || undefined,
      serverType,
    });
    const graphics = useAppStore.getState().graphics;
    const res = await open(result.deepLink, graphics);
    if (!res.ok) {
      await window.sbDesktop?.openExternal(result.webUrl);
    }
  } else {
    window.open(result.webUrl, "_blank");
  }
  const installed = useAppStore.getState().robloxInstalled;
  if (installed === false) {
    await window.sbDesktop?.openExternal("https://www.roblox.com/download");
  }
  return result;
}
