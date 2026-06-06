/* ============================================================================
   HappyTiles — app.js
   Vanilla JS, zero dependencies. Sections:
     1. Storage + settings
     2. Audio engine (Web Audio, generated SFX, mute)
     3. Confetti (reduced-motion aware)
     4. Win overlay
     5. SVG assets (Sudoku shapes, Puzzle pictures)
     6. Navigation
     7. Sudoku game
     8. Sliding Puzzle game
     9. Boot
   ============================================================================ */
(function () {
  'use strict';

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ========================== 1. Storage + settings ========================== */
  const Store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
      catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* private mode: ignore */ }
    }
  };

  const settings = {
    muted:           Store.get('ht_muted', 'false') === 'true',
    sudokuSymbols:   Store.get('ht_sudoku_symbols', 'shapes'),   // 'shapes' | 'numbers'
    sudokuSize:      parseInt(Store.get('ht_sudoku_size', '4'), 10),
    puzzlePic:       parseInt(Store.get('ht_puzzle_pic', '0'), 10),
    puzzleNumbers:   Store.get('ht_puzzle_numbers', 'true') === 'true'
  };

  /* ========================== 2. Audio engine ========================== */
  const Audio = (function () {
    let ctx = null;

    function ensure() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      return ctx;
    }

    function tone(freq, start, dur, type, peak) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      const t0 = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak || 0.18, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    const play = function (name) {
      if (settings.muted) return;
      const c = ensure();
      if (!c) return;
      switch (name) {
        case 'tap':   tone(520, 0, 0.10, 'triangle', 0.14); break;
        case 'place': tone(720, 0, 0.12, 'sine', 0.18); break;
        case 'erase': tone(300, 0, 0.10, 'sine', 0.12); break;
        case 'slide': tone(440, 0, 0.09, 'triangle', 0.14); break;
        case 'error': tone(150, 0, 0.18, 'sawtooth', 0.10); break;
        case 'win':
          [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.12, 0.28, 'triangle', 0.18));
          break;
      }
    };

    // Unlock the audio context on the first user gesture (autoplay policies).
    window.addEventListener('pointerdown', function unlock() {
      ensure();
      window.removeEventListener('pointerdown', unlock);
    }, { once: true });

    return { play: play };
  })();

  function syncSoundButton() {
    const btn = $('#sound-toggle');
    btn.classList.toggle('is-muted', settings.muted);
    btn.setAttribute('aria-pressed', String(!settings.muted));
    btn.setAttribute('aria-label', settings.muted ? 'Sound off' : 'Sound on');
  }

  /* ========================== 3. Confetti ========================== */
  const Confetti = (function () {
    const canvas = $('#confetti-canvas');
    const colors = ['#ff5fa2', '#21d4c4', '#ffd23f', '#8a5cf6', '#ff8a3d', '#6c3ce0'];
    let raf = null, particles = [], stopAt = 0;

    function size() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }

    function start() {
      if (REDUCED_MOTION) return;           // honor reduced-motion: no falling confetti
      size();
      const ctx = canvas.getContext('2d');
      particles = [];
      for (let i = 0; i < 140; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: -20 - Math.random() * canvas.height,
          r: 5 + Math.random() * 7,
          c: colors[(Math.random() * colors.length) | 0],
          vy: 2 + Math.random() * 3.5,
          vx: -1.5 + Math.random() * 3,
          rot: Math.random() * Math.PI,
          vr: -0.2 + Math.random() * 0.4
        });
      }
      stopAt = performance.now() + 2600;
      cancelAnimationFrame(raf);
      tick(ctx);
    }

    function tick(ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.y += p.vy; p.x += p.vx; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6);
        ctx.restore();
      });
      particles = particles.filter((p) => p.y < canvas.height + 30);
      if (performance.now() < stopAt || particles.length) {
        raf = requestAnimationFrame(() => tick(ctx));
      }
    }

    function stop() {
      cancelAnimationFrame(raf);
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return { start, stop };
  })();

  /* ========================== 4. Win overlay ========================== */
  const Win = (function () {
    const overlay = $('#win-overlay');
    let onAgain = null;

    function show(title, sub, againCb) {
      onAgain = againCb;
      $('#win-title').textContent = title;
      $('#win-sub').textContent = sub;
      overlay.hidden = false;
      Audio.play('win');
      Confetti.start();
      $('#win-again').focus();
    }
    function hide() {
      overlay.hidden = true;
      Confetti.stop();
    }
    $('#win-again').addEventListener('click', () => { hide(); if (onAgain) onAgain(); });
    $('#win-home').addEventListener('click', () => { hide(); Nav.go('home'); });

    return { show, hide };
  })();

  /* ===================== 4b. Confirm dialog ===================== */
  // Themed yes/no prompt, used before an action would discard in-progress work.
  const Confirm = (function () {
    const overlay = $('#confirm-overlay');
    let onYes = null;

    function ask(opts) {
      onYes = opts.onYes || null;
      $('#confirm-title').textContent = opts.title || 'Start a new game?';
      $('#confirm-sub').textContent = opts.sub || 'Your current progress will be lost.';
      $('#confirm-yes').textContent = opts.yes || 'Yes';
      overlay.hidden = false;
      $('#confirm-no').focus();   // default to the safe choice
    }
    function close() { overlay.hidden = true; onYes = null; }

    $('#confirm-yes').addEventListener('click', () => { const f = onYes; close(); if (f) f(); });
    $('#confirm-no').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (!overlay.hidden && e.key === 'Escape') close(); });

    return { ask };
  })();

  /* ========================== 5. SVG assets ========================== */
  // Sudoku symbols 1..6 as bright distinct shapes.
  // Nine distinct bright shapes so shapes-mode works for 4×4, 6×6 and 9×9.
  const SHAPE_COLORS = ['#ff5fa2', '#ff8a3d', '#21d4c4', '#ffce21', '#8a5cf6',
                        '#3da5ff', '#34c759', '#ff3b30', '#c026d3'];
  function shapeSVG(value) {
    const c = SHAPE_COLORS[value - 1];
    const paths = {
      1: `<polygon points="50,6 61,38 95,38 67,58 78,92 50,71 22,92 33,58 5,38 39,38" fill="${c}"/>`,
      2: `<path d="M50 86 L18 52 A18 18 0 0 1 50 30 A18 18 0 0 1 82 52 Z" fill="${c}"/>`,
      3: `<circle cx="50" cy="50" r="38" fill="${c}"/>`,
      4: `<rect x="18" y="18" width="64" height="64" rx="12" fill="${c}"/>`,
      5: `<polygon points="50,12 88,84 12,84" fill="${c}"/>`,
      6: `<polygon points="50,10 86,30 86,70 50,90 14,70 14,30" fill="${c}"/>`,
      7: `<polygon points="50,8 90,50 50,92 10,50" fill="${c}"/>`,
      8: `<polygon points="50,8 90,40 73,90 27,90 10,40" fill="${c}"/>`,
      9: `<polygon points="38,10 62,10 62,38 90,38 90,62 62,62 62,90 38,90 38,62 10,62 10,38 38,38" fill="${c}"/>`
    };
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${paths[value] || ''}</svg>`;
  }
  const SHAPE_NAMES = ['', 'star', 'heart', 'circle', 'square', 'triangle', 'hexagon',
                       'diamond', 'pentagon', 'cross'];

  function symbolMarkup(value, mode) {
    if (!value) return '';
    return mode === 'numbers' ? String(value) : shapeSVG(value);
  }
  function symbolLabel(value, mode) {
    if (!value) return 'empty';
    return mode === 'numbers' ? String(value) : SHAPE_NAMES[value];
  }

  // Sliding-puzzle pictures (full 300x300 SVGs, used as tile backgrounds).
  const PICTURES = [
    { name: 'Kitty', svg:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'>
        <rect width='300' height='300' fill='#ffe3f1'/>
        <polygon points='70,70 110,30 120,90' fill='#ff8ab8'/>
        <polygon points='230,70 190,30 180,90' fill='#ff8ab8'/>
        <circle cx='150' cy='160' r='100' fill='#ff5fa2'/>
        <circle cx='115' cy='140' r='16' fill='#2b2138'/>
        <circle cx='185' cy='140' r='16' fill='#2b2138'/>
        <polygon points='150,165 138,180 162,180' fill='#fff'/>
        <path d='M150 180 Q135 200 118 188' stroke='#2b2138' stroke-width='5' fill='none'/>
        <path d='M150 180 Q165 200 182 188' stroke='#2b2138' stroke-width='5' fill='none'/>
        <g stroke='#fff' stroke-width='4'>
          <line x1='95' y1='165' x2='45' y2='155'/><line x1='95' y1='178' x2='48' y2='185'/>
          <line x1='205' y1='165' x2='255' y2='155'/><line x1='205' y1='178' x2='252' y2='185'/>
        </g>
      </svg>` },
    { name: 'Rocket', svg:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'>
        <rect width='300' height='300' fill='#10204a'/>
        <g fill='#ffd23f'>
          <circle cx='40' cy='50' r='3'/><circle cx='250' cy='40' r='3'/><circle cx='90' cy='250' r='3'/>
          <circle cx='260' cy='220' r='3'/><circle cx='60' cy='150' r='2'/><circle cx='210' cy='120' r='2'/>
        </g>
        <path d='M150 40 Q200 110 190 200 L110 200 Q100 110 150 40Z' fill='#f4f6ff'/>
        <circle cx='150' cy='120' r='24' fill='#21d4c4'/>
        <polygon points='110,180 80,230 110,215' fill='#ff5fa2'/>
        <polygon points='190,180 220,230 190,215' fill='#ff5fa2'/>
        <polygon points='130,205 150,270 170,205' fill='#ff8a3d'/>
      </svg>` },
    { name: 'Flower', svg:
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 300'>
        <rect width='300' height='300' fill='#e7fbff'/>
        <rect x='144' y='150' width='12' height='120' fill='#2faa5a'/>
        <ellipse cx='120' cy='210' rx='34' ry='16' fill='#3cc06a' transform='rotate(-25 120 210)'/>
        <g fill='#8a5cf6'>
          <circle cx='150' cy='70' r='34'/><circle cx='210' cy='110' r='34'/>
          <circle cx='190' cy='175' r='34'/><circle cx='110' cy='175' r='34'/>
          <circle cx='90' cy='110' r='34'/>
        </g>
        <circle cx='150' cy='130' r='40' fill='#ffd23f'/>
        <circle cx='150' cy='130' r='22' fill='#ff8a3d'/>
      </svg>` }
  ];
  function pictureURL(i) {
    return `url("data:image/svg+xml,${encodeURIComponent(PICTURES[i].svg)}")`;
  }

  /* ========================== 6. Navigation ========================== */
  const Nav = (function () {
    const views = { home: $('#view-home'), sudoku: $('#view-sudoku'), puzzle: $('#view-puzzle') };
    const started = { sudoku: false, puzzle: false };

    function go(name) {
      if (!views[name]) name = 'home';
      Object.keys(views).forEach((k) => {
        const active = k === name;
        views[k].hidden = !active;
        views[k].classList.toggle('is-active', active);
      });
      if (location.hash !== '#' + name) {
        // update hash without triggering another full route
        history.replaceState(null, '', '#' + name);
      }
      if (name === 'sudoku' && !started.sudoku) { Sudoku.init(); started.sudoku = true; }
      if (name === 'puzzle' && !started.puzzle) { Puzzle.init(); started.puzzle = true; }
    }

    function route() { go((location.hash || '#home').slice(1)); }

    window.addEventListener('hashchange', route);
    return { go, route };
  })();

  /* ========================== 7. Sudoku ========================== */
  const Sudoku = (function () {
    const boardEl  = $('#sudoku-board');
    const paletteEl = $('#sudoku-palette');
    const statusEl = $('#sudoku-status');

    let n, boxRows, boxCols;
    let grid = [];          // current values (0 = empty)
    let given = [];         // true where the cell is a locked clue
    let selected = -1;      // selected cell index
    let armed = null;       // armed palette symbol (0 = eraser)
    let undoStack = [];

    // Pure generation/validation lives in HappyCore (see games-core.js).
    function buildPuzzle() {
      const p = HappyCore.sudokuNewPuzzle(settings.sudokuSize);
      n = p.n; boxRows = p.boxRows; boxCols = p.boxCols;
      grid = p.grid; given = p.given;
      selected = -1; armed = null; undoStack = [];
      render();
      renderPalette();
      setStatus('Tap a square, then pick a symbol.');
    }

    // True when the player has filled at least one (non-clue) square and the
    // board isn't already solved — i.e. there's progress worth protecting.
    function inProgress() {
      if (HappyCore.sudokuIsSolved(grid, n, boxRows, boxCols)) return false;
      for (let i = 0; i < grid.length; i++) {
        if (grid[i] !== 0 && !given[i]) return true;
      }
      return false;
    }

    // "New" button — confirm only if there's progress to lose.
    function requestNew() {
      if (inProgress()) {
        Confirm.ask({ title: 'Start a new puzzle?', sub: 'Your current puzzle will be lost.',
                      yes: 'Yes, new puzzle', onYes: buildPuzzle });
      } else {
        buildPuzzle();
      }
    }

    function conflicts() {
      return new Set(HappyCore.sudokuConflicts(grid, n, boxRows, boxCols));
    }

    function isSolved(bad) {
      return HappyCore.sudokuIsComplete(grid) && bad.size === 0;
    }

    // --- rendering --------------------------------------------------------
    function render() {
      boardEl.style.setProperty('--n', n);
      boardEl.innerHTML = '';
      const bad = conflicts();
      for (let i = 0; i < n * n; i++) {
        const r = Math.floor(i / n), c = i % n;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 's-cell';
        if (given[i]) cell.classList.add('is-given');
        if (i === selected) cell.classList.add('is-selected');
        if (bad.has(i)) cell.classList.add('is-conflict');
        if ((c + 1) % boxCols === 0 && c !== n - 1) cell.classList.add('box-right');
        if ((r + 1) % boxRows === 0 && r !== n - 1) cell.classList.add('box-bottom');
        cell.innerHTML = symbolMarkup(grid[i], settings.sudokuSymbols);
        cell.setAttribute('aria-label',
          `Row ${r + 1} column ${c + 1}, ${given[i] ? 'clue ' : ''}${symbolLabel(grid[i], settings.sudokuSymbols)}`);
        cell.dataset.i = i;
        cell.addEventListener('click', () => onCell(i));
        boardEl.appendChild(cell);
      }
      return bad;
    }

    function renderPalette() {
      paletteEl.innerHTML = '';
      for (let v = 1; v <= n; v++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pal-btn' + (armed === v ? ' is-active' : '');
        b.innerHTML = symbolMarkup(v, settings.sudokuSymbols);
        b.setAttribute('aria-label', 'Place ' + symbolLabel(v, settings.sudokuSymbols));
        b.addEventListener('click', () => onPalette(v));
        paletteEl.appendChild(b);
      }
      const erase = document.createElement('button');
      erase.type = 'button';
      erase.className = 'pal-btn pal-erase' + (armed === 0 ? ' is-active' : '');
      erase.innerHTML = '<span aria-hidden="true">🧽</span>';
      erase.setAttribute('aria-label', 'Eraser');
      erase.addEventListener('click', () => onPalette(0));
      paletteEl.appendChild(erase);
    }

    function setStatus(msg) { statusEl.textContent = msg; }

    // --- interaction ------------------------------------------------------
    function onCell(i) {
      if (given[i]) { Audio.play('error'); setStatus('That one is a clue — pick an empty square.'); return; }
      selected = i;
      Audio.play('tap');
      if (armed !== null) place(i, armed);
      else { render(); renderPalette(); }
    }

    function onPalette(v) {
      armed = v;
      if (selected >= 0 && !given[selected]) place(selected, v);
      else { render(); renderPalette(); }
    }

    function place(i, v) {
      if (grid[i] === v) return;
      undoStack.push({ i, prev: grid[i] });
      grid[i] = v;
      Audio.play(v === 0 ? 'erase' : 'place');
      // Clear the active selection so the NEXT square doesn't auto-fill with
      // the symbol just placed — each square is filled deliberately.
      armed = null;
      selected = -1;
      const bad = render();
      renderPalette();
      // brief pop on the changed cell
      const el = boardEl.querySelector(`[data-i="${i}"]`);
      if (el && v !== 0 && !REDUCED_MOTION) { el.classList.add('pop'); }
      if (isSolved(bad)) {
        setStatus('You solved it! 🎉');
        Win.show('You did it!', 'Sudoku solved! 🌟', buildPuzzle);
      } else if (bad.size) {
        setStatus('Oops — two of the same in a line or box. Try again!');
      } else {
        setStatus('Nice! Keep going.');
      }
    }

    function undo() {
      if (!undoStack.length) { Audio.play('error'); return; }
      const { i, prev } = undoStack.pop();
      grid[i] = prev;
      selected = i;
      Audio.play('tap');
      render(); renderPalette();
      setStatus('Undone.');
    }

    function applySize(size) {
      settings.sudokuSize = size;
      Store.set('ht_sudoku_size', String(size));
      $('#size-4').setAttribute('aria-pressed', String(size === 4));
      $('#size-6').setAttribute('aria-pressed', String(size === 6));
      $('#size-9').setAttribute('aria-pressed', String(size === 9));
      buildPuzzle();   // pulls n/boxRows/boxCols from HappyCore for this size
    }

    // Size button — ignore taps on the current size; confirm if changing size
    // would discard an in-progress puzzle.
    function requestSize(size) {
      if (size === settings.sudokuSize) return;
      if (inProgress()) {
        Confirm.ask({ title: 'Change board size?', sub: 'This starts a new game. Your progress will be lost.',
                      yes: 'Yes, change', onYes: () => applySize(size) });
      } else {
        applySize(size);
      }
    }

    function toggleSymbols() {
      settings.sudokuSymbols = settings.sudokuSymbols === 'shapes' ? 'numbers' : 'shapes';
      Store.set('ht_sudoku_symbols', settings.sudokuSymbols);
      syncSymbolButton();
      render(); renderPalette();
    }

    function syncSymbolButton() {
      const btn = $('#sudoku-symbol-toggle');
      const shapes = settings.sudokuSymbols === 'shapes';
      // Action button: label what tapping switches TO (the opposite of what's shown).
      btn.innerHTML = shapes ? '<span aria-hidden="true">🔢</span> Numbers'
                             : '<span aria-hidden="true">🔷</span> Shapes';
      btn.setAttribute('aria-label', shapes ? 'Switch to numbers' : 'Switch to shapes');
      btn.removeAttribute('aria-pressed');
    }

    function init() {
      $('#size-4').addEventListener('click', () => requestSize(4));
      $('#size-6').addEventListener('click', () => requestSize(6));
      $('#size-9').addEventListener('click', () => requestSize(9));
      $('#sudoku-symbol-toggle').addEventListener('click', toggleSymbols);
      $('#sudoku-undo').addEventListener('click', undo);
      $('#sudoku-new').addEventListener('click', requestNew);
      syncSymbolButton();
      applySize(settings.sudokuSize);   // builds the first puzzle (no prompt)
    }

    return { init };
  })();

  /* ========================== 8. Sliding Puzzle ========================== */
  const Puzzle = (function () {
    const boardEl  = $('#puzzle-board');
    const statusEl = $('#puzzle-status');
    const movesEl  = $('#puzzle-moves');
    const N = 3;
    const BLANK = N * N - 1;     // value 8 represents the blank
    const GAP = 6;              // px, matches the visual frame

    let board = [];             // board[positionIndex] = tile value (0..8)
    let moves = 0;
    let started = false;        // becomes true after first shuffle

    // Pure board logic lives in HappyCore (see games-core.js).
    function blankPos() { return board.indexOf(BLANK); }
    function neighbors(pos) { return HappyCore.puzzleNeighbors(pos, N); }
    function swap(a, b) { const t = board[a]; board[a] = board[b]; board[b] = t; }
    function isSolved() { return HappyCore.puzzleIsSolved(board); }

    function setMoves(m) { moves = m; movesEl.textContent = 'Moves: ' + m; }

    function shuffle() {
      board = HappyCore.puzzleShuffle(N, 120);   // always solvable, never pre-solved
      started = true;
      setMoves(0);
      render();
      setStatus('Slide the tiles to fix the picture!');
    }

    // Progress worth protecting: the player has moved tiles and hasn't won yet.
    function inProgress() { return started && moves > 0 && !isSolved(); }

    // "New" button — confirm only if there's progress to lose.
    function requestNew() {
      if (inProgress()) {
        Confirm.ask({ title: 'Start a new puzzle?', sub: 'Your current puzzle will be lost.',
                      yes: 'Yes, new puzzle', onYes: shuffle });
      } else {
        shuffle();
      }
    }

    function tryMove(pos) {
      if (!started) return;
      const bp = blankPos();
      if (!neighbors(pos).includes(bp)) { Audio.play('error'); return; }
      swap(pos, bp);
      setMoves(moves + 1);
      Audio.play('slide');
      render();
      if (isSolved()) {
        setStatus('You fixed the picture! 🎉');
        Win.show('You did it!', `Solved in ${moves} moves! 🌟`, shuffle);
      }
    }

    // Arrow keys: move the tile on the given side of the blank into the blank.
    function onKey(e) {
      const map = { ArrowUp: N, ArrowDown: -N, ArrowLeft: 1, ArrowRight: -1 };
      if (!(e.key in map)) return;
      const bp = blankPos();
      const r = Math.floor(bp / N), c = bp % N;
      let target = bp + map[e.key];
      // keep horizontal moves on the same row
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && Math.floor(target / N) !== r) return;
      if (target < 0 || target >= N * N) return;
      e.preventDefault();
      tryMove(target);
    }

    function tilePos(posIndex) {
      const r = Math.floor(posIndex / N), c = posIndex % N;
      const span = `((100% - ${(N + 1) * GAP}px) / ${N})`;
      return {
        left: `calc(${GAP}px + ${c} * (${span} + ${GAP}px))`,
        top:  `calc(${GAP}px + ${r} * (${span} + ${GAP}px))`,
        size: `calc(${span})`
      };
    }

    function render() {
      boardEl.style.setProperty('--n', N);
      boardEl.classList.toggle('hide-numbers', !settings.puzzleNumbers);
      boardEl.innerHTML = '';
      board.forEach((value, pos) => {
        const tile = document.createElement('button');
        tile.type = 'button';
        const p = tilePos(pos);
        tile.style.left = p.left; tile.style.top = p.top;
        tile.style.width = p.size; tile.style.height = p.size;
        if (value === BLANK) {
          tile.className = 'p-tile is-blank';
          tile.setAttribute('aria-hidden', 'true');
          tile.tabIndex = -1;
        } else {
          tile.className = 'p-tile';
          // show the image fragment that belongs at solved position `value`
          const sc = value % N, sr = Math.floor(value / N);
          tile.style.backgroundImage = pictureURL(settings.puzzlePic);
          tile.style.backgroundSize = `${N * 100}% ${N * 100}%`;
          tile.style.backgroundPosition = `${(sc / (N - 1)) * 100}% ${(sr / (N - 1)) * 100}%`;
          tile.innerHTML = `<span class="p-num" aria-hidden="true">${value + 1}</span>`;
          tile.setAttribute('aria-label', `Tile ${value + 1}`);
          tile.addEventListener('click', () => tryMove(pos));
        }
        boardEl.appendChild(tile);
      });
    }

    function setStatus(msg) { statusEl.textContent = msg; }

    function nextPicture() {
      settings.puzzlePic = (settings.puzzlePic + 1) % PICTURES.length;
      Store.set('ht_puzzle_pic', String(settings.puzzlePic));
      Audio.play('tap');
      render();
      setStatus('Picture: ' + PICTURES[settings.puzzlePic].name);
    }

    function toggleNumbers() {
      settings.puzzleNumbers = !settings.puzzleNumbers;
      Store.set('ht_puzzle_numbers', String(settings.puzzleNumbers));
      $('#puzzle-numbers').setAttribute('aria-pressed', String(settings.puzzleNumbers));
      render();
    }

    function init() {
      board = HappyCore.puzzleSolved(N);
      $('#puzzle-pic').addEventListener('click', nextPicture);
      $('#puzzle-numbers').addEventListener('click', toggleNumbers);
      $('#puzzle-shuffle').addEventListener('click', requestNew);
      $('#puzzle-numbers').setAttribute('aria-pressed', String(settings.puzzleNumbers));
      boardEl.addEventListener('keydown', onKey);
      boardEl.tabIndex = 0;
      render();
      shuffle();   // start ready-to-play
    }

    return { init };
  })();

  /* ========================== 9. Boot ========================== */
  function boot() {
    // global controls
    syncSoundButton();
    $('#sound-toggle').addEventListener('click', () => {
      settings.muted = !settings.muted;
      Store.set('ht_muted', String(settings.muted));
      syncSoundButton();
      if (!settings.muted) Audio.play('tap');
    });
    $('#brand-home').addEventListener('click', () => Nav.go('home'));
    $$('[data-go]').forEach((btn) => btn.addEventListener('click', () => Nav.go(btn.dataset.go)));

    Nav.route();

    // Service worker: enable offline caching on a real host, but DISABLE it during
    // local development so code edits always show up on a normal reload (the cache-first
    // SW would otherwise keep serving stale files). On localhost we proactively
    // unregister any existing SW and wipe its caches.
    if ('serviceWorker' in navigator) {
      const host = location.hostname;
      const isLocalDev = location.protocol === 'file:' ||
        host === 'localhost' || host === '127.0.0.1' || host === '' || host === '[::1]';
      if (isLocalDev) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister());
        }).catch(() => {});
        if (window.caches && caches.keys) {
          caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
        }
      } else {
        window.addEventListener('load', () => {
          navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support optional */ });
        });
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
