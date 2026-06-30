# HappyTiles — Roadmap & Pending Work

> One place to see what's **done** and what's **pending** across the whole suite.
> Per-game detail lives in `MATH-QUEST.md` and `CHESS.md`; deeper rationale in
> `DECISIONS.md`. Keep this in sync as things ship.

_Last updated: 2026-06-30._

## Status at a glance

| Game | State |
|------|-------|
| Shape Sudoku | ✅ Shipped (levels, stars, speedy bonus) |
| Slide Puzzle | ✅ Shipped (levels, stars, speedy bonus) |
| Math Quest | ✅ Phases 1–3 shipped (adaptive engine, World Map + Bosses, parent dashboard) |
| Chess Academy | ✅ Phases 1–2 shipped (engine + bot, evaluation test, Openings/Tactics/Endgames) |

Everything is offline, zero-dependency, zero-build, and live at
`https://sushilchalotra.github.io/HappyTiles/`.

---

## ♟️ Chess Academy — pending (Phase 4+)

Detail/curriculum: `CHESS.md`. (Done: engine + bot, evaluation test, Openings/Tactics/
Endgames, and **Coach Mode** — per-move "why" feedback + take-back + optional voice.)

- [x] ~~Take-back / undo in games~~ — shipped as part of Coach Mode (offered on a blunder).
- [~] **Tactics Dojo** shipped: an endless, adaptive tactics workout with spaced repetition
      and a **karate-belt** progression (`TACTICS` library + `selectTactic` + `tacticBelt`);
      coach explains misses. Covers **forks, hanging pieces, win-material, mate-in-one**.
      *Still to add:* pin, skewer, discovered attack, double attack, removing the defender,
      and **mate-in-two** (`forcesMateInTwo` is ready for it).
- [x] ~~**Mate Patterns** unit~~ shipped: smothered, Scholar's, two-rook ladder, Q+K and
      R+K mates (named mate-in-one shapes; taught-only so never auto-skipped).
- [x] ~~**Smart Openings / traps** unit~~ shipped: the Italian bishop, and a black-to-move
      "Defend Scholar's Mate" puzzle.
- [ ] **Mate-in-two** puzzles (the `forcesMateInTwo` helper + a two-step puzzle runner).
- [ ] More tactic motifs in the Dojo: pin, skewer, discovered attack, double attack, removing the defender.
- [ ] **Promotion picker** (choose Q / R / B / N) — currently auto-queens.
- [ ] Bring the coach's **"why"** into the lesson puzzles too (not just Play-vs-Bot).
- [ ] **Guided long checkmates**: K+Q vs K and K+R vs K, walked step-by-step (not just mate-in-one).
- [ ] **More opening lessons**: "don't move the same piece twice", "knight before bishop", "don't bring the queen out early" (as a puzzle).
- [ ] **Optional board coordinates / notation** toggle (off by default).
- [ ] **Finer bot strength** scaling (more/steadier levels; tune eval).
- [ ] A spoken/!visual **"Check!"** cue and a **stalemate-awareness** lesson.
- [ ] Optional: a chess **daily puzzle** + streak.

## 🧠 Math Quest — pending (Phase 3 AI + Phase 4 polish)

Detail: `MATH-QUEST.md`. (Adaptive engine, World Map, Boss Battles, and the offline
parent dashboard are **done**.)

- [ ] **Optional AI weekly parent report** — off the gameplay hot path, parent-initiated,
      behind consent; would run as a tiny serverless function (keeps the app offline/zero-build).
- [ ] **Optional AI-generated themed word problems**, pre-generated and cached locally so play stays instant/offline.
- [ ] Threshold tuning (fluency/speed gates, session length) from real play.
- [ ] More themes / cosmetic polish for the World Map and Boss Battles.

## 🧩 Sudoku / Slide Puzzle — optional enhancements

- [ ] **Resume an in-progress board** after reload (the level/stars persist, but a
      partially-filled board does not).
- [ ] Tune star/par and "⚡ Speedy" thresholds from real play.

## 🌐 Suite-wide / polish

- [ ] **Real PNG app icons** for iOS "Add to Home Screen" (currently an SVG icon only).
- [ ] A shared, lightly-gated **"Grown-ups" area** (Math already has one) — could host the
      chess parent view + a global progress summary.
- [ ] **Manual real-device pass** on the iPad / S24 Ultra / iPhone 17 Pro Max (layout +
      feel) — automated headless checks pass; a human click-through is still worth doing.
- [ ] Accessibility sweep on the newer games (reduced-motion, focus order, contrast) to
      match the original Sudoku/Puzzle bar.

---

## Notes for whoever picks this up

- **Engines stay pure & tested.** New game logic goes in `*-core.js` (DOM-free, ES3-safe)
  with smoke tests in `tests/smoke-tests.js` (currently **55 passing**). For chess, keep the
  **perft** tests green — they're the correctness gate.
- **Bump `sw.js` `CACHE_VERSION`** on every release (currently `happytiles-v11`).
- **Publish** = commit to `main`; the GitHub Pages Action deploys `src/` automatically.
- **No new dependencies, no build step** — that constraint is load-bearing (offline, privacy, simplicity).
