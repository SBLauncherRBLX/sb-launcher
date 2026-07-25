import type { GameEvent } from "@sb/contracts";
import { cacheGet, cacheSet } from "../../lib/cache.js";
import { fetchJson } from "../../lib/http.js";

type RobloxEvent = {
  id?: string;
  title?: string;
  displayTitle?: string;
  subtitle?: string;
  displaySubtitle?: string;
  description?: string;
  displayDescription?: string;
  eventTime?: {
    startUtc?: string;
    endUtc?: string;
  };
  host?: {
    hostName?: string;
  };
  universeId?: number;
  placeId?: number;
  eventVisibility?: string;
  thumbnails?: Array<{
    mediaId?: number;
    rank?: number;
  }>;
};

export async function listGameEvents(universeId: string): Promise<GameEvent[]> {
  const cacheKey = `game-events:${universeId}`;
  const cached = await cacheGet<GameEvent[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJson<{
      data?: RobloxEvent[];
    }>(
      `https://apis.roblox.com/virtual-events/v1/universes/${encodeURIComponent(universeId)}/virtual-events`,
    );

    const publicEvents = (data.data ?? []).filter(
      (event) =>
        event.id &&
        event.placeId &&
        event.eventTime?.startUtc &&
        event.eventTime?.endUtc &&
        event.eventVisibility !== "private",
    );
    const mediaIds = publicEvents
      .map((event) =>
        [...(event.thumbnails ?? [])].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))[0]
          ?.mediaId,
      )
      .filter((id): id is number => typeof id === "number");
    const thumbnails = await eventThumbnails(mediaIds);
    const now = Date.now();

    const events = publicEvents
      .map((event): GameEvent => {
        const startUtc = event.eventTime!.startUtc!;
        const endUtc = event.eventTime!.endUtc!;
        const start = Date.parse(startUtc);
        const end = Date.parse(endUtc);
        const status: GameEvent["status"] =
          now < start ? "upcoming" : now <= end ? "live" : "ended";
        const mediaId = [...(event.thumbnails ?? [])].sort(
          (a, b) => (a.rank ?? 0) - (b.rank ?? 0),
        )[0]?.mediaId;

        return {
          id: String(event.id),
          universeId: String(event.universeId ?? universeId),
          placeId: String(event.placeId),
          title: event.displayTitle ?? event.title ?? "Roblox Event",
          subtitle: event.displaySubtitle ?? event.subtitle ?? "",
          description: event.displayDescription ?? event.description ?? "",
          startUtc,
          endUtc,
          status,
          hostName: event.host?.hostName ?? "",
          thumbnailUrl: mediaId ? (thumbnails[String(mediaId)] ?? null) : null,
          eventUrl: `https://www.roblox.com/events/${event.id}`,
        };
      })
      .filter((event) => event.status !== "ended")
      .sort((a, b) => {
        if (a.status === "live" && b.status !== "live") return -1;
        if (b.status === "live" && a.status !== "live") return 1;
        return Date.parse(a.startUtc) - Date.parse(b.startUtc);
      });

    await cacheSet(cacheKey, events, 120_000);
    return events;
  } catch {
    return [];
  }
}

async function eventThumbnails(
  mediaIds: number[],
): Promise<Record<string, string | null>> {
  if (!mediaIds.length) return {};
  const unique = [...new Set(mediaIds)];
  const url = new URL("https://thumbnails.roblox.com/v1/assets");
  url.searchParams.set("assetIds", unique.join(","));
  url.searchParams.set("size", "768x432");
  url.searchParams.set("format", "Png");
  url.searchParams.set("isCircular", "false");

  try {
    const data = await fetchJson<{
      data?: Array<{
        targetId: number;
        imageUrl?: string;
      }>;
    }>(url.toString());
    return Object.fromEntries(
      (data.data ?? []).map((thumbnail) => [
        String(thumbnail.targetId),
        thumbnail.imageUrl ?? null,
      ]),
    );
  } catch {
    return {};
  }
}
