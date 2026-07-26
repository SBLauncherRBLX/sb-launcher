import { useEffect, useState } from "react";
import { Button } from "@sb/ui";
import type { AppUpdateInfo } from "../store";

type UpdatePhase =
  | "idle"
  | "preparing"
  | "downloading"
  | "verifying"
  | "installing"
  | "cancelled"
  | "error";

type ProgressEvent = {
  type?: string;
  phase?: string;
  percent?: number;
  message?: string;
};

type Props = {
  update: AppUpdateInfo;
  onClose: () => void;
};

export function UpdateInstallModal({ update, onClose }: Props) {
  const [keepPresets, setKeepPresets] = useState(true);
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [percent, setPercent] = useState(0);
  const [message, setMessage] = useState("Ready to install.");
  const busy = phase === "preparing" || phase === "downloading" || phase === "verifying" || phase === "installing";

  useEffect(() => {
    const unsub = window.sbDesktop?.onUpdateProgress?.((event: ProgressEvent) => {
      const nextPhase = (event.phase as UpdatePhase | undefined) ?? "downloading";
      setPhase(nextPhase);
      if (typeof event.percent === "number") setPercent(Math.max(0, Math.min(100, event.percent)));
      if (typeof event.message === "string" && event.message.trim()) setMessage(event.message);
    });
    return () => {
      unsub?.();
    };
  }, []);

  async function startInstall() {
    if (!window.sbDesktop?.startUpdate) {
      setPhase("error");
      setMessage("In-app updates require the desktop app.");
      return;
    }
    setPhase("preparing");
    setPercent(0);
    setMessage("Preparing update…");
    try {
      await window.sbDesktop.startUpdate({
        downloadUrl: update.downloadUrl,
        version: update.version,
        keepPresets,
      });
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : "Could not start update.");
    }
  }

  async function cancel() {
    await window.sbDesktop?.cancelUpdate?.();
    setPhase("cancelled");
    setMessage("Update cancelled.");
  }

  return (
    <div
      className="about-update-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="about-update-modal update-install-modal sb-card"
        role="dialog"
        aria-modal="true"
        aria-label="Install update"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="about-update-modal-header">
          <div>
            <h2>{update.title || "Install update"}</h2>
            <p className="sb-muted">Version {update.version}</p>
          </div>
          {!busy ? (
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </header>

        <div className="about-update-modal-body">
          {update.notes.trim() ? (
            <div className="about-update-notes">{update.notes}</div>
          ) : (
            <p className="sb-muted">No patch notes were published with this update.</p>
          )}

          <label className="checkbox-row update-keep-presets">
            <input
              type="checkbox"
              checked={keepPresets}
              disabled={busy}
              onChange={(event) => setKeepPresets(event.target.checked)}
            />
            Keep my presets (themes, graphics, wallpapers, custom icons)
          </label>
          {!keepPresets ? (
            <p className="sb-muted update-keep-presets-hint">
              Themes and local customizations will be reset. Your Roblox login stays signed in.
            </p>
          ) : null}

          {phase !== "idle" ? (
            <div className="update-progress-block" aria-live="polite">
              <div className="update-progress-track">
                <div className="update-progress-fill" style={{ width: `${percent}%` }} />
              </div>
              <div className="update-progress-meta">
                <span>{message}</span>
                <span>{percent}%</span>
              </div>
            </div>
          ) : null}

          {phase === "error" ? <div className="notice update-install-error">{message}</div> : null}
        </div>

        <div className="about-update-modal-actions update-install-actions">
          {busy ? (
            <>
              <Button variant="ghost" onClick={() => void cancel()} disabled={phase === "installing"}>
                Cancel
              </Button>
              <Button disabled>Installing…</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Later
              </Button>
              <Button onClick={() => void startInstall()}>Install update</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
