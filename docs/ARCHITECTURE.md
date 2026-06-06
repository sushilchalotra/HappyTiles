# HappyTiles — Architecture

> This document describes the **current** structure of HappyTiles. Keep it in sync with
> reality: every structural change (new file, new module, changed data flow, new
> dependency, new constraint) must be reflected here in the same turn it happens.

## Overview

HappyTiles is a pure static, zero-build Progressive Web App of kids' games (Shape
Sudoku, sliding picture Puzzle). No frameworks, no npm, no build step — files are
served as-is. The app makes no network requests at runtime and stores only a few
local preferences.

## Tech stack

- HTML5, CSS3, vanilla JavaScript (no modules/bundler — plain `<script defer>`)
- PWA: `manifest.json` + cache-first service worker (`sw.js`)
- No external runtime dependencies; no webfonts (system font stack only)

## Directory structure

```
HappyTiles/
├─ CLAUDE.md                  # Agent operating instructions (auto-loaded each session)
├─ README.md                  # Run + deploy + testing instructions
├─ .github/workflows/
│  └─ deploy.yml              # Optional GitHub Pages deploy (uploads src/)
├─ docs/
│  ├─ ARCHITECTURE.md         # This file
│  └─ DECISIONS.md            # Decision log
├─ src/                       # The entire app (deploy THIS folder)
│  ├─ index.html              # App shell: header, home, sudoku view, puzzle view, win overlay
│  ├─ style.css               # Candy theme, responsive, a11y, reduced-motion
│  ├─ games-core.js           # PURE game logic (DOM-free, ES3-safe, testable)
│  ├─ app.js                  # DOM/UI: nav, audio, confetti, Sudoku & Puzzle controllers
│  ├─ manifest.json           # PWA manifest
│  ├─ sw.js                   # Service worker (cache-first; bump CACHE_VERSION per release)
│  └─ icons/icon.svg          # App / favicon / maskable icon
└─ tests/
   ├─ smoke-tests.js          # Shared DOM-free suite: runHappyTests(HappyCore)
   ├─ run-node.js             # Node runner (CI-friendly, exits non-zero on fail)
   ├─ run-cscript.js          # Windows cscript/JScript runner (zero install)
   └─ index.html              # In-browser runner (visual pass/fail)
```

## Modules & data flow

- **`games-core.js`** exposes a single global/CommonJS object `HappyCore` with pure
  functions only (no DOM, no audio). This is the testable heart of both games:
  - Sudoku: `sudokuGenerateSolution`, `sudokuNewPuzzle`, `sudokuConflicts`,
    `sudokuIsComplete`, `sudokuIsSolved`, `sudokuSolve`, `SUDOKU_CONFIG`.
  - Puzzle: `puzzleSolved`, `puzzleNeighbors`, `puzzleShuffle`, `puzzleIsSolved`,
    `puzzleIsSolvable`, `puzzleInversions`, `puzzleBlankValue`.
  - All randomness flows through an injectable `rng` (see `makeRng(seed)`) so tests
    are deterministic.
- **`app.js`** is the DOM/UI layer. It owns rendering, input, `localStorage`
  preferences, Web Audio sound effects, confetti, and hash-based navigation
  (`#home` / `#sudoku` / `#puzzle`). Its Sudoku and Puzzle controllers call into
  `HappyCore` for all generation/validation; they keep only view state.
- **Load order** (in `index.html`): `games-core.js` then `app.js` (both `defer`).
- **Persistence**: `localStorage` keys `ht_muted`, `ht_sudoku_symbols`,
  `ht_sudoku_size`, `ht_puzzle_pic`, `ht_puzzle_numbers`. Never leaves the device.

## Testing

`games-core.js` + `tests/smoke-tests.js` form a runtime-agnostic suite. The same file
runs under Node, the browser, and Windows `cscript` (it is written ES3-safe on purpose:
no template literals, arrows, `Array.from`, `forEach`, `Object.keys`, or
`Array.prototype.indexOf`). Status: **13 passing**. See README → Testing.

## Verifying in a real browser on THIS machine (no installs)

Even though `node`/`python` on PATH are Microsoft Store stubs, this box can run and
visually verify the app with tools already present:

- **Browser engine**: Google Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`
  (Edge also present). Use headless to render/screenshot/dump-DOM:
  - Run logic tests in a real DOM:
    `chrome --headless=new --disable-gpu --dump-dom file:///.../tests/index.html`
  - Screenshot a view (hash routing lets you target each screen):
    `chrome --headless=new --hide-scrollbars --window-size=430,860 --screenshot=out.png file:///.../src/index.html#sudoku`
  - Launch a fresh instance with `--user-data-dir=<tmp>` via `Start-Process -Wait`
    (otherwise it hands off to a running Chrome and exits without working).
- **Static server** (for service-worker / offline checks): a real Python ships with
  Azure CLI: `& 'C:\Program Files\Microsoft SDKs\Azure\CLI2\python.exe' -m http.server 8080 --directory src`
- This is how the build was verified: logic 13/13 in real Chrome, all three screens
  screenshotted, and the service worker confirmed registering + precaching all assets
  via the server's request log.

## Constraints in effect

See `CLAUDE.md` → "Technical constraints" for the authoritative list (mobile-first,
zero-build, privacy/COPPA+GDPR, PWA offline, WCAG AA accessibility, inline SVG only).

## Design choices in effect (kid-facing)

- Sudoku sizes 4×4 (default), 6×6, and 9×9; colorful shapes (nine of them) with a
  numbers toggle. Placement clears the active symbol after each fill (one square per pick).
- Puzzle 3×3 with built-in inline-SVG pictures (Kitty / Rocket / Flower) and a numbers
  overlay toggle.
- Generated Web-Audio sound effects with a global mute toggle.
- Bright "candy" palette, bouncy animations that fully collapse under reduced-motion.
- A themed confirm dialog guards actions that discard progress (Sudoku New / size change,
  Puzzle New) — only when a game is actually in progress. Other controls act instantly.

---

## Next

- Build is feature-complete against the Definition of Done and **verified in a real
  browser**: logic 13/13 (cscript + headless Chrome DOM), all three screens render
  correctly (screenshots), and the service worker registers + precaches all assets
  (server log). The user also confirmed it works great in their own browser.
- **Bug found & fixed during verification**: the win overlay was visible on load because
  `.win-overlay { display:grid }` overrode the `hidden` attribute. Fixed with a global
  `[hidden] { display:none !important }` rule in `style.css`.
- Post-launch feedback addressed (2026-06-06): fixed Sudoku auto-fill (clear active symbol
  after each placement); renamed puzzle "Shuffle" → "New"; added 9×9 Sudoku + 3 more shapes
  (now 9). SW cache bumped to v2. Verified 15/15 tests + headless screenshots of 9×9.
- Optional polish next: persist in-progress games (resume after reload); add real PNG
  app icons for best iOS "Add to Home Screen" fidelity (currently SVG-only); difficulty
  tuning per size; consider numbers-default at 9×9 since 9 shapes are harder to tell apart.
