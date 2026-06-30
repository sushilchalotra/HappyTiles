/* ============================================================================
   HappyTiles — shared smoke test suite (DOM-free game logic).

   ES3-safe so the SAME file runs in Node, the browser, and Windows cscript.
   Exposes runHappyTests(HappyCore) -> { passed, failed, total, results }.
   Each result: { name: string, ok: boolean, message: string }.
   ============================================================================ */
var runHappyTests = (function () {
  'use strict';

  function run(Core, M, C) {
    var results = [];

    function record(name, ok, message) {
      results.push({ name: name, ok: !!ok, message: message || '' });
    }
    function test(name, fn) {
      try { fn(); record(name, true, 'ok'); }
      catch (e) { record(name, false, (e && e.message) ? e.message : String(e)); }
    }
    function assert(cond, msg) { if (!cond) { throw new Error(msg || 'assertion failed'); } }
    function assertEq(a, b, msg) {
      if (a !== b) { throw new Error((msg || 'not equal') + ' (got ' + a + ', expected ' + b + ')'); }
    }
    // Array.prototype.indexOf is absent in classic JScript — use this instead.
    function idxOf(arr, x) {
      for (var i = 0; i < arr.length; i++) { if (arr[i] === x) { return i; } }
      return -1;
    }

    /* --------------------------- helpers --------------------------- */
    function gridHasConflict(grid, n, br, bc) {
      return Core.sudokuConflicts(grid, n, br, bc).length > 0;
    }
    function allInRange(grid, n) {
      for (var i = 0; i < grid.length; i++) { if (grid[i] < 1 || grid[i] > n) { return false; } }
      return true;
    }
    function countZeros(grid) {
      var z = 0;
      for (var i = 0; i < grid.length; i++) { if (grid[i] === 0) { z++; } }
      return z;
    }

    /* =========================== SUDOKU =========================== */

    test('sudoku: generated 4x4 solution is fully valid', function () {
      for (var s = 1; s <= 25; s++) {
        var rng = Core.makeRng(1000 + s);
        var sol = Core.sudokuGenerateSolution(4, rng);
        assertEq(sol.length, 16, 'solution size');
        assert(allInRange(sol, 4), 'all cells 1..4');
        assert(!gridHasConflict(sol, 4, 2, 2), 'no conflicts in solution');
        assert(Core.sudokuIsSolved(sol, 4, 2, 2), 'solution counts as solved');
      }
    });

    test('sudoku: generated 6x6 solution is fully valid', function () {
      for (var s = 1; s <= 25; s++) {
        var rng = Core.makeRng(7000 + s);
        var sol = Core.sudokuGenerateSolution(6, rng);
        assertEq(sol.length, 36, 'solution size');
        assert(allInRange(sol, 6), 'all cells 1..6');
        assert(!gridHasConflict(sol, 6, 2, 3), 'no conflicts in solution');
        assert(Core.sudokuIsSolved(sol, 6, 2, 3), 'solution counts as solved');
      }
    });

    test('sudoku: generated 9x9 solution is fully valid', function () {
      for (var s = 1; s <= 12; s++) {
        var rng = Core.makeRng(33000 + s);
        var sol = Core.sudokuGenerateSolution(9, rng);
        assertEq(sol.length, 81, 'solution size');
        assert(allInRange(sol, 9), 'all cells 1..9');
        assert(!gridHasConflict(sol, 9, 3, 3), 'no conflicts in solution');
        assert(Core.sudokuIsSolved(sol, 9, 3, 3), 'solution counts as solved');
      }
    });

    test('sudoku: new 9x9 puzzle digs exactly the configured holes', function () {
      var holes = Core.SUDOKU_CONFIG[9].holes;
      for (var s = 1; s <= 10; s++) {
        var p = Core.sudokuNewPuzzle(9, Core.makeRng(4400 + s));
        assertEq(countZeros(p.grid), holes, 'empty cell count');
        assert(!gridHasConflict(p.grid, p.n, p.boxRows, p.boxCols), 'clues have no conflict');
      }
    });

    test('sudoku: new 4x4 puzzle digs exactly the configured holes', function () {
      var holes = Core.SUDOKU_CONFIG[4].holes;
      for (var s = 1; s <= 20; s++) {
        var p = Core.sudokuNewPuzzle(4, Core.makeRng(50 + s));
        assertEq(countZeros(p.grid), holes, 'empty cell count');
        // givens flag matches non-zero cells, and clues are themselves valid
        for (var i = 0; i < p.grid.length; i++) {
          assertEq(p.given[i], p.grid[i] !== 0, 'given flag matches cell ' + i);
        }
        assert(!gridHasConflict(p.grid, p.n, p.boxRows, p.boxCols), 'clues have no conflict');
      }
    });

    test('sudoku: every dug puzzle is still solvable', function () {
      for (var s = 1; s <= 20; s++) {
        var p = Core.sudokuNewPuzzle(4, Core.makeRng(900 + s));
        var work = p.grid.slice();
        var solved = Core.sudokuSolve(work, p.n, p.boxRows, p.boxCols, 0, Core.makeRng(1));
        assert(solved, 'solver found a completion');
        assert(!gridHasConflict(work, p.n, p.boxRows, p.boxCols), 'completion is valid');
      }
    });

    test('sudoku: conflict detection flags a duplicate in a row', function () {
      // 4x4 grid, put two 3s in the first row.
      var grid = [3, 3, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0];
      var bad = Core.sudokuConflicts(grid, 4, 2, 2);
      assertEq(bad.length, 2, 'two cells flagged');
      assert(idxOf(bad, 0) !== -1, 'cell 0 flagged');
      assert(idxOf(bad, 1) !== -1, 'cell 1 flagged');
    });

    test('sudoku: conflict detection flags a duplicate in a box', function () {
      // cells 0 and 5 are in the same top-left 2x2 box.
      var grid = [2, 0, 0, 0,  0, 2, 0, 0,  0, 0, 0, 0,  0, 0, 0, 0];
      var bad = Core.sudokuConflicts(grid, 4, 2, 2);
      assertEq(bad.length, 2, 'two cells flagged for box duplicate');
    });

    test('sudoku: a valid full grid has zero conflicts', function () {
      var grid = [1, 2, 3, 4,  3, 4, 1, 2,  2, 1, 4, 3,  4, 3, 2, 1];
      assertEq(Core.sudokuConflicts(grid, 4, 2, 2).length, 0, 'no conflicts');
      assert(Core.sudokuIsSolved(grid, 4, 2, 2), 'is solved');
    });

    test('sudoku: incomplete grid is not solved', function () {
      var grid = [1, 2, 3, 4,  3, 4, 1, 2,  2, 1, 4, 3,  4, 3, 2, 0];
      assert(!Core.sudokuIsComplete(grid), 'not complete');
      assert(!Core.sudokuIsSolved(grid, 4, 2, 2), 'not solved');
    });

    /* ======================== SLIDING PUZZLE ======================== */

    test('puzzle: solved board is 0..8 and reads as solved', function () {
      var b = Core.puzzleSolved(3);
      assertEq(b.length, 9, 'nine tiles');
      for (var i = 0; i < 9; i++) { assertEq(b[i], i, 'tile ' + i); }
      assert(Core.puzzleIsSolved(b), 'reads as solved');
    });

    test('puzzle: neighbors are correct for corner/edge/center', function () {
      var center = Core.puzzleNeighbors(4, 3);   // middle of 3x3
      assertEq(center.length, 4, 'center has 4 neighbors');
      var corner = Core.puzzleNeighbors(0, 3);
      assertEq(corner.length, 2, 'corner has 2 neighbors');
      var edge = Core.puzzleNeighbors(1, 3);
      assertEq(edge.length, 3, 'edge has 3 neighbors');
    });

    test('puzzle: shuffle is always solvable and never pre-solved', function () {
      for (var s = 1; s <= 50; s++) {
        var b = Core.puzzleShuffle(3, 120, Core.makeRng(s * 13 + 1));
        assert(!Core.puzzleIsSolved(b), 'not already solved (seed ' + s + ')');
        assert(Core.puzzleIsSolvable(b, 3), 'is solvable (seed ' + s + ')');
        // sanity: it is a permutation of 0..8
        var seen = [];
        for (var i = 0; i < b.length; i++) { seen[b[i]] = true; }
        for (var v = 0; v < 9; v++) { assert(seen[v], 'contains tile ' + v); }
      }
    });

    test('puzzle: solvability parity check rejects an unsolvable board', function () {
      // A single transposition of two non-blank tiles flips parity -> unsolvable.
      var unsolvable = Core.puzzleSolved(3);
      var t = unsolvable[0]; unsolvable[0] = unsolvable[1]; unsolvable[1] = t; // swap tiles 0 and 1
      assert(!Core.puzzleIsSolvable(unsolvable, 3), 'single swap is unsolvable');
      assert(Core.puzzleIsSolvable(Core.puzzleSolved(3), 3), 'solved board is solvable');
    });

    test('puzzle: a real slide sequence reaches the solved state', function () {
      // Start solved, make a few legal blank moves, then reverse them.
      var b = Core.puzzleSolved(3);
      var blank = Core.puzzleBlankValue(3);
      function move(pos) { var bp = idxOf(b, blank); var x = b[pos]; b[pos] = b[bp]; b[bp] = x; }
      // Blank starts at index 8. Walk it 8 -> 5 -> 4 ...
      move(5); move(4);
      assert(!Core.puzzleIsSolved(b), 'scrambled by two moves');
      // ... then walk it back 4 -> 5 -> 8 to restore the solved state.
      move(5); move(8);
      assert(Core.puzzleIsSolved(b), 'reversed back to solved');
    });

    /* ======================== LEVELS & SCORING ======================== */

    test('sudoku: new puzzle honors an explicit hole override', function () {
      for (var s = 1; s <= 20; s++) {
        var p = Core.sudokuNewPuzzle(6, Core.makeRng(8800 + s), 14);
        assertEq(countZeros(p.grid), 14, 'digs exactly the override count');
        assert(!gridHasConflict(p.grid, p.n, p.boxRows, p.boxCols), 'clues still valid');
      }
    });

    test('sudoku: every level config is generatable and solvable', function () {
      for (var L = 0; L < Core.SUDOKU_LEVELS.length; L++) {
        var lvl = Core.SUDOKU_LEVELS[L];
        var p = Core.sudokuNewPuzzle(lvl.size, Core.makeRng(2200 + L), lvl.holes);
        assertEq(countZeros(p.grid), lvl.holes, 'level ' + (L + 1) + ' hole count');
        var work = p.grid.slice();
        assert(Core.sudokuSolve(work, p.n, p.boxRows, p.boxCols, 0, Core.makeRng(1)),
               'level ' + (L + 1) + ' is solvable');
      }
    });

    test('sudoku: star rating maps mistakes to 3/2/1', function () {
      assertEq(Core.sudokuStars(0), 3, 'no mistakes = 3 stars');
      assertEq(Core.sudokuStars(2), 2, 'a few mistakes = 2 stars');
      assertEq(Core.sudokuStars(9), 1, 'many mistakes = 1 star');
    });

    test('puzzle: every level shuffles to a solvable, unsolved board', function () {
      for (var L = 0; L < Core.PUZZLE_LEVELS.length; L++) {
        var lvl = Core.PUZZLE_LEVELS[L];
        var b = Core.puzzleShuffle(lvl.size, lvl.steps, Core.makeRng(5500 + L));
        assert(!Core.puzzleIsSolved(b), 'level ' + (L + 1) + ' not pre-solved');
        assert(Core.puzzleIsSolvable(b, lvl.size), 'level ' + (L + 1) + ' is solvable');
        assertEq(b.length, lvl.size * lvl.size, 'level ' + (L + 1) + ' tile count');
      }
    });

    test('puzzle: star rating maps moves-vs-par to 3/2/1', function () {
      assertEq(Core.puzzleStars(30, 30), 3, 'at par = 3 stars');
      assertEq(Core.puzzleStars(45, 30), 2, 'a bit over par = 2 stars');
      assertEq(Core.puzzleStars(200, 30), 1, 'way over par = 1 star');
    });

    /* ===================== MATH QUEST (adaptive engine) ===================== */
    // Guarded so the legacy single-arg runners still work; the three runners in
    // this folder pass MathCore as the 2nd arg.
    if (M) {
      var ST = M.STAGE;

      test('math: builds 45 unique facts, canonical and with correct products', function () {
        var facts = M.buildFacts();
        assertEq(facts.length, 45, 'unique fact count');
        var seen = {};
        for (var i = 0; i < facts.length; i++) {
          var f = facts[i];
          assert(f.a <= f.b, 'canonical a<=b for ' + f.id);
          assertEq(f.p, f.a * f.b, 'product for ' + f.id);
          assert(f.a >= 2 && f.b <= 10, 'factors within 2..10 for ' + f.id);
          assert(!seen[f.id], 'no duplicate ' + f.id);
          seen[f.id] = true;
        }
      });

      test('math: teach order covers all 45 facts and starts at the 2-table', function () {
        var order = M.teachOrder();
        assertEq(order.length, 45, 'teach order length');
        assertEq(order[0], '2x2', 'anchors (×2) come first');
        var facts = M.buildFacts();
        for (var i = 0; i < order.length; i++) {
          assert(M.findFact(facts, order[i]) !== null, 'order id exists: ' + order[i]);
        }
      });

      test('math: grade promotes new→learning→reviewing→fluent on fast correct answers', function () {
        var f = M.findFact(M.buildFacts(), '6x7');
        var now = 1000000;
        M.grade(f, true, 1000, now); assertEq(f.stage, ST.LEARNING, 'first correct → learning');
        M.grade(f, true, 1000, now); assertEq(f.stage, ST.REVIEWING, 'streak 2 → reviewing');
        M.grade(f, true, 1000, now); assertEq(f.stage, ST.FLUENT, 'streak 3 + fast → fluent');
      });

      test('math: a fact answered correctly but SLOW never reaches fluent', function () {
        var f = M.findFact(M.buildFacts(), '6x8');
        for (var i = 0; i < 6; i++) { M.grade(f, true, 5000, 1000000); }
        assertEq(f.stage, ST.REVIEWING, 'slow-but-correct stays reviewing');
      });

      test('math: a wrong answer resets streak/box and demotes the stage', function () {
        var f = M.findFact(M.buildFacts(), '7x8');
        var now = 1000000;
        M.grade(f, true, 1000, now); M.grade(f, true, 1000, now); M.grade(f, true, 1000, now);
        assertEq(f.stage, ST.FLUENT, 'set up fluent');
        var info = M.grade(f, false, 2000, now);
        assertEq(f.stage, ST.REVIEWING, 'fluent demotes to reviewing on a miss');
        assertEq(f.streak, 0, 'streak reset');
        assertEq(f.box, 0, 'box reset to 0');
        assertEq(info.correct, false, 'info reports incorrect');
      });

      test('math: review intervals grow with the Leitner box', function () {
        assert(M.intervalMs(0) < M.intervalMs(1), 'box 0 < box 1');
        assert(M.intervalMs(1) < M.intervalMs(3), 'box 1 < box 3');
      });

      test('math: grading schedules the next due time from the new box', function () {
        var f = M.findFact(M.buildFacts(), '2x3');
        M.grade(f, true, 1000, 5000);
        assertEq(f.box, 1, 'box advanced to 1');
        assertEq(f.dueAt, 5000 + M.intervalMs(1), 'dueAt = now + interval(box)');
      });

      test('math: selectNext returns null when nothing has been started', function () {
        var fresh = M.buildFacts();   // all NEW
        assertEq(M.selectNext(fresh, { mode: 'mixed', now: 0, rng: M.makeRng(1) }), null, 'no startable facts');
      });

      test('math: selectNext favors the weak, overdue fact over a strong, not-due one', function () {
        var fs = M.buildFacts();
        var weak = M.findFact(fs, '7x8'); weak.stage = ST.LEARNING; weak.dueAt = 0; weak.streak = 0;
        var strong = M.findFact(fs, '2x4'); strong.stage = ST.REVIEWING; strong.dueAt = 9000000; strong.streak = 3;
        var now = 1000000, hits = 0;
        for (var s = 1; s <= 60; s++) {
          var p = M.selectNext(fs, { mode: 'mixed', now: now, rng: M.makeRng(s) });
          assert(p && p.stage >= ST.LEARNING, 'never returns a NEW fact');
          if (p.id === weak.id) { hits++; }
        }
        assert(hits >= 40, 'weak/overdue fact dominates selection (' + hits + '/60)');
      });

      test('math: speed mode only serves fluent facts when enough exist', function () {
        var fs = M.buildFacts();
        var ids = ['2x2', '2x3', '2x4', '2x5', '2x6'];
        for (var i = 0; i < ids.length; i++) { var f = M.findFact(fs, ids[i]); f.stage = ST.FLUENT; f.dueAt = 0; }
        var p = M.selectNext(fs, { mode: 'speed', now: 1000, rng: M.makeRng(3) });
        assert(p && p.stage === ST.FLUENT, 'speed serves a fluent fact');
      });

      test('math: multiplication questions are well-formed', function () {
        var f = M.findFact(M.buildFacts(), '6x7'); f.stage = ST.REVIEWING;   // → number-pad
        var q = M.makeQuestion(f, { rng: M.makeRng(2), allowDivision: false });
        assertEq(q.op, 'mul', 'multiplication op');
        assertEq(q.answer, 42, 'answer is the product');
        assertEq(q.x * q.y, 42, 'operands multiply to the product');
        assertEq(q.inputMode, 'pad', 'reviewing fact types the answer');
      });

      test('math: division questions are the true inverse of a fact', function () {
        var f = M.findFact(M.buildFacts(), '6x7'); f.stage = ST.REVIEWING;
        var found = false;
        for (var s = 1; s < 50 && !found; s++) {
          var q = M.makeQuestion(f, { rng: M.makeRng(s), allowDivision: true });
          if (q.op === 'div') {
            found = true;
            assertEq(q.x, 42, 'dividend is the product');
            assert(q.answer * q.y === 42, 'quotient × divisor = product');
            assert(q.y === f.a || q.y === f.b, 'divides by one of the factors');
          }
        }
        assert(found, 'produced at least one division question');
      });

      test('math: multiple-choice options are 4 distinct positives incl. the answer', function () {
        var c = M.findFact(M.buildFacts(), '3x4');   // NEW → choice mode
        var q = M.makeQuestion(c, { rng: M.makeRng(5), allowDivision: false });
        assertEq(q.inputMode, 'choice', 'new fact uses multiple choice');
        assertEq(q.choices.length, 4, 'four options');
        assert(idxOf(q.choices, q.answer) !== -1, 'the answer is one of the options');
        for (var i = 0; i < q.choices.length; i++) {
          assert(q.choices[i] > 0, 'option is positive');
          for (var j = i + 1; j < q.choices.length; j++) { assert(q.choices[i] !== q.choices[j], 'options distinct'); }
        }
      });

      test('math: input mode is choice while learning, number-pad once fluent', function () {
        var f = M.findFact(M.buildFacts(), '8x9');
        f.stage = ST.NEW;      assertEq(M.pickInputMode(f), 'choice', 'new → choice');
        f.stage = ST.LEARNING; assertEq(M.pickInputMode(f), 'choice', 'learning → choice');
        f.stage = ST.REVIEWING;assertEq(M.pickInputMode(f), 'pad', 'reviewing → pad');
        f.stage = ST.FLUENT;   assertEq(M.pickInputMode(f), 'pad', 'fluent → pad');
      });

      test('math: placement seeds strong tables high and unknown tables as new', function () {
        var fs = M.buildFacts();
        var results = [
          { a: 5, b: 3, correct: true,  ms: 1000 }, { a: 5, b: 8, correct: true,  ms: 1000 },
          { a: 7, b: 4, correct: false, ms: 8000 }, { a: 7, b: 9, correct: false, ms: 8000 }
        ];
        M.applyPlacement(fs, results, 1000);
        assertEq(M.findFact(fs, '5x5').stage, ST.FLUENT, 'fast+correct ×5 table → fluent');
        assertEq(M.findFact(fs, '7x7').stage, ST.NEW, 'all-wrong ×7 table → new');
        assertEq(M.findFact(fs, '5x7').stage, ST.FLUENT, 'fact takes the stronger of its two tables');
      });

      test('math: pickNewFact follows the teach order and respects the learning cap', function () {
        var fs = M.buildFacts();
        var first = M.pickNewFact(fs);
        assert(first && first.id === M.teachOrder()[0], 'introduces the first teach-order fact');
        var order = M.teachOrder();
        for (var i = 0; i < M.LEARNING_CAP; i++) { M.findFact(fs, order[i]).stage = ST.LEARNING; }
        assertEq(M.pickNewFact(fs), null, 'no new fact while the learning edge is full');
      });

      test('math: worlds partition all 45 facts with no overlap', function () {
        var ws = M.worlds(M.buildFacts());
        assertEq(ws.length, 9, 'one world per table (×2..×10)');
        var sum = 0;
        for (var i = 0; i < ws.length; i++) { sum += ws[i].total; }
        assertEq(sum, 45, 'world totals sum to all facts');
        assertEq(ws[0].label, '×2', 'first world is the ×2 table');
      });

      test('math: fact ownership goes to the earlier teaching-order table', function () {
        assertEq(M.worldOf('2x7'), 2, '2×7 belongs to the ×2 world');
        assertEq(M.worldOf('7x8'), 7, '7×8 belongs to the ×7 world (7 before 8)');
        assertEq(M.worldOf('8x8'), 8, '8×8 belongs to the ×8 world');
      });

      test('math: a world reads complete only when all its facts are fluent', function () {
        var fs = M.buildFacts();
        var owned = M.worldFacts(fs, 2);
        for (var i = 0; i < owned.length; i++) { owned[i].stage = ST.FLUENT; }
        var ws = M.worlds(fs);
        var w2 = null;
        for (i = 0; i < ws.length; i++) { if (ws[i].factor === 2) { w2 = ws[i]; } }
        assertEq(w2.mastered, w2.total, 'all owned facts mastered');
        assert(w2.complete, '×2 world complete');
      });

      test('math: a world is boss-ready when all its facts are reviewing but not fluent', function () {
        var fs = M.buildFacts();
        var owned = M.worldFacts(fs, 8);   // smallest world (just 8×8)
        for (var i = 0; i < owned.length; i++) { owned[i].stage = ST.REVIEWING; }
        var ws = M.worlds(fs), w8 = null;
        for (i = 0; i < ws.length; i++) { if (ws[i].factor === 8) { w8 = ws[i]; } }
        assert(w8.bossReady, '×8 world is boss-ready');
        assert(!w8.complete, 'not yet complete');
      });

      test('math: selectNext can be restricted to a world via opts.ids', function () {
        var fs = M.buildFacts();
        var owned = M.worldFacts(fs, 8);
        var ids = [];
        for (var i = 0; i < fs.length; i++) { fs[i].stage = ST.REVIEWING; }   // everything eligible
        for (i = 0; i < owned.length; i++) { ids.push(owned[i].id); }
        for (var s = 1; s <= 20; s++) {
          var p = M.selectNext(fs, { mode: 'mixed', now: 1000, rng: M.makeRng(s), ids: ids });
          assert(p && M.worldOf(p.id) === 8, 'only serves ×8 world facts');
        }
      });

      test('math: insights surface the slowest known facts and the focus facts', function () {
        var fs = M.buildFacts();
        var slowFact = M.findFact(fs, '7x8'); slowFact.stage = ST.REVIEWING; slowFact.avgMs = 6000; slowFact.streak = 2;
        var fastFact = M.findFact(fs, '2x2'); fastFact.stage = ST.FLUENT; fastFact.avgMs = 1200; fastFact.streak = 5;
        var learn = M.findFact(fs, '6x7'); learn.stage = ST.LEARNING; learn.seen = 2;
        var ins = M.insights(fs, 5);
        assertEq(ins.slowest[0].id, '7x8', 'slowest known fact ranked first');
        var inFocus = false;
        for (var i = 0; i < ins.focus.length; i++) { if (ins.focus[i].id === '6x7') { inFocus = true; } }
        assert(inFocus, 'a learning fact shows up in focus');
      });

      test('math: summary counts stages and session stars map to 3/2/1', function () {
        var s = M.summary(M.buildFacts(), 0);
        assertEq(s.total, 45, 'total facts');
        assertEq(s.newCount, 45, 'all start new');
        assertEq(s.fluent, 0, 'none fluent yet');
        assertEq(M.sessionStars(10, 10), 3, '100% = 3 stars');
        assertEq(M.sessionStars(7, 10), 2, '70% = 2 stars');
        assertEq(M.sessionStars(3, 10), 1, '30% = 1 star');
      });
    }

    /* ===================== CHESS (engine correctness) ===================== */
    if (C) {
      test('chess: FEN round-trips the start position', function () {
        var st = C.parseFEN(C.START_FEN);
        assertEq(C.exportFEN(st), C.START_FEN, 'export === START_FEN');
      });

      test('chess: perft(startpos) = 20 / 400 / 8902', function () {
        var st = C.parseFEN(C.START_FEN);
        assertEq(C.perft(st, 1), 20, 'depth 1');
        assertEq(C.perft(st, 2), 400, 'depth 2');
        assertEq(C.perft(st, 3), 8902, 'depth 3');
      });

      test('chess: perft(kiwipete) = 48 / 2039 (castling, e.p., promotion, pins)', function () {
        var st = C.parseFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
        assertEq(C.perft(st, 1), 48, 'depth 1');
        assertEq(C.perft(st, 2), 2039, 'depth 2');
      });

      test('chess: detects checkmate (fool\'s mate) and stalemate', function () {
        var mate = C.parseFEN('rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3');
        assertEq(C.gameStatus(mate), 'checkmate', 'fool\'s mate is checkmate');
        var stale = C.parseFEN('k7/8/1Q6/8/8/8/8/7K b - - 0 1');
        assertEq(C.gameStatus(stale), 'stalemate', 'no moves, not in check = stalemate');
      });

      test('chess: castling moves are generated when legal', function () {
        var st = C.parseFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
        var moves = C.legalMoves(st);
        assert(C.findMove(moves, C.sqFromAlg('e1'), C.sqFromAlg('g1')), 'king-side castle');
        assert(C.findMove(moves, C.sqFromAlg('e1'), C.sqFromAlg('c1')), 'queen-side castle');
      });

      test('chess: en passant capture is available on the right square', function () {
        var st = C.parseFEN('7k/8/8/4Pp2/8/8/8/4K3 w - f6 0 1');
        var m = C.findMove(C.legalMoves(st), C.sqFromAlg('e5'), C.sqFromAlg('f6'));
        assert(m && m.flag === 'ep', 'e5xf6 e.p. exists');
      });

      test('chess: every mate-in-one puzzle is actually solvable', function () {
        var units = C.CHESS_UNITS, u, l, k, j;
        for (u = 0; u < units.length; u++) {
          for (k = 0; k < units[u].lessons.length; k++) {
            l = units[u].lessons[k];
            if (l.type !== 'puzzle') { continue; }
            var st = C.parseFEN(l.fen);
            var moves = C.legalMoves(st), mate = false;
            for (j = 0; j < moves.length; j++) { if (C.moveGivesMate(st, moves[j])) { mate = true; break; } }
            assert(mate, 'puzzle ' + l.id + ' has a mate in one');
          }
        }
      });

      test('chess: piece mini-games are well-formed (valid start + distinct coins)', function () {
        var units = C.CHESS_UNITS, u, l, k, c;
        for (u = 0; u < units.length; u++) {
          for (k = 0; k < units[u].lessons.length; k++) {
            l = units[u].lessons[k];
            if (l.type !== 'piece') { continue; }
            assert(l.coins && l.coins.length >= 1, l.id + ' has coins');
            for (c = 0; c < l.coins.length; c++) {
              assert(l.coins[c] !== l.start, l.id + ' coin not on the start square');
              assert(C.onBoard(C.sqFromAlg(l.coins[c])), l.id + ' coin on board');
            }
          }
        }
      });

      test('chess: the bot returns a legal move and grabs a hanging queen', function () {
        var st = C.parseFEN(C.START_FEN);
        var m = C.bestMove(st, 1, C.makeRng(1));
        assert(C.findMove(C.legalMoves(st), m.from, m.to), 'level-1 move is legal');
        var hang = C.parseFEN('q6k/8/8/8/8/8/8/R3K3 w - - 0 1');
        var grab = C.bestMove(hang, 3, C.makeRng(7));
        assertEq(C.algFromSq(grab.to), 'a8', 'a strong bot captures the free queen');
      });
    }

    /* ----------------------------- summary ----------------------------- */
    var passed = 0, failed = 0;
    for (var i = 0; i < results.length; i++) { if (results[i].ok) { passed++; } else { failed++; } }
    return { passed: passed, failed: failed, total: results.length, results: results };
  }

  return run;
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = runHappyTests; }
if (typeof window !== 'undefined') { window.runHappyTests = runHappyTests; }
