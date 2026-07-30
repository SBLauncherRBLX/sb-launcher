import { useEffect, useState } from "react";
import type { GameDetails, SavedPrivateServer } from "@sb/contracts";
import {
  buildPrivateServerInviteUrl,
  parsePrivateServerInvite,
} from "@sb/contracts";
import { Button, EmptyState } from "@sb/ui";
import { api } from "../lib/api";
import { launchExperience } from "../lib/launch";
import { useAppStore } from "../store";

export function PrivateServersPanel({ game }: { game: GameDetails }) {
  const session = useAppStore((s) => s.session);
  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState<SavedPrivateServer[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function refresh() {
    if (!session?.authenticated) {
      setItems([]);
      return;
    }
    try {
      const page = await api.privateServers({ universeId: game.universeId });
      setItems(page.items);
    } catch {
      setItems([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void api
      .privateServersEnabled(game.universeId)
      .then((res) => {
        if (!cancelled) setEnabled(res.enabled);
      })
      .catch(() => {
        if (!cancelled) setEnabled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [game.universeId]);

  useEffect(() => {
    void refresh();
  }, [game.universeId, session?.authenticated]);

  async function joinInvite(accessCode: string, placeId: string) {
    setBusy(true);
    setMessage(null);
    try {
      await launchExperience({
        placeId,
        accessCode,
        universeId: game.universeId,
        name: game.name,
        iconUrl: game.iconUrl,
        creatorName: game.creatorName,
        serverType: "private",
      });
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not join private server");
    } finally {
      setBusy(false);
    }
  }

  async function joinAndMaybeSave(save: boolean) {
    const parsed = parsePrivateServerInvite(inviteInput, game.placeId);
    if (!parsed?.accessCode) {
      setMessage("Paste a private server invite link or access code.");
      return;
    }
    const placeId = parsed.placeId || game.placeId;
    if (!placeId) {
      setMessage("Could not determine placeId for this invite.");
      return;
    }

    if (save) {
      if (!session?.authenticated) {
        setMessage("Sign in to save private servers.");
        return;
      }
      setBusy(true);
      setMessage(null);
      try {
        await api.savePrivateServer({
          universeId: game.universeId,
          placeId,
          accessCode: parsed.accessCode,
          label: labelInput.trim() || "Private server",
          gameName: game.name,
          iconUrl: game.iconUrl,
        });
        setInviteInput("");
        setLabelInput("");
        await refresh();
        setMessage("Private server saved.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Could not save private server");
        setBusy(false);
        return;
      }
      setBusy(false);
    }

    await joinInvite(parsed.accessCode, placeId);
  }

  async function copyLink(server: SavedPrivateServer) {
    const url = buildPrivateServerInviteUrl(server.placeId, server.accessCode);
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Invite link copied.");
    } catch {
      setMessage(url);
    }
  }

  async function commitRename(server: SavedPrivateServer) {
    const label = renameValue.trim();
    if (!label || label === server.label) {
      setRenamingId(null);
      return;
    }
    setBusy(true);
    try {
      await api.renamePrivateServer(server.id, label);
      await refresh();
      setRenamingId(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  }

  async function remove(server: SavedPrivateServer) {
    setBusy(true);
    setMessage(null);
    try {
      await api.removePrivateServer(server.id);
      await refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(false);
    }
  }

  function openManageOnRoblox() {
    const url = `https://www.roblox.com/games/${encodeURIComponent(game.placeId)}#!/game-instances`;
    void window.sbDesktop?.openExternal(url);
  }

  return (
    <section className="rail private-servers-section">
      <div className="rail-title">
        <div>
          <h3>Private servers</h3>
          <p className="sb-muted rail-subtitle">
            Join with an invite link or access code. Save servers here to manage them in SB Launcher.
            {!enabled
              ? " Roblox reports VIP create may be off for this experience — invites can still work."
              : " Create/buy VIP stays on the Roblox site."}
          </p>
        </div>
        <Button variant="secondary" onClick={openManageOnRoblox}>
          Manage on Roblox
        </Button>
      </div>

      <div className="sb-card private-server-form">
        <label>
          Invite link or access code
          <input
            className="sb-input"
            value={inviteInput}
            placeholder="https://www.roblox.com/games/…?privateServerLinkCode=… or code"
            onChange={(e) => setInviteInput(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          Name (optional, when saving)
          <input
            className="sb-input"
            value={labelInput}
            maxLength={64}
            placeholder="Friends VIP"
            onChange={(e) => setLabelInput(e.target.value)}
            disabled={busy}
          />
        </label>
        <div className="row-actions">
          <Button disabled={busy || !inviteInput.trim()} onClick={() => void joinAndMaybeSave(false)}>
            Join
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !inviteInput.trim() || !session?.authenticated}
            onClick={() => void joinAndMaybeSave(true)}
          >
            Save &amp; join
          </Button>
        </div>
        {!session?.authenticated ? (
          <p className="sb-muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            Sign in to save private servers to your account on this PC.
          </p>
        ) : null}
        {message ? (
          <p className="sb-muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            {message}
          </p>
        ) : null}
      </div>

      {session?.authenticated ? (
        items.length === 0 ? (
          <EmptyState
            title="No saved private servers"
            description="Paste an invite link above and choose Save & join."
          />
        ) : (
          <div className="server-list private-server-list">
            {items.map((server) => (
              <div key={server.id} className="sb-card server-row private-server-row">
                <div className="grow">
                  {renamingId === server.id ? (
                    <input
                      className="sb-input"
                      value={renameValue}
                      maxLength={64}
                      autoFocus
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void commitRename(server)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitRename(server);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                    />
                  ) : (
                    <strong>{server.label}</strong>
                  )}
                  <div className="sb-muted private-server-code">
                    Code ···{server.accessCode.slice(-4)}
                  </div>
                </div>
                <div className="row-actions private-server-actions">
                  <Button
                    disabled={busy}
                    onClick={() => void joinInvite(server.accessCode, server.placeId)}
                  >
                    Join
                  </Button>
                  <Button variant="secondary" disabled={busy} onClick={() => void copyLink(server)}>
                    Copy link
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setRenamingId(server.id);
                      setRenameValue(server.label);
                    }}
                  >
                    Rename
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void remove(server)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}
