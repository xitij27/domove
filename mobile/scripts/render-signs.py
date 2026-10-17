"""Renders the map's construction-site signs (assets/signs/*.png) from the SVGs in docs/images/signs.

    python scripts/render-signs.py "<path to Chrome or Edge>"

Run it from mobile/ after changing a sign, its size or the planned badge. Needs Pillow. Each closure kind gets a
marker for current sites (the sign as it is) and one for planned sites (faded, with a yellow clock), at 1x, 2x
and 3x for React Native's density picking.
"""
import pathlib
import subprocess
import sys
import tempfile

from PIL import Image

MOBILE = pathlib.Path(__file__).resolve().parent.parent
SIGNS = MOBILE.parent / "docs" / "images" / "signs"
OUT = MOBILE / "assets" / "signs"

# closure kind (as in src/sites.ts) -> StVO sign
KINDS = {
    "full": "250-closed-to-vehicles",
    "one_way": "267-no-entry",
    "cycle_path": "254-no-bikes",
    "sidewalk": "259-no-pedestrians",
    "signal": "131-traffic-lights",
    "half": "121-narrows-one-side",
    "narrowing": "120-narrows",
    "other": "123-roadworks",
}
STATUSES = ["current", "planned"]
CELL = 32  # dp; the sign fits in 28 of them, leaving room for its shadow
SIGN = 28
GAP = 8  # between cells on the page, so no shadow spills into a neighbour's crop
PLANNED_OPACITY = 0.55
PLANNED_YELLOW = "#f9a825"  # the yellow of the planned pins before the signs

BADGE = f"""<svg class="badge" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6.2" fill="{PLANNED_YELLOW}" stroke="#fff" stroke-width="1.2"/>
<path d="M7 3.7V7l2.3 1.4" fill="none" stroke="#1a1d23" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>"""


def page():
    cells = []
    for row, status in enumerate(STATUSES):
        for col, svg in enumerate(KINDS.values()):
            src = (SIGNS / f"{svg}.svg").as_uri()
            badge = BADGE if status == "planned" else ""
            cells.append(
                f'<div class="cell {status}" style="left:{col * (CELL + GAP)}px;top:{row * (CELL + GAP)}px"><img src="{src}">{badge}</div>'
            )
    return f"""<!doctype html><meta charset="utf-8"><style>
html, body {{ margin: 0; background: transparent; }}
.cell {{ position: absolute; width: {CELL}px; height: {CELL}px; display: flex; align-items: center; justify-content: center; }}
img {{ width: {SIGN}px; height: {SIGN}px; object-fit: contain; filter: drop-shadow(0 0.5px 1.2px rgba(0, 0, 0, 0.55)); }}
.planned img {{ opacity: {PLANNED_OPACITY}; }}
.badge {{ position: absolute; right: 1px; bottom: 1px; width: 14px; height: 14px; filter: drop-shadow(0 0.5px 1px rgba(0, 0, 0, 0.5)); }}
</style>{''.join(cells)}"""


def main(browser):
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        html = pathlib.Path(tmp, "signs.html")
        html.write_text(page(), encoding="utf-8")
        for scale in (1, 2, 3):
            shot = pathlib.Path(tmp, f"signs@{scale}.png")
            subprocess.run([
                browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                f"--user-data-dir={tmp}/profile", f"--force-device-scale-factor={scale}",
                f"--window-size={len(KINDS) * (CELL + GAP) + 64},{len(STATUSES) * (CELL + GAP) + 64}",
                "--default-background-color=00000000", f"--screenshot={shot}", html.as_uri(),
            ], check=True, capture_output=True, timeout=60)
            sheet = Image.open(shot).convert("RGBA")
            px, step = CELL * scale, (CELL + GAP) * scale
            suffix = "" if scale == 1 else f"@{scale}x"
            for row, status in enumerate(STATUSES):
                for col, kind in enumerate(KINDS):
                    cell = sheet.crop((col * step, row * step, col * step + px, row * step + px))
                    cell.save(OUT / f"{kind}_{status}{suffix}.png", optimize=True)
    print(f"wrote {len(KINDS) * len(STATUSES) * 3} images to {OUT}")


if __name__ == "__main__":
    main(sys.argv[1])
