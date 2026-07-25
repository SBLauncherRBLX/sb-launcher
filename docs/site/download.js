(function () {
  // Files may be at repo root (browser upload) or under downloads/parts/
  const CANDIDATES = [
    { manifest: "./manifest.json", partsBase: "./" },
    { manifest: "./downloads/parts/manifest.json", partsBase: "./downloads/parts/" },
  ];

  async function sha256Hex(buffer) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function downloadAssembled() {
    const status = document.getElementById("download-status");
    const buttons = document.querySelectorAll("[data-download-setup]");
    const setStatus = (text) => {
      if (status) status.textContent = text;
    };
    buttons.forEach((b) => {
      b.setAttribute("aria-disabled", "true");
      b.classList.add("is-busy");
    });

    try {
      setStatus("Preparing download...");
      let manifest = null;
      let partsBase = "./";
      for (const c of CANDIDATES) {
        const manifestRes = await fetch(c.manifest, { cache: "no-store" });
        if (manifestRes.ok) {
          manifest = await manifestRes.json();
          partsBase = c.partsBase;
          break;
        }
      }
      if (!manifest) {
        throw new Error(
          "Manifest missing. Upload manifest.json + setup.partXX.bin next to index.html.",
        );
      }
      if (!manifest.sha256 || typeof manifest.sha256 !== "string") {
        throw new Error("Manifest is missing sha256 integrity field. Re-upload a fresh build.");
      }
      const chunks = [];
      const total = manifest.parts.length;
      const partHashes = Array.isArray(manifest.partSha256) ? manifest.partSha256 : null;

      for (let i = 0; i < manifest.parts.length; i++) {
        const name = manifest.parts[i];
        setStatus(`Downloading part ${i + 1} of ${total}...`);
        const res = await fetch(partsBase + name, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Part not found: ${name}`);
        }
        const buf = await res.arrayBuffer();
        if (partHashes && partHashes[i]) {
          const partHash = await sha256Hex(buf);
          if (partHash !== String(partHashes[i]).toLowerCase()) {
            throw new Error(`Integrity check failed for ${name}. Download aborted.`);
          }
        }
        chunks.push(buf);
      }

      setStatus("Verifying installer...");
      const blob = new Blob(chunks, { type: "application/octet-stream" });
      if (manifest.totalBytes && blob.size !== manifest.totalBytes) {
        throw new Error(
          `Size mismatch (${blob.size} vs ${manifest.totalBytes}). Download aborted.`,
        );
      }
      const fullBuffer = await blob.arrayBuffer();
      const fullHash = await sha256Hex(fullBuffer);
      if (fullHash !== String(manifest.sha256).toLowerCase()) {
        throw new Error("Installer SHA-256 mismatch. Download aborted.");
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = manifest.fileName || "SB-Launcher-Setup.exe";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatus("Download started. Run the installer when it finishes.");
    } catch (err) {
      console.error(err);
      setStatus(
        err instanceof Error
          ? err.message
          : "Download failed. Make sure all setup.partXX.bin files are on GitHub Pages.",
      );
    } finally {
      buttons.forEach((b) => {
        b.removeAttribute("aria-disabled");
        b.classList.remove("is-busy");
      });
    }
  }

  function bind() {
    document.querySelectorAll("[data-download-setup]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        void downloadAssembled();
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
