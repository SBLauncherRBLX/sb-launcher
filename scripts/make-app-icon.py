from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "apps" / "desktop" / "src" / "assets" / "sb-logo.png"
PNG_OUT = ROOT / "apps" / "native" / "Assets" / "SBLauncher.png"
ICO_OUT = ROOT / "apps" / "native" / "Assets" / "SBLauncher.ico"
SIZES = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    src.save(PNG_OUT, format="PNG", optimize=True)

    icons: list[Image.Image] = []
    for size in SIZES:
        canvas = Image.new("RGBA", size, (0, 0, 0, 0))
        resized = src.resize(size, Image.Resampling.LANCZOS)
        canvas.alpha_composite(resized)
        icons.append(canvas)

    # Largest first tends to produce a more reliable multi-size ICO in Explorer.
    icons[-1].save(
        ICO_OUT,
        format="ICO",
        sizes=SIZES,
        append_images=icons[:-1],
    )
    print(f"png={PNG_OUT.stat().st_size} ico={ICO_OUT.stat().st_size}")


if __name__ == "__main__":
    main()
