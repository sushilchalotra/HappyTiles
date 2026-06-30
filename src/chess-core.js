/* ============================================================================
   HappyTiles — chess-core.js
   A pure, DOM-free chess engine + a beginner-friendly bot + the Chess Academy
   curriculum data. The counterpart to games-core.js / math-core.js: no DOM, no
   audio, no storage. Same deliberately old-school style (var / function / index
   loops; no let/const, arrows, template literals, Array.map/forEach/includes/
   indexOf, Set/Map) so the SAME file runs under the browser, Node, and cscript.

   Board: 0x88. A square is rank*16 + file, with rank 0 = rank "1" (White's home
   rank) and White pawns moving in the +16 direction. A square is on-board when
   (sq & 0x88) === 0. Pieces are letters: PNBRQK = White, pnbrqk = Black, null = empty.

   Correctness is enforced by perft tests (see tests/smoke-tests.js).
   ============================================================================ */
var ChessCore = (function () {
  'use strict';

  var W = 'w', B = 'b';
  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  var KNIGHT = [31, 33, 18, 14, -31, -33, -18, -14];
  var KING   = [16, -16, 1, -1, 15, 17, -15, -17];
  var ROOK_D = [16, -16, 1, -1];
  var BISH_D = [15, 17, -15, -17];

  var VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };

  /* ------------------------------ helpers ------------------------------ */
  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function onBoard(sq) { return (sq & 0x88) === 0; }
  function fileOf(sq) { return sq & 7; }
  function rankOf(sq) { return sq >> 4; }
  function isUpper(c) { return c >= 'A' && c <= 'Z'; }
  function isLower(c) { return c >= 'a' && c <= 'z'; }
  function colorOf(p) { return p == null ? null : (isUpper(p) ? W : B); }
  function typeOf(p) { return p == null ? null : (p >= 'a' ? String.fromCharCode(p.charCodeAt(0) - 32) : p); }
  function opp(c) { return c === W ? B : W; }

  function sqFromAlg(a) { return (a.charCodeAt(1) - 49) * 16 + (a.charCodeAt(0) - 97); }
  function algFromSq(sq) { return String.fromCharCode(97 + fileOf(sq)) + String.fromCharCode(49 + rankOf(sq)); }

  function emptyBoard() { var b = new Array(128); for (var i = 0; i < 128; i++) { b[i] = null; } return b; }

  /* ------------------------------ FEN ------------------------------ */
  function parseFEN(fen) {
    var parts = ('' + fen).split(' ');
    var rows = parts[0].split('/');
    var board = emptyBoard();
    for (var r = 0; r < 8; r++) {
      var rank = 7 - r, file = 0, row = rows[r], i;
      for (i = 0; i < row.length; i++) {
        var c = row.charAt(i);
        if (c >= '1' && c <= '9') { file += (c.charCodeAt(0) - 48); }
        else { board[rank * 16 + file] = c; file++; }
      }
    }
    return {
      board: board,
      turn: (parts[1] === 'b') ? B : W,
      castling: (parts[2] && parts[2] !== '-') ? parts[2] : '',
      ep: (parts[3] && parts[3] !== '-') ? sqFromAlg(parts[3]) : -1,
      half: parts[4] ? parseInt(parts[4], 10) : 0,
      full: parts[5] ? parseInt(parts[5], 10) : 1
    };
  }

  function exportFEN(state) {
    var out = '', r, f, empty;
    for (r = 7; r >= 0; r--) {
      empty = 0;
      for (f = 0; f < 8; f++) {
        var p = state.board[r * 16 + f];
        if (p == null) { empty++; }
        else { if (empty) { out += empty; empty = 0; } out += p; }
      }
      if (empty) { out += empty; }
      if (r > 0) { out += '/'; }
    }
    out += ' ' + state.turn;
    out += ' ' + (state.castling ? state.castling : '-');
    out += ' ' + (state.ep >= 0 ? algFromSq(state.ep) : '-');
    out += ' ' + state.half + ' ' + state.full;
    return out;
  }

  function cloneState(s) {
    return { board: s.board.slice(0), turn: s.turn, castling: s.castling, ep: s.ep, half: s.half, full: s.full };
  }

  function findKing(board, color) {
    var target = color === W ? 'K' : 'k';
    for (var i = 0; i < 128; i++) { if ((i & 0x88) === 0 && board[i] === target) { return i; } }
    return -1;
  }

  /* ------------------------------ attacks ------------------------------ */
  // Is `sq` attacked by any piece of color `by`?
  function isSquareAttacked(board, sq, by) {
    var i, t, p;
    // pawns
    if (by === W) {
      if (onBoard(sq - 15) && board[sq - 15] === 'P') { return true; }
      if (onBoard(sq - 17) && board[sq - 17] === 'P') { return true; }
    } else {
      if (onBoard(sq + 15) && board[sq + 15] === 'p') { return true; }
      if (onBoard(sq + 17) && board[sq + 17] === 'p') { return true; }
    }
    // knights
    for (i = 0; i < 8; i++) {
      t = sq + KNIGHT[i];
      if (onBoard(t)) { p = board[t]; if (p != null && colorOf(p) === by && typeOf(p) === 'N') { return true; } }
    }
    // king
    for (i = 0; i < 8; i++) {
      t = sq + KING[i];
      if (onBoard(t)) { p = board[t]; if (p != null && colorOf(p) === by && typeOf(p) === 'K') { return true; } }
    }
    // sliders — rook/queen orthogonally
    for (i = 0; i < 4; i++) {
      t = sq + ROOK_D[i];
      while (onBoard(t)) {
        p = board[t];
        if (p != null) { if (colorOf(p) === by && (typeOf(p) === 'R' || typeOf(p) === 'Q')) { return true; } break; }
        t += ROOK_D[i];
      }
    }
    // bishop/queen diagonally
    for (i = 0; i < 4; i++) {
      t = sq + BISH_D[i];
      while (onBoard(t)) {
        p = board[t];
        if (p != null) { if (colorOf(p) === by && (typeOf(p) === 'B' || typeOf(p) === 'Q')) { return true; } break; }
        t += BISH_D[i];
      }
    }
    return false;
  }

  function isInCheck(state, color) {
    var k = findKing(state.board, color);
    if (k < 0) { return false; }
    return isSquareAttacked(state.board, k, opp(color));
  }

  /* ------------------------------ move generation ------------------------------ */
  // Move: { from, to, piece, captured, promotion, flag }
  // flag: '' | 'cap' | 'double' | 'ep' | 'ck' | 'cq' | 'promo'
  function mk(from, to, piece, captured, promotion, flag) {
    return { from: from, to: to, piece: piece, captured: captured || null, promotion: promotion || null, flag: flag || '' };
  }

  function addPawnMoves(list, board, from, to, color, flag, captured) {
    var promoRank = color === W ? 7 : 0;
    if (rankOf(to) === promoRank) {
      var promos = color === W ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
      for (var i = 0; i < 4; i++) { list.push(mk(from, to, board[from], captured, promos[i], 'promo')); }
    } else {
      list.push(mk(from, to, board[from], captured, null, flag));
    }
  }

  // Pseudo-legal moves (does not filter out moves that leave own king in check).
  function genPseudo(state, onlyFrom) {
    var board = state.board, turn = state.turn, list = [], sq, p, i, t, d;
    for (sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { continue; }
      if (onlyFrom != null && sq !== onlyFrom) { continue; }
      p = board[sq];
      if (p == null || colorOf(p) !== turn) { continue; }
      var type = typeOf(p);

      if (type === 'P') {
        var dir = turn === W ? 16 : -16;
        var startRank = turn === W ? 1 : 6;
        // single push
        t = sq + dir;
        if (onBoard(t) && board[t] == null) {
          addPawnMoves(list, board, sq, t, turn, '', null);
          // double push
          if (rankOf(sq) === startRank && board[sq + 2 * dir] == null) {
            list.push(mk(sq, sq + 2 * dir, p, null, null, 'double'));
          }
        }
        // captures + en passant
        var caps = [dir - 1, dir + 1];
        for (i = 0; i < 2; i++) {
          t = sq + caps[i];
          if (!onBoard(t)) { continue; }
          var tp = board[t];
          if (tp != null && colorOf(tp) !== turn) { addPawnMoves(list, board, sq, t, turn, 'cap', tp); }
          else if (t === state.ep && state.ep >= 0) { list.push(mk(sq, t, p, (turn === W ? 'p' : 'P'), null, 'ep')); }
        }

      } else if (type === 'N') {
        for (i = 0; i < 8; i++) {
          t = sq + KNIGHT[i];
          if (!onBoard(t)) { continue; }
          if (board[t] == null) { list.push(mk(sq, t, p, null, null, '')); }
          else if (colorOf(board[t]) !== turn) { list.push(mk(sq, t, p, board[t], null, 'cap')); }
        }

      } else if (type === 'K') {
        for (i = 0; i < 8; i++) {
          t = sq + KING[i];
          if (!onBoard(t)) { continue; }
          if (board[t] == null) { list.push(mk(sq, t, p, null, null, '')); }
          else if (colorOf(board[t]) !== turn) { list.push(mk(sq, t, p, board[t], null, 'cap')); }
        }
        genCastles(state, sq, list);

      } else {
        // sliders
        var dirs = type === 'R' ? ROOK_D : (type === 'B' ? BISH_D : ROOK_D.concat(BISH_D));
        for (d = 0; d < dirs.length; d++) {
          t = sq + dirs[d];
          while (onBoard(t)) {
            if (board[t] == null) { list.push(mk(sq, t, p, null, null, '')); }
            else { if (colorOf(board[t]) !== turn) { list.push(mk(sq, t, p, board[t], null, 'cap')); } break; }
            t += dirs[d];
          }
        }
      }
    }
    return list;
  }

  function genCastles(state, ksq, list) {
    var board = state.board, turn = state.turn, by = opp(turn);
    if (turn === W && ksq === 4) {
      if (state.castling.indexOf('K') >= 0 && board[5] == null && board[6] == null &&
          !isSquareAttacked(board, 4, by) && !isSquareAttacked(board, 5, by) && !isSquareAttacked(board, 6, by)) {
        list.push(mk(4, 6, 'K', null, null, 'ck'));
      }
      if (state.castling.indexOf('Q') >= 0 && board[3] == null && board[2] == null && board[1] == null &&
          !isSquareAttacked(board, 4, by) && !isSquareAttacked(board, 3, by) && !isSquareAttacked(board, 2, by)) {
        list.push(mk(4, 2, 'K', null, null, 'cq'));
      }
    } else if (turn === B && ksq === 116) {
      if (state.castling.indexOf('k') >= 0 && board[117] == null && board[118] == null &&
          !isSquareAttacked(board, 116, by) && !isSquareAttacked(board, 117, by) && !isSquareAttacked(board, 118, by)) {
        list.push(mk(116, 118, 'k', null, null, 'ck'));
      }
      if (state.castling.indexOf('q') >= 0 && board[115] == null && board[114] == null && board[113] == null &&
          !isSquareAttacked(board, 116, by) && !isSquareAttacked(board, 115, by) && !isSquareAttacked(board, 114, by)) {
        list.push(mk(116, 114, 'k', null, null, 'cq'));
      }
    }
  }

  function removeCastlingFor(state, sq, piece) {
    // king moved
    if (piece === 'K') { state.castling = state.castling.replace('K', '').replace('Q', ''); }
    if (piece === 'k') { state.castling = state.castling.replace('k', '').replace('q', ''); }
    // a rook left (or was captured on) its home square
    if (sq === 0) { state.castling = state.castling.replace('Q', ''); }
    if (sq === 7) { state.castling = state.castling.replace('K', ''); }
    if (sq === 112) { state.castling = state.castling.replace('q', ''); }
    if (sq === 119) { state.castling = state.castling.replace('k', ''); }
  }

  function makeMove(state, m) {
    var board = state.board, turn = state.turn;
    var undo = { captured: null, capSq: -1, castling: state.castling, ep: state.ep, half: state.half, full: state.full };

    // en-passant capture removes the pawn behind the destination
    if (m.flag === 'ep') {
      var capSq = m.to + (turn === W ? -16 : 16);
      undo.captured = board[capSq]; undo.capSq = capSq; board[capSq] = null;
    } else if (m.captured != null) {
      undo.captured = board[m.to]; undo.capSq = m.to;
    }

    // move the piece (promotion swaps in the new piece)
    board[m.to] = m.promotion != null ? m.promotion : board[m.from];
    board[m.from] = null;

    // castling: move the rook too
    if (m.flag === 'ck') { if (turn === W) { board[5] = 'R'; board[7] = null; } else { board[117] = 'r'; board[119] = null; } }
    else if (m.flag === 'cq') { if (turn === W) { board[3] = 'R'; board[0] = null; } else { board[115] = 'r'; board[112] = null; } }

    // castling rights: clear on king/rook move and on a rook being captured
    removeCastlingFor(state, m.from, m.piece);
    if (undo.capSq >= 0) { removeCastlingFor(state, undo.capSq, undo.captured); }

    // en-passant target square (only after a double pawn push)
    state.ep = (m.flag === 'double') ? (m.from + (turn === W ? 16 : -16)) : -1;

    // clocks
    state.half = (typeOf(m.piece) === 'P' || undo.capSq >= 0) ? 0 : state.half + 1;
    if (turn === B) { state.full += 1; }
    state.turn = opp(turn);
    return undo;
  }

  function unmakeMove(state, m, undo) {
    var board = state.board;
    state.turn = opp(state.turn);
    var turn = state.turn;

    // restore mover (de-promote back to a pawn)
    board[m.from] = m.promotion != null ? (turn === W ? 'P' : 'p') : board[m.to];
    board[m.to] = null;

    if (m.flag === 'ep') { board[undo.capSq] = undo.captured; }
    else if (undo.capSq >= 0) { board[undo.capSq] = undo.captured; }

    if (m.flag === 'ck') { if (turn === W) { board[7] = 'R'; board[5] = null; } else { board[119] = 'r'; board[117] = null; } }
    else if (m.flag === 'cq') { if (turn === W) { board[0] = 'R'; board[3] = null; } else { board[112] = 'r'; board[115] = null; } }

    state.castling = undo.castling; state.ep = undo.ep; state.half = undo.half; state.full = undo.full;
  }

  // Legal moves: pseudo-legal filtered so the mover's king is not left in check.
  function legalMoves(state, onlyFrom) {
    var pseudo = genPseudo(state, onlyFrom), legal = [], i, mover = state.turn;
    for (i = 0; i < pseudo.length; i++) {
      var m = pseudo[i];
      var undo = makeMove(state, m);
      if (!isInCheck(state, mover)) { legal.push(m); }
      unmakeMove(state, m, undo);
    }
    return legal;
  }

  function perft(state, depth) {
    if (depth === 0) { return 1; }
    var moves = legalMoves(state), nodes = 0, i;
    for (i = 0; i < moves.length; i++) {
      var undo = makeMove(state, moves[i]);
      nodes += perft(state, depth - 1);
      unmakeMove(state, moves[i], undo);
    }
    return nodes;
  }

  function gameStatus(state) {
    var moves = legalMoves(state);
    if (moves.length === 0) { return isInCheck(state, state.turn) ? 'checkmate' : 'stalemate'; }
    if (insufficientMaterial(state.board)) { return 'draw'; }
    if (state.half >= 100) { return 'draw'; }
    return 'ongoing';
  }

  function insufficientMaterial(board) {
    var minors = 0, others = 0, i, t;
    for (i = 0; i < 128; i++) {
      if (i & 0x88) { continue; }
      t = typeOf(board[i]);
      if (t == null || t === 'K') { continue; }
      if (t === 'N' || t === 'B') { minors++; }
      else { others++; }
    }
    return others === 0 && minors <= 1;
  }

  // Does playing `m` give checkmate? (handy for puzzle checking)
  function moveGivesMate(state, m) {
    var undo = makeMove(state, m);
    var mate = gameStatus(state) === 'checkmate';
    unmakeMove(state, m, undo);
    return mate;
  }
  function findMove(moves, fromSq, toSq) {
    for (var i = 0; i < moves.length; i++) { if (moves[i].from === fromSq && moves[i].to === toSq) { return moves[i]; } }
    return null;
  }

  /* ------------------------------ evaluation + bot ------------------------------ */
  // Small central nudge so the bot doesn't shuffle to the rim; material dominates.
  function centerBonus(sq, type) {
    if (type === 'Q' || type === 'K') { return 0; }
    var f = fileOf(sq), r = rankOf(sq);
    var cf = f < 4 ? f : 7 - f, cr = r < 4 ? r : 7 - r;     // 0..3, higher = closer to center
    var b = (cf + cr) * 3;
    if (type === 'N' && (f === 0 || f === 7 || r === 0 || r === 7)) { b -= 18; }   // knights hate the rim
    return b;
  }

  function evaluate(state) {
    var board = state.board, score = 0, i, p, t;
    for (i = 0; i < 128; i++) {
      if (i & 0x88) { continue; }
      p = board[i]; if (p == null) { continue; }
      t = typeOf(p);
      var v = VALUE[t] + centerBonus(i, t);
      score += colorOf(p) === W ? v : -v;
    }
    return state.turn === W ? score : -score;
  }

  function orderMoves(moves) {
    // captures first (MVV-LVA-ish) to help alpha-beta prune
    moves.sort(function (a, b) {
      var av = a.captured ? VALUE[typeOf(a.captured)] - VALUE[typeOf(a.piece)] / 10 : -1000;
      var bv = b.captured ? VALUE[typeOf(b.captured)] - VALUE[typeOf(b.piece)] / 10 : -1000;
      return bv - av;
    });
    return moves;
  }

  var MATE = 100000;
  function negamax(state, depth, alpha, beta) {
    var moves = legalMoves(state);
    if (moves.length === 0) { return isInCheck(state, state.turn) ? -MATE - depth : 0; }
    if (depth === 0) { return evaluate(state); }
    orderMoves(moves);
    var best = -MATE * 2, i;
    for (i = 0; i < moves.length; i++) {
      var undo = makeMove(state, moves[i]);
      var score = -negamax(state, depth - 1, -beta, -alpha);
      unmakeMove(state, moves[i], undo);
      if (score > best) { best = score; }
      if (best > alpha) { alpha = best; }
      if (alpha >= beta) { break; }
    }
    return best;
  }

  // Beginner-leveled move chooser. level 1 = gentle (random, capture-happy),
  // 2 = ~depth-2 with occasional blunder, 3 = ~depth-3. rng keeps it non-repetitive.
  function bestMove(state, level, rng) {
    rng = rng || Math.random;
    var work = cloneState(state);
    var moves = legalMoves(work);
    if (moves.length === 0) { return null; }

    if (level <= 1) {
      // mostly random, but ~60% of the time grab a free-ish capture if one exists
      if (rng() < 0.6) {
        var caps = [], i;
        for (i = 0; i < moves.length; i++) { if (moves[i].captured) { caps.push(moves[i]); } }
        if (caps.length) { return caps[(rng() * caps.length) | 0]; }
      }
      return moves[(rng() * moves.length) | 0];
    }

    var depth = level >= 3 ? 3 : 2;
    orderMoves(moves);
    var scored = [], i2;
    for (i2 = 0; i2 < moves.length; i2++) {
      var undo = makeMove(work, moves[i2]);
      var sc = -negamax(work, depth - 1, -MATE * 2, MATE * 2);
      unmakeMove(work, moves[i2], undo);
      scored.push({ m: moves[i2], s: sc + (rng() * 8 - 4) });   // tiny noise to vary play
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    // Level 2 sometimes plays the 2nd/3rd choice (a beatable "blunder").
    if (level === 2 && scored.length > 2 && rng() < 0.25) {
      return scored[1 + ((rng() * 2) | 0)].m;
    }
    return scored[0].m;
  }

  /* ============================================================================
     CHESS ACADEMY — curriculum data (pure). Mini-games use a single piece on an
     otherwise-empty board to "collect" coin squares with legal moves; the pawn
     lesson and the puzzles use FEN positions. Tests verify every entry.
     ============================================================================ */
  // Mini-game: { piece, start (alg), coins ([alg]) }  → board built by the UI.
  // Puzzle:    { fen, hint? }  → success = the player's move gives checkmate.
  var CHESS_UNITS = [
    { id: 'pieces', title: 'Meet the Pieces', emoji: '♟', lessons: [
      { id: 'rook',   title: 'The Rook',   type: 'piece', piece: 'R', tip: 'The rook moves in straight lines — up, down, left, right.',
        start: 'a1', coins: ['a5', 'd5', 'd1', 'h1'] },
      { id: 'bishop', title: 'The Bishop', type: 'piece', piece: 'B', tip: 'The bishop slides on diagonals and stays on one color.',
        start: 'c1', coins: ['a3', 'e3', 'f4', 'h6'] },
      { id: 'queen',  title: 'The Queen',  type: 'piece', piece: 'Q', tip: 'The queen is the strongest — straight lines AND diagonals!',
        start: 'd1', coins: ['d5', 'h5', 'a4', 'f3'] },
      { id: 'king',   title: 'The King',   type: 'piece', piece: 'K', tip: 'The king moves one square in any direction. Keep it safe!',
        start: 'e1', coins: ['e2', 'd3', 'e4', 'f3'] },
      { id: 'knight', title: 'The Knight', type: 'piece', piece: 'N', tip: 'The knight hops in an L-shape and can jump over pieces.',
        start: 'b1', coins: ['c3', 'e4', 'd6', 'f5'] },
      { id: 'pawn',   title: 'The Pawn',   type: 'promote', piece: 'P', tip: 'Pawns step forward and capture diagonally. Reach the end to promote!',
        fen: '8/3P4/8/8/8/8/8/8 w - - 0 1', goalRank: 8 }
    ] },
    { id: 'capture', title: 'Capturing & Value', emoji: '⚔', lessons: [
      { id: 'values', title: 'Piece Points', type: 'info', tip: 'Pawn 1 · Knight 3 · Bishop 3 · Rook 5 · Queen 9. Win pieces, win the game!' },
      { id: 'grab',   title: 'Win the Queen', type: 'piece', piece: 'N', tip: 'Hop with the knight to grab every coin!',
        start: 'g1', coins: ['f3', 'e5', 'd7', 'c5', 'e4'] }
    ] },
    { id: 'mate', title: 'Check & Checkmate', emoji: '♚', lessons: [
      { id: 'what-check', title: 'What is Check?', type: 'info', tip: 'Check means the king is under attack. You MUST get out of check right away.' },
      { id: 'm1', title: 'Mate in One #1', type: 'puzzle', tip: 'Trap the king on the back row.', fen: '6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1' },
      { id: 'm2', title: 'Mate in One #2', type: 'puzzle', tip: 'Use your king to support the queen.', fen: '6k1/3Q4/6K1/8/8/8/8/8 w - - 0 1' },
      { id: 'm3', title: 'Mate in One #3', type: 'puzzle', tip: 'Two rooks make a ladder — one guards the row in front.', fen: '6k1/1R6/8/8/8/8/8/R5K1 w - - 0 1' },
      { id: 'm4', title: 'Mate in One #4', type: 'puzzle', tip: 'Bring the queen right up close.', fen: '7k/8/6KQ/8/8/8/8/8 w - - 0 1' }
    ] },
    { id: 'play', title: 'Play a Game', emoji: '♞', lessons: [
      { id: 'bot1', title: 'Friendly Bot', type: 'play', botLevel: 1, tip: 'Develop your pieces, castle, and look for free captures!' },
      { id: 'bot2', title: 'Clever Bot',   type: 'play', botLevel: 2, tip: 'Protect your pieces and watch for the bot’s threats.' },
      { id: 'bot3', title: 'Sharp Bot',    type: 'play', botLevel: 3, tip: 'Think before you move. Can you find a checkmate?' }
    ] }
  ];

  /* ------------------------------ exports ------------------------------ */
  return {
    W: W, B: B, START_FEN: START_FEN, VALUE: VALUE,
    makeRng: makeRng,
    onBoard: onBoard, fileOf: fileOf, rankOf: rankOf, colorOf: colorOf, typeOf: typeOf, opp: opp,
    sqFromAlg: sqFromAlg, algFromSq: algFromSq,
    parseFEN: parseFEN, exportFEN: exportFEN, cloneState: cloneState, findKing: findKing,
    isSquareAttacked: isSquareAttacked, isInCheck: isInCheck,
    genPseudo: genPseudo, legalMoves: legalMoves, makeMove: makeMove, unmakeMove: unmakeMove,
    perft: perft, gameStatus: gameStatus, insufficientMaterial: insufficientMaterial,
    moveGivesMate: moveGivesMate, findMove: findMove,
    evaluate: evaluate, bestMove: bestMove,
    CHESS_UNITS: CHESS_UNITS
  };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = ChessCore; }
if (typeof window !== 'undefined') { window.ChessCore = ChessCore; }
