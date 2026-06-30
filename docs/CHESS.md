# Chess Academy — Plan, Northstar & Curriculum

> A fourth game inside HappyTiles: a **structured chess-learning academy for a
> young beginner**, with a real (offline, dependency-free) engine and a leveled bot
> so she can *apply* what she learns in actual games. Living plan — keep in sync.
> See `DECISIONS.md` (2026-06-29, chess) for the why; `ARCHITECTURE.md` for structure.

## Northstar

> A 7–8 year old goes from "which way does the knight move?" to confidently playing
> a full game — by learning each idea in a tiny, joyful, hands-on step, then using it
> immediately against a friendly bot that grows with her.

**Success signals:** she can move every piece legally; she spots a checkmate-in-one;
she can win a won endgame; she chooses to "play one more game" against the bot.

## Pedagogical spine (structured, beginner-first)

Modeled on proven kid chess teaching (one idea at a time, mini-games before full play):

1. **Meet the Pieces** — each piece taught alone with a mini-game (move the piece to
   "collect the coins" using only legal moves). Rook → Bishop → Queen → King → Knight,
   then **Pawn** (move/capture/promote via a tiny promotion puzzle).
2. **Capturing & Value** — captures, and what pieces are worth (P1 N3 B3 R5 Q9): a
   "win the most points" puzzle, plus "don't hang your piece."
3. **Check & Checkmate** — what check is, escaping check, and **mate-in-one** puzzles
   (the single highest-leverage beginner skill). Stalemate awareness.
4. **Play a Game** — a full game vs a **leveled bot** (Lv1 gentle → Lv2 → Lv3), each
   unlocking as she wins. This is where the learning is applied.
5. *(Phase 2)* Special moves (castling, en passant), **tactics** (fork, pin, skewer),
   **basic endgame mates** (K+Q vs K, K+R vs K), and **opening principles**.

Each lesson awards 1–3 ⭐ and unlocks the next, like the other games; mastery feeds
the home star total.

## Engine (`src/chess-core.js`) — pure, DOM-free, ES3-safe, perft-tested

A real chess engine (the hard, must-be-correct part), written in the same style as
`games-core.js`/`math-core.js` so it runs under Node, the browser, and cscript and is
covered by the shared smoke suite.

- **Board**: 0x88 representation. **FEN** parse/export (positions & puzzles are authored
  as FEN). Algebraic ⇄ square helpers.
- **Moves**: full legal generation — sliding/leaping pieces, pawns (double, capture,
  **en passant**, **promotion**), **castling**; king-safety filtering; make/unmake.
- **State**: `isSquareAttacked`, `isInCheck`, `gameStatus` (ongoing / checkmate /
  stalemate / draw-ish), `perft` (correctness).
- **Bot**: negamax + alpha-beta with material/light-positional eval, exposed as
  `bestMove(state, level, rng)` at beginner-appropriate strength (Lv1 random-ish &
  capture-happy, Lv2 ~depth-2 with blunders, Lv3 ~depth-3). Off the render path with a
  small "thinking" delay.
- **Content**: `CHESS_UNITS` (the curriculum), mini-game configs, and mate-in-one
  puzzles live here as pure data so tests can verify every shipped puzzle really has a
  mate-in-one and every mini-game is well-formed.

**Correctness gate**: perft on the start position (20 / 400 / 8902) and on "Kiwipete"
(48 / 2039) — these validate castling, en passant, promotion, and pins.

## UI (`MathGame`-style `Chess` controller in `app.js`)

- A **Chess Academy path**: a vertical journey of lessons with stars + unlock gating.
- **Board**: 8×8, tap-to-select + tap-to-move, legal-move dots, capture rings, last-move
  + check highlight, friendly inline-SVG pieces (no webfonts/assets). Auto-queen for now.
- Lesson runners: piece **mini-game** (collect coins), **puzzle** (mate-in-one), and
  **play vs bot**. Reuses `Audio`, `Confetti`, `Win`, `Confirm`, `Store`.
- State in `ht_chess_*` (progress, per-lesson stars, highest bot level beaten). Local-only.

## Roadmap

- **Phase 1 (MVP)** ✅ done: engine (perft-tested) + bot; Academy path; Meet-the-Pieces
  mini-games; Check/Checkmate mate-in-one puzzles; Play vs leveled bot; stars/progression;
  offline; home tile.
- **Phase 2 (adaptive + content)** ✅ done: an **evaluation test** that builds a
  personalized plan (`CHESS_PLACEMENT` + `applyChessPlacement`), an **Opening Moves** unit
  (principles + interactive "take the center / develop a knight / castle your king"), a
  **Tactics** unit (hanging piece, knight fork, win the rook), an **Endgames** unit
  (promote, queen mate, back-rank mate), a goal-aware puzzle runner (`assessMove`),
  **Hints**, a "Start here" badge, and "Re-check my level". **26 lessons**; all puzzles
  test-verified. Curriculum order: Pieces → Capturing → **Openings** → Checkmate →
  Tactics → Endgames → Play.
- **Phase 3 (guided learning)** ✅ done: **Coach Mode** in Play-vs-Bot — after each move
  the pure `coachMove` engine explains *why* it's good or bad (hung piece, free capture,
  missed mate, opening principles…), offers a **take-back** on blunders, and can **speak**
  the tip aloud (offline `speechSynthesis`). Selective by design; Coach/Voice toggles.
- **Phase 4 (next)**: promotion picker (Q/R/B/N), more tactics (pin, skewer, discovered
  attack), guided long mates (K+Q, K+R walked step-by-step), optional coordinates/notation,
  finer bot scaling, and bringing the coach's "why" into puzzles too.
- **Phase 3**: a "puzzle of the day", simple game review, and (optional, off-hot-path)
  AI-generated coaching tips for parents — never in the move loop.

## Verification

- **Engine**: `node tests/run-node.js` — perft + rules + every puzzle/mini-game validated.
- **Manual/headless (tablet viewport)**: learn a piece (dots appear, collect coins, stars);
  solve a mate-in-one; play a full game vs the bot to checkmate; reload persists; offline plays.
