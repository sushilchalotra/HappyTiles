/* ============================================================================
   HappyTiles — games-core.js
   Pure, DOM-free game logic shared by the app and the test suites.

   Written in a deliberately old-school style (var / function / index loops,
   no template literals, no Array.from/forEach/Object.keys) so the EXACT same
   file runs unchanged in:
     - the browser (via window.HappyCore)
     - Node.js     (via module.exports)
     - Windows cscript / JScript (for offline smoke testing)

   All randomness goes through an injectable rng() so tests are deterministic.
   ============================================================================ */
var HappyCore = (function () {
  'use strict';

  /* ------------------------------ helpers ------------------------------ */
  function makeArray(len, fill) {
    var a = [];
    for (var i = 0; i < len; i++) { a[i] = fill; }
    return a;
  }
  function rangeArray(len) {
    var a = [];
    for (var i = 0; i < len; i++) { a[i] = i; }
    return a;
  }
  function indexOfVal(arr, x) {
    for (var i = 0; i < arr.length; i++) { if (arr[i] === x) { return i; } }
    return -1;
  }
  function contains(arr, x) { return indexOfVal(arr, x) !== -1; }

  function shuffleInPlace(arr, rng) {
    var r = rng || Math.random;
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(r() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // Small seedable PRNG (LCG). ES3-safe; deterministic for tests.
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ============================== SUDOKU ============================== */
  var SUDOKU_CONFIG = {
    4: { n: 4, boxRows: 2, boxCols: 2, holes: 7 },
    6: { n: 6, boxRows: 2, boxCols: 3, holes: 18 },
    9: { n: 9, boxRows: 3, boxCols: 3, holes: 40 }
  };

  function sudokuSafe(g, n, boxRows, boxCols, i, val) {
    var r = Math.floor(i / n), c = i % n, k;
    for (k = 0; k < n; k++) {
      if (g[r * n + k] === val) { return false; }   // row
      if (g[k * n + c] === val) { return false; }   // col
    }
    var br = Math.floor(r / boxRows) * boxRows;
    var bc = Math.floor(c / boxCols) * boxCols;
    for (var dr = 0; dr < boxRows; dr++) {
      for (var dc = 0; dc < boxCols; dc++) {
        if (g[(br + dr) * n + (bc + dc)] === val) { return false; }  // box
      }
    }
    return true;
  }

  function sudokuSolve(g, n, boxRows, boxCols, pos, rng) {
    if (pos === g.length) { return true; }
    if (g[pos] !== 0) { return sudokuSolve(g, n, boxRows, boxCols, pos + 1, rng); }
    var candidates = rangeArray(n);
    for (var x = 0; x < candidates.length; x++) { candidates[x] = x + 1; }
    shuffleInPlace(candidates, rng);
    for (var c = 0; c < candidates.length; c++) {
      var val = candidates[c];
      if (sudokuSafe(g, n, boxRows, boxCols, pos, val)) {
        g[pos] = val;
        if (sudokuSolve(g, n, boxRows, boxCols, pos + 1, rng)) { return true; }
        g[pos] = 0;
      }
    }
    return false;
  }

  function sudokuGenerateSolution(size, rng) {
    var cfg = SUDOKU_CONFIG[size];
    var g = makeArray(cfg.n * cfg.n, 0);
    sudokuSolve(g, cfg.n, cfg.boxRows, cfg.boxCols, 0, rng);
    return g;
  }

  // Returns { n, boxRows, boxCols, grid, given, solution }
  function sudokuNewPuzzle(size, rng) {
    var cfg = SUDOKU_CONFIG[size];
    var solution = sudokuGenerateSolution(size, rng);
    var grid = solution.slice();
    var order = rangeArray(cfg.n * cfg.n);
    shuffleInPlace(order, rng);
    for (var k = 0; k < cfg.holes; k++) { grid[order[k]] = 0; }
    var given = [];
    for (var i = 0; i < grid.length; i++) { given[i] = grid[i] !== 0; }
    return {
      n: cfg.n, boxRows: cfg.boxRows, boxCols: cfg.boxCols,
      grid: grid, given: given, solution: solution
    };
  }

  // Returns an array of cell indices that are in conflict.
  function sudokuConflicts(grid, n, boxRows, boxCols) {
    var bad = [];

    function markGroup(cells) {
      var seenVal = [], seenIdx = [], k, v, p;
      for (k = 0; k < cells.length; k++) {
        v = grid[cells[k]];
        if (!v) { continue; }
        p = indexOfVal(seenVal, v);
        if (p === -1) { seenVal.push(v); seenIdx.push([cells[k]]); }
        else { seenIdx[p].push(cells[k]); }
      }
      for (var q = 0; q < seenIdx.length; q++) {
        if (seenIdx[q].length > 1) {
          for (var r = 0; r < seenIdx[q].length; r++) {
            if (!contains(bad, seenIdx[q][r])) { bad.push(seenIdx[q][r]); }
          }
        }
      }
    }

    var r, c, cells;
    for (r = 0; r < n; r++) { cells = []; for (c = 0; c < n; c++) { cells.push(r * n + c); } markGroup(cells); }
    for (c = 0; c < n; c++) { cells = []; for (r = 0; r < n; r++) { cells.push(r * n + c); } markGroup(cells); }
    for (var br = 0; br < n; br += boxRows) {
      for (var bc = 0; bc < n; bc += boxCols) {
        cells = [];
        for (var dr = 0; dr < boxRows; dr++) {
          for (var dc = 0; dc < boxCols; dc++) { cells.push((br + dr) * n + (bc + dc)); }
        }
        markGroup(cells);
      }
    }
    return bad;
  }

  function sudokuIsComplete(grid) {
    for (var i = 0; i < grid.length; i++) { if (!grid[i]) { return false; } }
    return true;
  }

  function sudokuIsSolved(grid, n, boxRows, boxCols) {
    return sudokuIsComplete(grid) && sudokuConflicts(grid, n, boxRows, boxCols).length === 0;
  }

  /* =========================== SLIDING PUZZLE =========================== */
  function puzzleBlankValue(n) { return n * n - 1; }

  function puzzleSolved(n) { return rangeArray(n * n); }

  function puzzleNeighbors(pos, n) {
    var r = Math.floor(pos / n), c = pos % n, out = [];
    if (r > 0) { out.push(pos - n); }
    if (r < n - 1) { out.push(pos + n); }
    if (c > 0) { out.push(pos - 1); }
    if (c < n - 1) { out.push(pos + 1); }
    return out;
  }

  function puzzleIsSolved(board) {
    for (var i = 0; i < board.length; i++) { if (board[i] !== i) { return false; } }
    return true;
  }

  // Shuffle by walking the blank with random valid moves -> always solvable.
  function puzzleShuffle(n, steps, rng) {
    var board = puzzleSolved(n);
    var blank = puzzleBlankValue(n);
    var prev = -1;
    var r = rng || Math.random;
    for (var k = 0; k < steps; k++) {
      var bp = indexOfVal(board, blank);
      var opts = puzzleNeighbors(bp, n);
      var filtered = [];
      for (var i = 0; i < opts.length; i++) { if (opts[i] !== prev) { filtered.push(opts[i]); } }
      var pick = filtered[Math.floor(r() * filtered.length)];
      var t = board[bp]; board[bp] = board[pick]; board[pick] = t;
      prev = bp;
    }
    if (puzzleIsSolved(board)) { var s = board[0]; board[0] = board[1]; board[1] = s; }
    return board;
  }

  // Inversion count over the non-blank tiles (used to verify solvability).
  function puzzleInversions(board, n) {
    var blank = puzzleBlankValue(n);
    var seq = [];
    for (var i = 0; i < board.length; i++) { if (board[i] !== blank) { seq.push(board[i]); } }
    var inv = 0;
    for (var a = 0; a < seq.length; a++) {
      for (var b = a + 1; b < seq.length; b++) { if (seq[a] > seq[b]) { inv++; } }
    }
    return inv;
  }

  function puzzleIsSolvable(board, n) {
    var inv = puzzleInversions(board, n);
    if (n % 2 === 1) { return inv % 2 === 0; }            // odd width: even inversions
    var blank = puzzleBlankValue(n);
    var blankRowFromBottom = n - Math.floor(indexOfVal(board, blank) / n);
    return ((inv + blankRowFromBottom) % 2 === 1);
  }

  /* ------------------------------ exports ------------------------------ */
  return {
    // util
    makeRng: makeRng,
    shuffleInPlace: shuffleInPlace,
    // sudoku
    SUDOKU_CONFIG: SUDOKU_CONFIG,
    sudokuSafe: sudokuSafe,
    sudokuSolve: sudokuSolve,
    sudokuGenerateSolution: sudokuGenerateSolution,
    sudokuNewPuzzle: sudokuNewPuzzle,
    sudokuConflicts: sudokuConflicts,
    sudokuIsComplete: sudokuIsComplete,
    sudokuIsSolved: sudokuIsSolved,
    // puzzle
    puzzleBlankValue: puzzleBlankValue,
    puzzleSolved: puzzleSolved,
    puzzleNeighbors: puzzleNeighbors,
    puzzleIsSolved: puzzleIsSolved,
    puzzleShuffle: puzzleShuffle,
    puzzleInversions: puzzleInversions,
    puzzleIsSolvable: puzzleIsSolvable
  };
})();

// Export for Node (CommonJS) and browser (global). cscript/JScript picks up the
// top-level `var HappyCore` directly when this file is eval'd.
if (typeof module !== 'undefined' && module.exports) { module.exports = HappyCore; }
if (typeof window !== 'undefined') { window.HappyCore = HappyCore; }
