// @ts-nocheck
import { useMemo, Component, type ReactNode, type ErrorInfo } from "react";
import sbLogo from "../assets/sb-logo.png";

class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("BrandModel failed:", error, info);
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function FallbackLogo() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "grid",
        placeItems: "center",
        gap: "0.4rem",
        color: "var(--sb-on-surface)",
        fontWeight: 800,
        fontSize: "1.2rem",
        letterSpacing: "-0.03em",
        opacity: 0.9,
      }}
    >
      <span>SB Launcher</span>
      <span style={{ fontSize: "0.78rem", fontWeight: 600, opacity: 0.7 }}>SB</span>
    </div>
  );
}

export function BrandModelViewer() {
  const gradient = useMemo(() => {
    if (typeof document === "undefined") return "linear-gradient(135deg, #9a82db, #efb8c8)";
    const s = getComputedStyle(document.documentElement);
    const c1 = s.getPropertyValue("--sb-primary").trim() || "#9a82db";
    const c2 = s.getPropertyValue("--sb-secondary").trim() || "#efb8c8";
    return `linear-gradient(135deg, ${c1}, ${c2})`;
  }, []);

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 340,
        height: 180,
        margin: "0 auto",
        position: "relative",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
        borderRadius: 12,
        background: "transparent",
        userSelect: "none",
      }}
      aria-label="SB Launcher logo"
    >
      <ModelErrorBoundary fallback={<FallbackLogo />}>
        <div
          style={{
            width: 180,
            height: 180,
            display: "grid",
            placeItems: "center",
          }}
        >
          <span
            aria-hidden
            style={{
              display: "block",
              width: 122,
              height: 122,
              background: gradient,
              WebkitMaskImage: `url(${sbLogo})`,
              maskImage: `url(${sbLogo})`,
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
              filter: "drop-shadow(0 8px 18px rgba(0,0,0,0.22))",
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                fontWeight: 900,
                fontSize: "1.55rem",
                color: "#0a0a0e",
                letterSpacing: "-0.04em",
              }}
            >
              SB
            </span>
          </span>
        </div>
      </ModelErrorBoundary>
    </div>
  );
}
