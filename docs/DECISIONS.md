# HappyTiles — Decision Log

> Append a new entry for every **key decision**: anything that (a) is hard to reverse,
> (b) trades off two reasonable options, (c) affects privacy/accessibility/offline
> behavior, (d) changes the tech stack, or (e) affects deployment. Routine bug fixes
> and cosmetic tweaks do NOT belong here. Newest entries go at the bottom.

## Entry format

```
### YYYY-MM-DD — <short title>
- **Decision**: what was decided.
- **Context**: what problem/question prompted it.
- **Alternatives considered**: the other reasonable option(s) and why they lost.
- **Consequences**: what this commits us to / what it rules out.
```

---

### 2026-06-06 — Adopt CLAUDE.md + docs for session continuity
- **Decision**: Use a root `CLAUDE.md` (auto-loaded by Claude Code every session) as the agent's operating instructions, with `docs/ARCHITECTURE.md` and `docs/DECISIONS.md` as the persistent state that lets a fresh session resume in one read.
- **Context**: The original `ProjectPrompt.md` defined a continuity protocol, but nothing pointed a new session to it, so the protocol never fired automatically.
- **Alternatives considered**: Keep `ProjectPrompt.md` and add a small pointer `CLAUDE.md` — rejected in favor of converting the prompt directly into `CLAUDE.md` for a single source of truth.
- **Consequences**: Each new session auto-loads `CLAUDE.md`, which instructs reading these docs (incl. the `## Next` block) before acting. The docs must be kept current for resumption to work.

### 2026-06-06 — Kid-facing game design choices
- **Decision**: Sudoku uses colorful shapes by default with a numbers toggle (4×4 default, 6×6 option). The sliding puzzle uses built-in inline-SVG pictures with a numbers-overlay toggle (3×3). Add generated Web-Audio sound effects with a global mute. Use a bright "candy" theme.
- **Context**: The prompt left these as either/or choices ("numbers or symbols", "image or color blocks"); confirmed with the user before building.
- **Alternatives considered**: Numbers-only / shapes-only Sudoku; color-block or number-only puzzle tiles; no sound; pastel or primary themes — all viable, chosen options judged most "attractive and cool" for kids while staying accessible.
- **Consequences**: Shapes are inline SVG (no assets, honors the SVG-first constraint). Sound is synthesized at runtime (no audio files, stays offline). Reduced-motion fully disables animation/confetti.

### 2026-06-06 — Split pure game logic into games-core.js
- **Decision**: Extract all DOM-free game logic (Sudoku generate/validate/solve, puzzle moves/shuffle/solvability) into `src/games-core.js`, exposed as `HappyCore` (browser global + CommonJS). `app.js` keeps only DOM/UI and calls into it. Randomness is injectable via `rng`.
- **Context**: The testing requirement needs the logic runnable outside a browser; mixing it with the DOM made it untestable.
- **Alternatives considered**: Keep logic inside `app.js` and test via a headless browser — rejected (heavier, and no Node/browser runner is available on this machine).
- **Consequences**: Logic is unit-testable and deterministic. Slight indirection in `app.js`. `games-core.js` must remain DOM-free.

### 2026-06-06 — Confirm before discarding an in-progress game
- **Decision**: Add a themed confirm dialog (`#confirm-overlay`, reuses win-card styling) shown
  before actions that throw away progress: Sudoku **New** and **size change**, and Puzzle **New** —
  but only when a game is actually in progress (some non-clue squares filled / moves made, not yet
  solved). Tapping the current size button is now a no-op. Non-destructive controls
  (Shapes/Numbers, Picture, Numbers-overlay, Undo, Back) are never gated.
- **Context**: User accidentally lost progress by tapping size/New buttons. (Back already preserves
  state via the per-view `started` init guard.)
- **Alternatives considered**: Native `confirm()` — rejected as not kid-friendly. Auto-save/restore —
  deferred as a future enhancement (offered, not chosen now).
- **Consequences**: One extra tap only when there's something to lose; default focus is the safe
  "Keep playing". SW cache bumped to v5. Verified: dialog renders correctly, app boots clean, 15/15 tests.

### 2026-06-06 — Symbol toggle labels the action, not the current state
- **Decision**: The Sudoku Shapes/Numbers toggle now labels what tapping switches TO (shapes
  shown → button reads "Numbers"; numbers shown → "Shapes"), with `aria-label` "Switch to …"
  and no `aria-pressed`. Disable the service worker on localhost (auto-unregister + clear
  caches) so code edits reflect on a normal reload; production still registers the SW.
- **Context**: User feedback — the toggle previously showed the current mode, which read as
  backwards for a button. Also lost dev time to a stale SW serving old code on localhost.
- **Alternatives considered**: Keep state-label with pressed styling — rejected as confusing.
  For dev caching: rely on DevTools "Disable cache" — rejected (only works with DevTools open
  and doesn't remove the SW).
- **Consequences**: Button now reads as an action. Offline can't be tested on localhost (use a
  deployed URL). SW cache bumped to v4.

### 2026-06-06 — Sudoku: add 9×9, nine shapes, and deliberate-placement UX
- **Decision**: Add a 9×9 size (3×3 boxes, 40 holes) alongside 4×4/6×6. Extend the shape
  set from 6 to 9 (added diamond, pentagon, cross) so shapes-mode works at 9×9. Change
  placement so the active symbol/selection is cleared after each fill (one square per pick).
  Rename the sliding puzzle's "Shuffle" button to "New". (Numbers⇄Shapes toggle already existed.)
- **Context**: User feedback after play: empty squares auto-filled with the previously used
  symbol (armed symbol persisted); puzzle's "Shuffle" wording; wanted a 9×9 option.
- **Alternatives considered**: For 9×9, force numbers-only (9 shapes are harder to tell apart)
  — rejected; kept the user's requested freedom to pick numbers or shapes at any size. Keeping
  "rapid multi-fill" placement — rejected per the user's explicit ask to clear after each fill.
- **Consequences**: 9 shapes pushes kid-distinguishability; numbers may be easier at 9×9 (toggle
  available). 9×9 generation uses the same backtracking solver (fast in practice). Verified:
  15/15 smoke tests, and 9×9 renders in both numbers and shapes mode (headless screenshots).

### 2026-06-06 — ES3-safe, runtime-agnostic smoke tests
- **Decision**: Write one shared suite (`tests/smoke-tests.js`) that runs unchanged under Node, the browser, and Windows `cscript`/JScript. Keep `games-core.js` and the suite ES3-safe (no template literals, arrows, `Array.from`, `forEach`, `Object.keys`, `Array.prototype.indexOf`).
- **Context**: This dev machine has only Microsoft Store *stub* Python/Node (non-functional); the only working JS engine present is the built-in Windows Script Host (`cscript`), which is ES3-era.
- **Alternatives considered**: Node-only Jest/assert suite — rejected because nothing could execute it here, leaving the build unverified.
- **Consequences**: Tests actually ran and caught a bug (a wrong reverse-move sequence in a test). Logic verified 13/13. Cost: `games-core.js` uses an older JS style than `app.js`. If the core ever needs modern syntax, the cscript path would need a transpile step or removal.
