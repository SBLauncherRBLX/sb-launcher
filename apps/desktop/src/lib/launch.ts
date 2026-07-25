import { api } from "../lib/api";
import { useAppStore } from "../store";

export async function launchExperience(input: {
  placeId?: string;
  gameInstanceId?: string;
  userId?: string;
  universeId?: string;
  name?: string;
  iconUrl?: string | null;
}) {
  const result = await api.launch(input);
  const open = window.sbDesktop?.openRoblox;
  if (open) {
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
