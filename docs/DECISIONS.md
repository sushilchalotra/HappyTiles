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

### 2026-06-13 — Levels, stars, and a no-clock speed bonus
- **Decision**: Add per-game **difficulty ladders** (Sudoku 9 levels: 4×4→6×6→9×9 with rising
  holes; Puzzle 5 levels: 3×3→4×4→5×5 with harder shuffles) where beating your furthest level
  unlocks the next. Award **1–3 stars per solve from accuracy only** (Sudoku: mistakes made;
  Puzzle: moves vs a generous par) so careful play can always reach 3 stars. Treat **speed as a
  separate, purely-additive "⚡ Speedy!" badge with NO on-screen clock**. Persist progression
  locally (`ht_sudoku_level`/`ht_puzzle_level` = furthest unlocked index; `ht_sudoku_stars`/
  `ht_puzzle_stars` = JSON best-stars maps). Replace Sudoku's manual size buttons with a
  level-driven flow; the Puzzle board size `N` becomes variable. Surface a star total + per-game
  progress on the home screen and animated stars + a Next-level button on the win overlay.
- **Context**: User wanted scoring + levels to motivate kids to "cross levels and score better."
  They liked the idea of a time element but worried a running clock would create anxiety.
- **Alternatives considered**: (a) *Stars only, free play* — simplest, but no progression pull;
  rejected. (b) *Free play + separate Adventure mode* — most complete, but double the UI; rejected
  as over-scoped for now. (c) *Timer in the rating* (countdown or visible count-up) — rejected
  because tying stars to a clock pressures young kids; resolved by making time a hidden, additive
  bonus that can never cost a star. (d) Guaranteeing unique Sudoku solutions at high hole counts —
  not added; "complete with no conflicts" still counts as solved (kid-appropriate, matches prior
  behavior), and the solver confirms every level config is solvable.
- **Consequences**: Difficulty is now data (`SUDOKU_LEVELS`/`PUZZLE_LEVELS` in `games-core.js`),
  so tuning is a table edit. Progression is local-only (still COPPA/GDPR-clean, offline). The
  Sudoku size-picker UI is gone (levels drive size). Star/par/Speedy thresholds are first-pass and
  may need tuning from real play. SW cache bumped to **v6**. Verified: 20/20 smoke tests, clean
  boot in real Chrome (DOM dump), and headless screenshots of home + both games.

### 2026-06-29 — Add "Math Quest": an adaptive times-tables game (3rd game)
- **Decision**: Build a multiplication/division **fluency trainer** as a THIRD game
  *inside* HappyTiles (not a separate app), reusing the home/stars/audio/confetti/PWA
  shell. The adaptive "brain" is a new pure module `src/math-core.js` (the counterpart
  to `games-core.js`) that runs **fully offline and deterministically** — spaced
  repetition (Leitner boxes), per-fact mastery stages (New→Learning→Reviewing→Fluent)
  gated on **both accuracy and response time**, weighted item selection, adaptive
  placement, and pedagogical question/distractor generation. Input is **adaptive**:
  multiple-choice while learning a fact, number-pad typing once building fluency.
  Each fluent fact counts as a star toward the home total. New keys: `ht_math_facts`,
  `ht_math_profile`, `ht_math_streak`. Plan/northstar/roadmap captured in
  `docs/MATH-QUEST.md`.
- **Context**: The user (parent) wants their early-3rd-grade daughter to memorize the
  2–10 tables and do divisions faster, via a motivating, adaptive game. They asked
  whether it should live in HappyTiles or be standalone, and whether to use an LLM.
- **Alternatives considered**: (a) *Separate standalone PWA* — cleaner identity and
  unlimited room, but throws away the existing shell/progression/audio/PWA/deploy and
  splits the child's experience across two installs; rejected for reuse + one-app
  motivation. (b) *LLM in the gameplay loop* — rejected: a speed game needs instant
  questions, and an LLM round-trip would add latency, cost, and an online dependency,
  breaking HappyTiles' offline-first, privacy-first, zero-build ethos. The genuine
  pedagogy (SRS, mastery, placement) is well-understood and runs better as a fast,
  free, offline, testable engine. (c) *No AI ever* — viable, but we keep the door open.
- **Consequences**: Commits us to an offline, deterministic engine covered by the
  shared smoke-test suite (ES3-safe, like `games-core.js`). The home "stars" headline
  now also sums math mastery. Any future AI (parent weekly reports, themed word
  problems) must stay **off the child's gameplay hot path** — async, parent-initiated,
  cached, behind consent — and would run as a separate serverless function so the
  static app stays zero-build and offline. SW cache will bump when the math assets ship.

### 2026-06-29 — Math Quest Phase 2: worlds, boss battles, speed records
- **Decision**: Add a meta-progression layer to Math Quest. Partition the 45 facts
  into nine **"worlds"** (one per table), where each fact is owned by the earliest
  table in teaching order that introduces it (so 7×8 ∈ the ×7 world). A world is
  **complete** when all its owned facts are fluent (earns a 🏆), and **boss-ready**
  when every owned fact is at least *reviewing* but not all fluent. A **Boss Battle**
  is a focused session over one world's facts (`selectNext` gained an `opts.ids`
  restriction); beating it (~10/12) records the world in `profile.bosses`. **Speed
  Rounds** track a personal-best median (`profile.bestSpeedMs`) and celebrate new
  records. The **strategy card** now shows the full ×/÷ **fact family** (deduped for
  squares) when division is on. New UI: a World Map screen + start-screen Boss/Map
  shortcuts. All pure logic (`worlds`, `worldFacts`, `worldOf`) lives in `math-core.js`
  and is unit-tested.
- **Context**: Phase 1 gave a working adaptive loop; Phase 2 adds the long-term
  "why keep playing" — a visible map that grows, trophies, and speed goals.
- **Alternatives considered**: (a) A free-form collectible (creatures/garden) decoupled
  from tables — cuter but disconnected from the actual learning structure; rejected in
  favor of worlds == tables, so the meta-progress *is* the curriculum. (b) Bosses gated
  on full fluency — rejected; gating on "all reviewing" gives a reachable challenge that
  itself pushes facts toward fluent. (c) A visible countdown clock for speed — still
  rejected (HappyTiles' no-anxiety stance); speed stays a personal-best celebration.
- **Consequences**: `ht_math_profile` now also stores `bosses` and `bestSpeedMs`
  (still local-only). SW cache bumped to **v8**. Also added a zero-dep dev server
  `serve.mjs` (Node) since the documented Azure-Python path was awkward. Verified:
  **42/42** smoke tests + headless screenshots of the map, a launched ×7 boss, the
  start screen, and the fact-family strategy card.

### 2026-06-06 — ES3-safe, runtime-agnostic smoke tests
- **Decision**: Write one shared suite (`tests/smoke-tests.js`) that runs unchanged under Node, the browser, and Windows `cscript`/JScript. Keep `games-core.js` and the suite ES3-safe (no template literals, arrows, `Array.from`, `forEach`, `Object.keys`, `Array.prototype.indexOf`).
- **Context**: This dev machine has only Microsoft Store *stub* Python/Node (non-functional); the only working JS engine present is the built-in Windows Script Host (`cscript`), which is ES3-era.
- **Alternatives considered**: Node-only Jest/assert suite — rejected because nothing could execute it here, leaving the build unverified.
- **Consequences**: Tests actually ran and caught a bug (a wrong reverse-move sequence in a test). Logic verified 13/13. Cost: `games-core.js` uses an older JS style than `app.js`. If the core ever needs modern syntax, the cscript path would need a transpile step or removal.
