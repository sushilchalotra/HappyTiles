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
├─ serve.mjs                  # Zero-dep Node dev server (node serve.mjs → :8080, LAN-accessible)
├─ .github/workflows/
│  └─ deploy.yml              # Optional GitHub Pages deploy (uploads src/)
├─ docs/
│  ├─ ARCHITECTURE.md         # This file
│  ├─ DECISIONS.md            # Decision log
│  ├─ MATH-QUEST.md           # Math Quest plan/northstar/roadmap
│  └─ CHESS.md                # Chess Academy plan/northstar/curriculum
├─ src/                       # The entire app (deploy THIS folder)
│  ├─ index.html              # App shell: header, home, sudoku view, puzzle view, win overlay
│  ├─ style.css               # Candy theme, responsive, a11y, reduced-motion
│  ├─ games-core.js           # PURE Sudoku/Puzzle logic (DOM-free, ES3-safe, testable)
│  ├─ math-core.js            # PURE adaptive math engine (DOM-free, ES3-safe, testable)
│  ├─ chess-core.js           # PURE chess engine + bot + curriculum (DOM-free, ES3-safe, perft-tested)
│  ├─ app.js                  # DOM/UI: nav, audio, confetti, Sudoku/Puzzle/Math/Chess controllers
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
  - Sudoku: `sudokuGenerateSolution`, `sudokuNewPuzzle` (optional `holes` override),
    `sudokuConflicts`, `sudokuIsComplete`, `sudokuIsSolved`, `sudokuSolve`, `SUDOKU_CONFIG`.
  - Puzzle: `puzzleSolved`, `puzzleNeighbors`, `puzzleShuffle`, `puzzleIsSolved`,
    `puzzleIsSolvable`, `puzzleInversions`, `puzzleBlankValue`.
  - Levels & scoring (pure data + math): `SUDOKU_LEVELS`, `PUZZLE_LEVELS`,
    `sudokuStars(mistakes)`, `puzzleStars(moves, par)`.
  - All randomness flows through an injectable `rng` (see `makeRng(seed)`) so tests
    are deterministic.
