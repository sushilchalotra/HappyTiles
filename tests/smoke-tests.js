/* ============================================================================
   HappyTiles — shared smoke test suite (DOM-free game logic).

   ES3-safe so the SAME file runs in Node, the browser, and Windows cscript.
   Exposes runHappyTests(HappyCore) -> { passed, failed, total, results }.
   Each result: { name: string, ok: boolean, message: string }.
   ============================================================================ */
var runHappyTests = (function () {
  'use strict';

  function run(Core) {
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

    /* ----------------------------- summary ----------------------------- */
    var passed = 0, failed = 0;
    for (var i = 0; i < results.length; i++) { if (results[i].ok) { passed++; } else { failed++; } }
    return { passed: passed, failed: failed, total: results.length, results: results };
  }

  return run;
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = runHappyTests; }
if (typeof window !== 'undefined') { window.runHappyTests = runHappyTests; }
