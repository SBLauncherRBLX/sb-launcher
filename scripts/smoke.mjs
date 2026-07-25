const base = "http://localhost:8787";

async function main() {
  const health = await (await fetch(`${base}/health`)).json();
  console.log("health", health);

  const games = await (await fetch(`${base}/api/games`)).json();
  console.log("games", games.items.length, games.items[0]?.name);

  const start = await fetch(`${base}/auth/roblox/start?desktopRedirect=sblauncher://auth`, {
    redirect: "manual",
  });
  const loc = start.headers.get("location");
  console.log("start", start.status, loc);

  const demo = await fetch(loc, { redirect: "manual" });
  const html = await demo.text();
  const match = html.match(/sblauncher:\/\/auth\?token=([^"'&\s]+)/);
  console.log("demo status", demo.status, "hasToken", Boolean(match?.[1]));

  if (!match?.[1]) throw new Error("No session token in demo login response");
  const token = decodeURIComponent(match[1]);

  const session = await (
    await fetch(`${base}/api/session`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  console.log("session", session.authenticated, session.user?.username);

  const friends = await (
    await fetch(`${base}/api/friends`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  console.log("friends", friends.items.length);

  const avatar = await (
    await fetch(`${base}/api/avatar`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  console.log("avatar wearing", avatar.currentlyWearing.length);

  const servers = await (await fetch(`${base}/api/games/2753915549/servers`)).json();
  console.log("servers", servers.items.length, servers.items[0]?.region);

  const launch = await (
    await fetch(`${base}/api/launch`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        placeId: "2753915549",
        universeId: "1",
        name: "Blox Fruits",
      }),
    })
  ).json();
  console.log("launch", launch.deepLink);

  console.log("OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