- **`math-core.js`** exposes a single global/CommonJS object `MathCore` — the pure,
  DOM-free adaptive engine for the **Math Quest** game (times-tables & division
  fluency). It owns the pedagogy and nothing else (no DOM/audio/storage/LLM):
  - Facts & teaching: `buildFacts`/`createInitialState` (45 unique facts, ×2–×10 with
    commutativity folded), `teachOrder`, `pickNewFact`, `strategyFor(a,b)`.
  - Play loop: `selectNext(facts,{mode,now,rng,excludeId})` (spaced-repetition + weakness
    weighted item selection), `makeQuestion`, `pickInputMode` (choice vs number-pad by
    stage), `makeChoices`, `grade(rec,correct,latencyMs,now)` (updates accuracy, speed,
    streak, Leitner box, mastery stage New→Learning→Reviewing→Fluent, and next-due time).
  - Placement & progress: `placementProbes`, `applyPlacement`, `summary`, `sessionStars`.
  - Worlds (meta-progression): `worlds` (per-table progress + complete/boss-ready flags),
    `worldFacts` (a world's owned facts, for Boss Battles), `worldOf`. `selectNext`
    accepts `opts.ids` to restrict selection to one world.
  - Like `games-core.js`: all randomness via injectable `rng`, all "now" passed in as ms,
    ES3-safe, and covered by the shared smoke-test suite. See `docs/MATH-QUEST.md`.
- **`chess-core.js`** exposes a single global/CommonJS object `ChessCore` — a pure,
  DOM-free chess **engine** for the Chess Academy game. 0x88 board; FEN parse/export;
  full legal move generation (`legalMoves`, with castling/en-passant/promotion),
  `makeMove`/`unmakeMove`, `isInCheck`, `gameStatus`, and `perft` (the correctness gate —
  startpos 20/400/8902, Kiwipete 48/2039). A beginner-leveled bot `bestMove(state, level,
  rng)` (negamax + alpha-beta, material + light center eval). The **curriculum** is pure
  data (`CHESS_UNITS`: piece mini-games, mate-in-one puzzles, play-vs-bot lessons), so
  tests verify every shipped puzzle has a mate-in-one and every mini-game is well-formed.
  ES3-safe; runs under Node/browser/cscript. See `docs/CHESS.md`.
- **`app.js`** is the DOM/UI layer. It owns rendering, input, `localStorage`
  preferences, Web Audio sound effects, confetti, and hash-based navigation
  (`#home` / `#sudoku` / `#puzzle`). Its Sudoku and Puzzle controllers call into
  `HappyCore` for all generation/validation; they keep only view state. Key modules:
  - `Scores` — persistent, local-only progression: furthest unlocked level + best-stars
    map per game; computes totals for the home dashboard; `record()` unlocks the next level.
  - `LevelPicker` — shared "choose a level" overlay (unlocked levels show best stars,
    locked show 🔒).
  - `Win` — win overlay now takes an options object and shows earned stars, an optional
    "⚡ Speedy!" badge, and a context-aware **Next level** button.
  - `renderHome()` — fills the home star total and per-card "Level N · x/max ★".
  - Sudoku/Puzzle controllers are **level-driven**: difficulty comes from the ladder
    index, not a manual size picker. The Puzzle board size `N` is now variable (3/4/5).
- **Load order** (in `index.html`): `games-core.js`, `math-core.js`, `chess-core.js`,
  then `app.js` (all `defer`).
- **Persistence**: `localStorage` keys `ht_muted`, `ht_sudoku_symbols`, `ht_puzzle_pic`,
  `ht_puzzle_numbers`, plus progression keys `ht_sudoku_level`, `ht_puzzle_level`
  (furthest unlocked index) and `ht_sudoku_stars`, `ht_puzzle_stars` (JSON best-stars
  maps). Never leaves the device. (`ht_sudoku_size` was retired — size now derives from level.)
  Math Quest adds `ht_math_facts` (JSON array of per-fact mastery records),
  `ht_math_profile` (`{placed, allowDivision, bosses, bestSpeedMs}`) and
  `ht_math_streak` (`{days, last}`). Chess Academy adds `ht_chess_progress` (furthest
  unlocked lesson index) and `ht_chess_stars` (JSON best-stars per lesson id). All local-only.

## Testing

`games-core.js` + `tests/smoke-tests.js` form a runtime-agnostic suite. The same file
runs under Node, the browser, and Windows `cscript` (it is written ES3-safe on purpose:
no template literals, arrows, `Array.from`, `forEach`, `Object.keys`, or
`Array.prototype.indexOf`). Covers Sudoku/Puzzle generation + validation and the new
level/scoring logic (hole overrides, every level config solvable, star ratings).
Status: **20 passing**. See README → Testing.

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

- **Levels & scoring**: each game is a difficulty ladder; beating your furthest level
  unlocks the next (a "🏆 Level N" button opens a level picker). Each solve earns 1–3
  **stars** based on care (Sudoku: mistakes; Puzzle: moves vs par) — careful play can
  always reach 3 stars. Speed is a separate, silent **⚡ Speedy!** bonus with **no
  on-screen clock** (deliberately, to avoid time-pressure anxiety). The home screen shows
  the running star total + per-game progress.
  - Sudoku ladder (9 levels): 4×4 (5/7/9 holes) → 6×6 (12/16/20) → 9×9 (34/40/46).
  - Puzzle ladder (5 levels): 3×3 (gentle/hard) → 4×4 (×2) → 5×5. Board size `N` is variable.
- Sudoku colorful shapes (nine of them) with a numbers toggle. Placement clears the active
  symbol after each fill (one square per pick).
- Puzzle built-in inline-SVG pictures (Kitty / Rocket / Flower) and a numbers overlay toggle.
- Generated Web-Audio sound effects with a global mute toggle.
- Bright "candy" palette, bouncy animations (incl. star pop) that fully collapse under reduced-motion.
- A themed confirm dialog guards actions that discard progress (Sudoku New / level change,
  Puzzle New / level change) — only when a game is actually in progress. Other controls act instantly.

---

## Next

- **Chess Academy — Phase 1 (MVP) shipped (2026-06-30)**: a fourth game — a structured
  beginner chess academy. Engine `src/chess-core.js` (`ChessCore`): perft-correct move
  gen + leveled bot + curriculum data. UI: a `Chess` controller in `app.js` (lesson path,
  piece "collect the gems" mini-games, mate-in-one puzzles, play-vs-bot), `#view-chess`
  + a home Chess tile, **inline-SVG pieces**, chess styles in `style.css`, `card-chess`
  gradient. State in `ht_chess_*`. SW cache **v10**. Plan/curriculum in `docs/CHESS.md`;
  rationale in DECISIONS 2026-06-30. Verified: **52/52** smoke tests (incl. perft + every
  puzzle/mini-game) and a headless drive of a mini-game (3★), a mate-in-one, and a live
  game vs the bot (zero JS errors), pieces clearly White vs Black on a phone viewport.
  **Next for Chess (Phase 2)**: castling/en-passant lesson, tactics trainer (fork/pin/
  skewer), guided endgame mates (K+Q, K+R), opening principles, a promotion picker, hints,
  take-back, optional coordinates/notation, and stronger bot scaling.
- **Math Quest — Phase 0 + Phase 1 (MVP) shipped (2026-06-29)**: a third game, an
  adaptive multiplication/division fluency trainer. Plan/northstar/roadmap in
  `docs/MATH-QUEST.md`; rationale in DECISIONS 2026-06-29.
  - **Engine** (`src/math-core.js`, `MathCore`): offline spaced-repetition + mastery
    stages (accuracy AND speed gated) + adaptive placement + question/distractor
    generation. Covered by the shared suite (`MathCore` passed as a 2nd arg through
    all three runners — `run-node.js`, `run-cscript.js`, `tests/index.html`).
  - **UI**: `#view-math` + Math home tile in `index.html`; a `MathGame` controller in
    `app.js` (placement flow → adaptive 10-question sessions, choice vs number-pad
    input by mastery stage, a new-fact strategy card, daily streak, session stars via
    the shared Win overlay/confetti/audio); math styles in `style.css`; `card-math`
    home gradient. State in `ht_math_facts` / `ht_math_profile` / `ht_math_streak`.
    Every fluent fact adds a star to the home headline total.
  - **SW**: `./math-core.js` added to precache; cache bumped to **v8** (Phase 2).
  - **Verified**: **37/37** smoke tests (Node); `node --check` on app.js/math-core.js/
    sw.js. Full app **auto-driven in headless Chrome over the DevTools Protocol**
    (zero-dep CDP script): placement (18 probes) → mastery seeded → 10-question session
    with number-pad + division input → session Win with 3 stars + Speedy badge → a
    deliberate wrong answer correctly demoted a fluent fact (45→44) and persisted —
    **zero JS errors**. Responsive screenshots confirmed at iPad (820), iPhone 17 Pro
    Max (440) and S24 Ultra (412): home grid reflows (3-col → 2-col), and the question
    card / 2×2 choice grid / number pad all fit the narrowest width.
  - **Phase 2 shipped (2026-06-29)**: World Map (9 worlds, 🏆 on mastery), per-world
    Boss Battles, personal-best Speed records, and the ×/÷ fact family on strategy cards.
    See DECISIONS 2026-06-29 (second entry). Engine +5 tests (**42/42**); headless
    screenshots of the map, a launched ×7 boss, the start screen, and the strategy card.
  - **Next for Math (Phase 3+)**: a parent dashboard (offline mastery heatmap + speed
    trends), then the optional, off-hot-path AI layer (weekly parent report + cached
    themed word problems behind consent). (Note: the choice-mode + new-fact strategy-card
    paths are engine-tested and screenshotted; an imperfect/slower *human* session is what
    surfaces them mid-play — worth one casual real-device run with your daughter.)
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
- **Levels & scoring shipped (2026-06-13)**: difficulty ladders per game (Sudoku 9 levels,
  Puzzle 5 levels incl. variable 4×4/5×5 boards), 1–3 star ratings from accuracy/moves, a
  silent ⚡ Speedy time bonus (no on-screen clock), unlock-as-you-win progression, a level
  picker, a home star dashboard, and a win overlay with animated stars + Next-level button.
  All state is local (`ht_*_level`, `ht_*_stars`). SW cache bumped to v6. Verified: **20/20**
  smoke tests (cscript), clean boot in real Chrome (DOM dump shows the dashboard populated),
  and headless screenshots of home + both games. See DECISIONS 2026-06-13.
- Optional polish next: persist an *in-progress* game (resume mid-puzzle after reload — the
  ladder position persists, but a partially-filled board does not); tune star/par thresholds
  and the Speedy windows from real play; add real PNG app icons for iOS "Add to Home Screen";
  a "Levels" hint/celebration when a brand-new board size first unlocks. Interactive overlay
  flows are code-reviewed but were not auto-driven (no browser-driver on this box) — worth a
  manual click-through of: solve → stars/Next, level picker lock/unlock, change-level confirm.
