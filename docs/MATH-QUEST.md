# Math Quest — Plan, Northstar & Roadmap

> A third game inside HappyTiles: an adaptive multiplication & division
> **times-tables trainer** for an early-3rd-grade child. This doc is the living
> plan; keep it in sync as the game is built. See `DECISIONS.md` (2026-06-29)
> for the why, and `ARCHITECTURE.md` for the current structure.

## Northstar

> A 7–8 year old reaches instant, joyful recall of ×2–×10 (and the matching
> division facts) through short daily play that adapts to exactly the fact she
> needs next — building **accuracy and speed without anxiety**.

**Success signals:** median answer time on practiced facts trends toward <3s; the
count of "Fluent" facts climbs steadily; she *wants* to keep her daily streak;
division feels like "the same fact backwards," not a new mountain.

## Pedagogical pillars (the "why" behind the engine)

1. **Fluency, not just correctness** — track *response time*, not only right/wrong.
   A fact is mastered only when answered correctly **and** fast.
2. **Spaced repetition (SRS)** — each fact rides a Leitner box; due/weak facts get
   practiced, fluent facts resurface at growing intervals to stay sharp.
3. **Mastery-based progression** — every fact moves New → Learning → Reviewing →
   **Fluent**. New facts unlock as old ones become fluent.
4. **Smart sequencing** — anchors first (×2, ×10, ×5), then ×3, ×4, then the hard
   core (×9 via its trick, then ×6, ×7, ×8). Commutativity (6×7 = 7×6) folds the
   set to **45 unique facts**.
5. **× and ÷ as fact families** — 6×7=42 ⇒ 42÷7=6. Teaching the inverse doubles
   practice value and deepens understanding.
6. **Strategies over rote** — ×9 finger trick, ×5 = half of ×10, ×4 = double-double,
   squares as anchors. A mnemonic is shown when a *new* fact is introduced.
7. **Low-anxiety speed** — speed is "beat your own best" + power-ups, never a
   failing clock. Mirrors HappyTiles' existing silent **⚡ Speedy!** bonus.

## Key decisions (confirmed with the user, 2026-06-29)

1. **Inside HappyTiles**, not a separate app — reuse the home, stars, audio,
   confetti, PWA shell and deploy. Clean module boundary so it could be extracted.
2. **Offline-first adaptive engine now; optional AI later.** The adaptive "brain"
   is a fast, free, deterministic, **offline** module (`math-core.js`). An LLM is
   *never* in the gameplay loop (a speed game needs instant questions). AI is a
   later, separable enrichment layer for **parent weekly reports** and **themed
   word problems** only.
3. **Adaptive input** — multiple-choice while *learning* a new fact; number-pad
   *typing* once building fluency/speed.
4. **Primary device: tablet** — touch-first, large number pad, generous targets.

## Engine (`src/math-core.js`) — pure, DOM-free, deterministic

The counterpart to `games-core.js`. Owns all pedagogy; no DOM/audio/storage/LLM.

- **Fact record:** `{ id, a, b, p, stage, box, dueAt, seen, correct, streak, bestMs, avgMs, lastMs }`.
- **Core functions:** `buildFacts`/`createInitialState`, `teachOrder`, `pickNewFact`,
  `strategyFor(a,b)`, `selectNext(facts,{mode,now,rng,excludeId})`,
  `makeQuestion(fact,{rng,allowDivision,forceInput})`, `pickInputMode`, `makeChoices`,
  `grade(rec,correct,latencyMs,now)`, `intervalMs`, `placementProbes`,
  `applyPlacement`, `summary`, `sessionStars`.
- **Determinism:** all randomness via injectable `rng()`; all "current time" passed
  in as `now` (ms). ES3-safe so it runs under Node, the browser, and cscript and is
  covered by the shared smoke-test suite.

## Persistence (new `localStorage` keys, namespaced like `ht_*`)

- `ht_math_facts` — JSON array of per-fact records (the mastery model).
- `ht_math_profile` — `{ placed, allowDivision }` and meta-progression state.
- `ht_math_streak` — `{ days, last }` daily streak.

Each **fluent** fact counts as a star toward the home "stars collected" total, so
mastery feeds the same headline motivator as the other games.

## Game modes (bite-sized, to fight monotony)

- **Placement** (first run, ~3–5 min, adaptive) — seeds the mastery model.
- **Warm-up** — review due/weak facts (mixed × and ÷).
- **New Skill** — introduce one new fact with a strategy/mnemonic card, then reps.
- **Speed Round** — fluent facts only; beat your personal best.
- **Boss Battle** — mixed challenge that unlocks the next "world".

## Roadmap (each phase independently shippable)

- **Phase 0 — Engine foundation** ✅ done: `math-core.js` + 17 smoke tests (37/37).
- **Phase 1 — MVP playable loop** ✅ done: Math home tile; placement; adaptive
  10-question sessions with a new-fact strategy card; choice vs number-pad input by
  mastery stage; persistence; stars/confetti/audio reuse; daily streak; Speed Round
  once ≥4 facts are fluent. Fully offline. *She can start playing.*
- **Phase 2 — Engagement + division** ✅ done: a **World Map** (9 tables as worlds
  that fill in and earn 🏆 when mastered); **Boss Battles** per world; **personal-best
  speed** records in Speed Rounds; the strategy card now shows the full ×/÷ **fact
  family** when division is on. Engine: `worlds` / `worldFacts` / `worldOf`.
- **Phase 2b — Levels + challenges** ✅ done: an overall **Player Level** (XP from
  correct/fast/mastery, Rookie→Legend ranks, level-up celebration) on the start screen,
  and a **🔥 Streak Challenge** (keep answering right; one miss ends it; tracks a best
  run). `mathLevel(xp)` is pure + tested. State adds `xp` + `bestStreak` to the profile.
- **Phase 3 — Insight + optional AI:** parent dashboard (offline heatmap/trends) ✅;
  optional LLM weekly report + cached themed word problems behind parent consent.
- **Phase 4 — Polish:** more content/themes, a11y passes, sound/animation polish,
  threshold tuning from real play.

## Verification

- **Engine:** `node tests/run-node.js` (or `cscript //nologo tests\run-cscript.js`,
  or open `tests/index.html`). All existing tests stay green; math tests pass.
- **Manual (tablet viewport):** first run → placement seeds mastery; warm-up serves
  due/weak facts; a new fact shows a strategy card + multiple choice; fluent facts
  switch to number-pad typing; reload persists; airplane mode still plays.
