import { useEffect, useState } from "react";
import { Button } from "@sb/ui";
import { community, message } from "../lib/content";
import { useAppStore } from "../store";
import { ProfileModerationPanel } from "./ProfileModerationPanel";

type Role = "admin" | "moderator" | "member";

export function CommunityRoles() {
  const userId = useAppStore(state => state.session?.user?.id);
  const [role, setRole] = useState<Role>("member");
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    setRole("member");
    if (userId) void community<{ role: Role }>("roles.me").then(result => { if (live) setRole(result.role); }).catch(() => {});
    return () => { live = false; };
  }, [userId]);
  if (!userId || role === "member") return null;
  async function setModerator(next: "moderator" | "member") {
    if (!/^\d+$/.test(target.trim())) { setStatus("Enter a Roblox user ID."); return; }
    setBusy(true); setStatus("");
    try {
      await community("roles.set", { userId: target.trim(), role: next });
      setStatus(next === "moderator" ? "Moderator assigned." : "Moderator role removed.");
      setTarget("");
    } catch (error) { setStatus(message(error)); }
    finally { setBusy(false); }
  }
  return <section className="rail community-roles"><div className="rail-title"><h3>Community team</h3></div><p className="sb-muted">Your role: {role}. Moderators can remove messages from room chats.</p>
    {role === "admin" && <><div className="row-actions"><input className="sb-input" aria-label="Roblox user ID" inputMode="numeric" placeholder="Roblox user ID" value={target} onChange={event => setTarget(event.target.value)} /><Button disabled={busy} onClick={() => void setModerator("moderator")}>Add moderator</Button><Button variant="secondary" disabled={busy} onClick={() => void setModerator("member")}>Remove role</Button></div><ProfileModerationPanel /></>}
    {status && <p role="status">{status}</p>}
  </section>;
}
