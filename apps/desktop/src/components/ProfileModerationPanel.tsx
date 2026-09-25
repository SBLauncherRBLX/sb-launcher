import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@sb/ui";
import { community, message } from "../lib/content";

type ModerationEntry = { id: string; at: string; adminId: string; action: "remove" | "unlock"; scope: string; reason: string };
type Inspection = {
  player: {
    id: string; username?: string; displayName?: string;
    cosmetics: {
      badge: { mode: string; customUrl?: string };
      avatar: { mode: string; customUrl?: string };
      banner: { mode: string; mediaUrl?: string | null };
      favoritesIsland?: { visible: boolean };
    };
    favoriteGames: Array<{ universeId: string; name: string; iconUrl?: string | null }>;
  };
  locks: string[];
  history: ModerationEntry[];
};

export function ProfileModerationPanel() {
  const [targetId, setTargetId] = useState("");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [scope, setScope] = useState("badge");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function inspect() {
    if (!/^\d+$/.test(targetId.trim())) { setStatus("Enter a Roblox user ID."); return; }
    setBusy(true); setStatus(""); setInspection(null);
    try { setInspection(await community<Inspection>("profiles.inspect", { userId: targetId.trim() })); setScope("badge"); }
    catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  }

  async function moderate(action: "remove" | "unlock") {
    if (!inspection || reason.trim().length < 10) { setStatus("Enter a reason of at least 10 characters."); return; }
    const label = scope.startsWith("game:") ? "selected game" : scope;
    if (action === "remove" && !window.confirm(`Remove ${label} from @${inspection.player.username ?? inspection.player.id} and block its return?`)) return;
    setBusy(true); setStatus("");
    try {
      const result = await community<Inspection>(`profiles.${action}`, { userId: inspection.player.id, scope, reason: reason.trim() });
      setInspection(result);
      if (action === "unlock" && scope.startsWith("game:")) setScope("badge");
      setStatus(action === "remove" ? `${label} removed and blocked.` : `${label} unblocked. Removed content was not restored.`);
      setReason("");
    } catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  }

  const player = inspection?.player;
  const locked = inspection?.locks.includes(scope) ?? false;
  return <section className="profile-moderation-panel" aria-label="Profile moderation">
    <div><h4>Profile moderation</h4><p className="sb-muted">Remove launcher-only profile content that breaks the rules. Every action requires a reason and appears in the audit history.</p></div>
    <div className="row-actions"><input className="sb-input" inputMode="numeric" aria-label="Profile Roblox user ID" placeholder="Roblox user ID" value={targetId} onChange={event => { setTargetId(event.target.value); setInspection(null); }} /><Button variant="secondary" disabled={busy} onClick={() => void inspect()}>Inspect profile</Button></div>
    {player && <>
      <div className="profile-moderation-target"><strong>{player.displayName ?? player.username ?? player.id}</strong><span className="sb-muted">@{player.username ?? player.id} · {player.id}</span><Link to={`/profile/${player.id}`}>Open profile</Link></div>
      <div className="profile-moderation-preview">
        <span>Badge: {player.cosmetics.badge.mode}{player.cosmetics.badge.customUrl && <img src={player.cosmetics.badge.customUrl} alt="Current badge" />}</span>
        <span>Photo: {player.cosmetics.avatar.mode}{player.cosmetics.avatar.customUrl && <img src={player.cosmetics.avatar.customUrl} alt="Current photo" />}</span>
        <span>Banner: {player.cosmetics.banner.mode}{player.cosmetics.banner.mediaUrl && player.cosmetics.banner.mode !== "video" && <img src={player.cosmetics.banner.mediaUrl} alt="Current banner" />}</span>
        <span>Favorites island: {player.cosmetics.favoritesIsland?.visible === false ? "hidden" : "visible"}</span>
      </div>
      <label>Element to moderate<select className="sb-input" value={scope} onChange={event => setScope(event.target.value)}>
        <option value="badge">Custom badge</option><option value="avatar">Custom profile photo</option><option value="banner">Banner</option><option value="favoritesIsland">Favorite games island</option><option value="favorites">All favorite games</option>
        {player.favoriteGames.map(game => <option key={game.universeId} value={`game:${game.universeId}`}>Game: {game.name}</option>)}
        {inspection.locks.filter(value => value.startsWith("game:") && !player.favoriteGames.some(game => `game:${game.universeId}` === value)).map(value => <option key={value} value={value}>Blocked game: {value.slice(5)}</option>)}
      </select></label>
      <label>Reason<textarea className="sb-input" rows={2} maxLength={500} placeholder="Describe the rule violation…" value={reason} onChange={event => setReason(event.target.value)} /></label>
      <div className="row-actions"><Button disabled={busy || locked || reason.trim().length < 10} onClick={() => void moderate("remove")}>Remove &amp; block</Button>{locked && <Button variant="secondary" disabled={busy || reason.trim().length < 10} onClick={() => void moderate("unlock")}>Unblock element</Button>}</div>
      {inspection.locks.length > 0 && <p className="sb-muted">Blocked: {inspection.locks.join(", ")}</p>}
      <div className="profile-moderation-history"><h5>Audit history</h5>{inspection.history.length ? inspection.history.map(entry => <div key={entry.id}><strong>{entry.action === "remove" ? "Removed" : "Unblocked"} {entry.scope}</strong><small>{new Date(entry.at).toLocaleString()} · Admin {entry.adminId}</small><p>{entry.reason}</p></div>) : <p className="sb-muted">No moderation actions for this profile.</p>}</div>
    </>}
    {status && <p role="status">{status}</p>}
  </section>;
}
