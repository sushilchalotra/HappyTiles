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
    puzzlePic:       parseInt(Store.get('ht_puzzle_pic', '0'), 10),
    puzzleNumbers:   Store.get('ht_puzzle_numbers', 'true') === 'true'
  };

  /* ===================== 1b. Scores & level progression ===================== */
  // Persistent, local-only progression. For each game we store the furthest
  // UNLOCKED level (0-based index) and a map of best-stars per level. Total stars
  // (sum of bests) is the headline score shown on the home screen.
  const Scores = (function () {
    const KEYS = {
      sudoku: { level: 'ht_sudoku_level', stars: 'ht_sudoku_stars' },
      puzzle: { level: 'ht_puzzle_level', stars: 'ht_puzzle_stars' }
    };
    function loadMap(key) {
      try { const v = JSON.parse(Store.get(key, '{}')); return (v && typeof v === 'object') ? v : {}; }
      catch (e) { return {}; }
    }
    const state = {
      sudoku: { level: parseInt(Store.get(KEYS.sudoku.level, '0'), 10) || 0, stars: loadMap(KEYS.sudoku.stars) },
      puzzle: { level: parseInt(Store.get(KEYS.puzzle.level, '0'), 10) || 0, stars: loadMap(KEYS.puzzle.stars) }
    };

    function ladder(game) { return game === 'sudoku' ? HappyCore.SUDOKU_LEVELS : HappyCore.PUZZLE_LEVELS; }
    function unlocked(game) { return state[game].level; }              // furthest unlocked index
    function bestStars(game, idx) { return state[game].stars[idx] || 0; }

    // Record a finished level. Returns { unlockedNew, improved }.
    function record(game, idx, stars) {
      const s = state[game];
      let improved = false;
      if (stars > (s.stars[idx] || 0)) {
        s.stars[idx] = stars;
        Store.set(KEYS[game].stars, JSON.stringify(s.stars));
        improved = true;
      }
      let unlockedNew = false;
      if (idx === s.level && idx + 1 < ladder(game).length) {
        s.level = idx + 1;
        Store.set(KEYS[game].level, String(s.level));
        unlockedNew = true;
      }
      return { unlockedNew, improved };
    }

    function gameStars(game) {
      const map = state[game].stars;
      return Object.keys(map).reduce((t, k) => t + map[k], 0);
    }
    function totalStars() { return gameStars('sudoku') + gameStars('puzzle'); }
    function maxStars(game) { return ladder(game).length * 3; }

    return { ladder, unlocked, bestStars, record, gameStars, totalStars, maxStars };
  })();

  // Star row markup shared by the win card, level chips and home cards.
  function starsMarkup(filled, total) {
    total = total || 3;
    let html = '';
    for (let i = 1; i <= total; i++) {
      html += '<span class="star' + (i <= filled ? ' is-on' : '') + '">★</span>';
    }
    return html;
  }

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
    const nextBtn = $('#win-next');
    const againBtn = $('#win-again');
    let onAgain = null, onNext = null;

    // opts: { title, sub, stars (0..3), speedy, next:{cb}|null, again:{cb} }
    function show(opts) {
      onAgain = (opts.again && opts.again.cb) || null;
      onNext  = (opts.next && opts.next.cb) || null;
      $('#win-title').textContent = opts.title || 'You did it!';
      $('#win-sub').textContent = opts.sub || '';
      $('#win-stars').innerHTML = starsMarkup(opts.stars || 0, 3);
      $('#win-badge').hidden = !opts.speedy;
      nextBtn.hidden = !onNext;
      overlay.hidden = false;
      Audio.play('win');
      Confetti.start();
      (onNext ? nextBtn : againBtn).focus();
    }
    function hide() {
      overlay.hidden = true;
      Confetti.stop();
    }
    nextBtn.addEventListener('click', () => { const f = onNext; hide(); if (f) f(); });
    againBtn.addEventListener('click', () => { const f = onAgain; hide(); if (f) f(); });
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

  /* ===================== 4c. Level picker ===================== */
  // A kid-friendly "choose a level" grid. Unlocked levels show their best stars;
  // locked levels show 🔒. Used by both games.
  const LevelPicker = (function () {
    const overlay = $('#level-overlay');
    const gridEl = $('#level-grid');
    let onPick = null;

    function open(game, currentIdx, pickCb) {
      onPick = pickCb;
      $('#level-title').textContent = game === 'sudoku' ? 'Sudoku Levels' : 'Puzzle Levels';
      const ladder = Scores.ladder(game);
      const unlocked = Scores.unlocked(game);
      gridEl.innerHTML = '';
      for (let idx = 0; idx < ladder.length; idx++) {
        const locked = idx > unlocked;
        const best = Scores.bestStars(game, idx);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'level-chip' + (idx === currentIdx ? ' is-current' : '') + (locked ? ' is-locked' : '');
        b.disabled = locked;
        b.innerHTML =
          '<span class="level-chip-n">' + (locked ? '🔒' : (idx + 1)) + '</span>' +
          '<span class="level-chip-stars" aria-hidden="true">' + starsMarkup(best, 3) + '</span>';
        b.setAttribute('aria-label', locked
          ? ('Level ' + (idx + 1) + ', locked')
          : ('Level ' + (idx + 1) + ', best ' + best + ' of 3 stars'));
        if (!locked) {
          const pickIdx = idx;
          b.addEventListener('click', () => { close(); if (onPick) onPick(pickIdx); });
        }
        gridEl.appendChild(b);
      }
      overlay.hidden = false;
      $('#level-close').focus();
    }
    function close() { overlay.hidden = true; onPick = null; }

    $('#level-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (!overlay.hidden && e.key === 'Escape') close(); });

    return { open };
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
  // Home dashboard: headline star total + per-game progress. Every mastered math
  // fact counts as a star too, so the headline reflects all three games.
  function renderHome() {
    $('#total-stars').textContent = String(Scores.totalStars() + MathGame.homeStars() + Chess.homeStars());
    function fill(game, elId) {
      const lvl = Scores.unlocked(game) + 1;     // human-facing furthest level
      $(elId).innerHTML = 'Level ' + lvl + ' · ' + Scores.gameStars(game) + '/' + Scores.maxStars(game) +
                          ' <span class="star is-on">★</span>';
    }
    fill('sudoku', '#sudoku-progress');
    fill('puzzle', '#puzzle-progress');
    $('#math-progress').innerHTML = '🧠 ' + MathGame.masteredText() + ' facts <span class="star is-on">★</span>';
    $('#chess-progress').innerHTML = '♟️ ' + Chess.doneText() + ' lessons <span class="star is-on">★</span>';
  }

  const Nav = (function () {
    const views = { home: $('#view-home'), sudoku: $('#view-sudoku'), puzzle: $('#view-puzzle'), math: $('#view-math'), chess: $('#view-chess') };
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
      if (name === 'home') renderHome();
      if (name === 'sudoku' && !started.sudoku) { Sudoku.init(); started.sudoku = true; }
      if (name === 'puzzle' && !started.puzzle) { Puzzle.init(); started.puzzle = true; }
      if (name === 'math') MathGame.enter();   // fresh start screen on every visit
      if (name === 'chess') Chess.enter();
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
    let level = 0;          // current level index (into HappyCore.SUDOKU_LEVELS)
    let mistakes = 0;       // duplicate-causing placements this puzzle (drives stars)
    let startTime = 0;      // ms timestamp of puzzle start (silent speed bonus)

    // Pure generation/validation lives in HappyCore (see games-core.js).
    function buildPuzzle() {
      const cfg = HappyCore.SUDOKU_LEVELS[level];
      const p = HappyCore.sudokuNewPuzzle(cfg.size, undefined, cfg.holes);
      n = p.n; boxRows = p.boxRows; boxCols = p.boxCols;
      grid = p.grid; given = p.given;
      selected = -1; armed = null; undoStack = [];
      mistakes = 0; startTime = Date.now();
      render();
      renderPalette();
      syncLevel();
      setStatus('Tap a square, then pick a symbol.');
    }

    function syncLevel() {
      $('#sudoku-level-label').textContent = 'Level ' + (level + 1);
    }

    function startLevel(idx) { level = idx; buildPuzzle(); }

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
        finishWin();
      } else if (bad.size) {
        mistakes++;     // counts toward the star rating (3 stars = zero mistakes)
        setStatus('Oops — two of the same in a line or box. Try again!');
      } else {
        setStatus('Nice! Keep going.');
      }
    }

    function finishWin() {
      const cfg = HappyCore.SUDOKU_LEVELS[level];
      const stars = HappyCore.sudokuStars(mistakes);
      const seconds = (Date.now() - startTime) / 1000;
      const speedy = seconds <= cfg.holes * 6;            // silent, generous speed bonus
      const res = Scores.record('sudoku', level, stars);
      const hasNext = level + 1 < HappyCore.SUDOKU_LEVELS.length && level + 1 <= Scores.unlocked('sudoku');
      setStatus('You solved it! 🎉');
      Win.show({
        title: 'You did it!',
        sub: res.unlockedNew
          ? 'Level ' + (level + 1) + ' done — Level ' + (level + 2) + ' unlocked! 🔓'
          : cfg.size + '×' + cfg.size + ' solved! 🌟',
        stars: stars,
        speedy: speedy,
        next: hasNext ? { cb: () => startLevel(level + 1) } : null,
        again: { cb: buildPuzzle }
      });
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

    // Level button — open the picker; confirm if switching would discard progress.
    function openLevels() {
      LevelPicker.open('sudoku', level, (idx) => {
        if (idx === level) return;
        if (inProgress()) {
          Confirm.ask({ title: 'Change level?', sub: 'This starts a new game. Your progress will be lost.',
                        yes: 'Yes, change', onYes: () => startLevel(idx) });
        } else {
          startLevel(idx);
        }
      });
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
      level = Scores.unlocked('sudoku');   // resume at the furthest unlocked level
      $('#sudoku-level').addEventListener('click', openLevels);
      $('#sudoku-symbol-toggle').addEventListener('click', toggleSymbols);
      $('#sudoku-undo').addEventListener('click', undo);
      $('#sudoku-new').addEventListener('click', requestNew);
      syncSymbolButton();
      buildPuzzle();   // builds the first puzzle at the current level (no prompt)
    }

    return { init };
  })();

  /* ========================== 8. Sliding Puzzle ========================== */
  const Puzzle = (function () {
    const boardEl  = $('#puzzle-board');
    const statusEl = $('#puzzle-status');
    const movesEl  = $('#puzzle-moves');
    let N = 3;                  // board width — set per level
    let BLANK = N * N - 1;      // highest value represents the blank
    const GAP = 6;              // px, matches the visual frame

    let board = [];             // board[positionIndex] = tile value
    let moves = 0;
    let started = false;        // becomes true after first shuffle
    let level = 0;              // current level index (into HappyCore.PUZZLE_LEVELS)
    let par = 30;              // move target for 3 stars (from the level config)
    let startTime = 0;          // ms timestamp of shuffle (silent speed bonus)

    // Pure board logic lives in HappyCore (see games-core.js).
    function blankPos() { return board.indexOf(BLANK); }
    function neighbors(pos) { return HappyCore.puzzleNeighbors(pos, N); }
    function swap(a, b) { const t = board[a]; board[a] = board[b]; board[b] = t; }
    function isSolved() { return HappyCore.puzzleIsSolved(board); }

    function setMoves(m) { moves = m; movesEl.textContent = 'Moves: ' + m; }

    function shuffle() {
      const cfg = HappyCore.PUZZLE_LEVELS[level];
      board = HappyCore.puzzleShuffle(N, cfg.steps);   // always solvable, never pre-solved
      started = true;
      startTime = Date.now();
      setMoves(0);
      render();
      setStatus('Slide the tiles to fix the picture!');
    }

    function syncLevel() { $('#puzzle-level-label').textContent = 'Level ' + (level + 1); }

    // Switch to a level: resize the board, then shuffle a fresh one.
    function startLevel(idx) {
      level = idx;
      const cfg = HappyCore.PUZZLE_LEVELS[level];
      N = cfg.size; BLANK = N * N - 1; par = cfg.par;
      syncLevel();
      shuffle();
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

    // Level button — open the picker; confirm if switching would discard progress.
    function openLevels() {
      LevelPicker.open('puzzle', level, (idx) => {
        if (idx === level) return;
        if (inProgress()) {
          Confirm.ask({ title: 'Change level?', sub: 'This starts a new game. Your progress will be lost.',
                        yes: 'Yes, change', onYes: () => startLevel(idx) });
        } else {
          startLevel(idx);
        }
      });
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
        const stars = HappyCore.puzzleStars(moves, par);
        const seconds = (Date.now() - startTime) / 1000;
        const speedy = seconds <= par * 1.2;             // silent, generous speed bonus
        const res = Scores.record('puzzle', level, stars);
        const hasNext = level + 1 < HappyCore.PUZZLE_LEVELS.length && level + 1 <= Scores.unlocked('puzzle');
        setStatus('You fixed the picture! 🎉');
        Win.show({
          title: 'You did it!',
          sub: res.unlockedNew
            ? 'Level ' + (level + 1) + ' done — Level ' + (level + 2) + ' unlocked! 🔓'
            : 'Solved in ' + moves + ' moves! 🌟',
          stars: stars,
          speedy: speedy,
          next: hasNext ? { cb: () => startLevel(level + 1) } : null,
          again: { cb: shuffle }
        });
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
      level = Scores.unlocked('puzzle');   // resume at the furthest unlocked level
      N = HappyCore.PUZZLE_LEVELS[level].size; BLANK = N * N - 1;
      board = HappyCore.puzzleSolved(N);
      $('#puzzle-level').addEventListener('click', openLevels);
      $('#puzzle-pic').addEventListener('click', nextPicture);
      $('#puzzle-numbers').addEventListener('click', toggleNumbers);
      $('#puzzle-shuffle').addEventListener('click', requestNew);
      $('#puzzle-numbers').setAttribute('aria-pressed', String(settings.puzzleNumbers));
      boardEl.addEventListener('keydown', onKey);
      boardEl.tabIndex = 0;
      startLevel(level);   // sizes the board and starts ready-to-play
    }

    return { init };
  })();

  /* ========================== 8c. Math Quest ========================== */
  // Adaptive times-tables / division fluency game. All pedagogy lives in the pure
  // MathCore engine (math-core.js); this controller is just DOM + input + flow,
  // reusing Audio, Confetti, Win and Store like the other games.
  const MathGame = (function () {
    const M = window.MathCore;
    const stageEl  = $('#math-stage');
    const statusEl = $('#math-status');
    const KEYS = { facts: 'ht_math_facts', profile: 'ht_math_profile', streak: 'ht_math_streak' };
    const SESSION_LEN = 10;

    let facts = [];
    let profile = { placed: false, allowDivision: false, bosses: {}, bestSpeedMs: 0 };
    let streak = { days: 0, last: '' };

    let session = null;                 // active placement/play session
    let curFact = null, curQ = null;    // current fact record + built question
    let qStart = 0, answered = false, entry = '', lastId = null, wired = false;

    function now() { return Date.now(); }
    function setStatus(m) { statusEl.textContent = m; }
    function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

    /* ---- persistence (local-only, like the rest of HappyTiles) ---- */
    function load() {
      try {
        const raw = Store.get(KEYS.facts, '');
        facts = raw ? JSON.parse(raw) : M.createInitialState();
        if (!facts || !facts.length) facts = M.createInitialState();
      } catch (e) { facts = M.createInitialState(); }
      try {
        const p = JSON.parse(Store.get(KEYS.profile, '{}'));
        if (p && typeof p === 'object') {
          profile = {
            placed: !!p.placed, allowDivision: !!p.allowDivision,
            bosses: (p.bosses && typeof p.bosses === 'object') ? p.bosses : {},
            bestSpeedMs: p.bestSpeedMs || 0
          };
        }
      } catch (e) { /* keep defaults */ }
      try {
        const s = JSON.parse(Store.get(KEYS.streak, '{}'));
        if (s && typeof s === 'object') streak = { days: s.days || 0, last: s.last || '' };
      } catch (e) { /* keep defaults */ }
    }
    function saveFacts()   { Store.set(KEYS.facts, JSON.stringify(facts)); }
    function saveProfile() { Store.set(KEYS.profile, JSON.stringify(profile)); }
    function saveStreak()  { Store.set(KEYS.streak, JSON.stringify(streak)); }

    /* ---- home-dashboard hooks (called by renderHome) ---- */
    function homeStars() { return M.summary(facts, now()).fluent; }
    function masteredText() { const s = M.summary(facts, now()); return s.fluent + '/' + s.total; }

    /* ---- toolbar ---- */
    function syncProgress() { $('#math-mastered').textContent = masteredText(); }
    function syncOps() {
      const btn = $('#math-ops');
      btn.setAttribute('aria-pressed', String(profile.allowDivision));
      btn.innerHTML = '<span aria-hidden="true">➗</span> ' + (profile.allowDivision ? 'Division: on' : 'Division: off');
    }
    function toggleOps() { profile.allowDivision = !profile.allowDivision; saveProfile(); syncOps(); Audio.play('tap'); }

    /* ---- start / menu ---- */
    function renderStart() {
      syncProgress();
      const s = M.summary(facts, now());
      if (!profile.placed) {
        stageEl.innerHTML =
          '<div class="math-panel">' +
            '<div class="math-big-emoji" aria-hidden="true">🧠✨</div>' +
            '<h2 class="math-h">Let’s find your level!</h2>' +
            '<p class="math-p">Answer a few questions so the game knows what to practice. ' +
              'No worries if some are tricky — just give your best guess!</p>' +
            '<button class="pill-btn pill-primary math-go" id="math-start-place" type="button">Start ▶️</button>' +
          '</div>';
        $('#math-start-place').addEventListener('click', startPlacement);
        setStatus('Tip: tap the answer you think is right.');
        return;
      }
      const canSpeed = s.fluent >= 4;
      let readyBoss = null;
      const ws = M.worlds(facts);
      for (let i = 0; i < ws.length; i++) { if (ws[i].bossReady && !profile.bosses[ws[i].factor]) { readyBoss = ws[i]; break; } }
      const bestChip = profile.bestSpeedMs ? '<span class="math-chip">⚡ best ' + (profile.bestSpeedMs / 1000).toFixed(1) + 's</span>' : '';
      stageEl.innerHTML =
        '<div class="math-panel">' +
          '<div class="math-big-emoji" aria-hidden="true">🚀</div>' +
          '<h2 class="math-h">Ready to play?</h2>' +
          '<div class="math-stats">' +
            '<span class="math-chip">⭐ ' + s.fluent + ' mastered</span>' +
            '<span class="math-chip">🔥 ' + streak.days + ' day streak</span>' + bestChip +
          '</div>' +
          '<div class="math-actions">' +
            '<button class="pill-btn pill-primary math-go" id="math-play" type="button">Quick Play ▶️</button>' +
            (canSpeed ? '<button class="pill-btn math-go" id="math-speed" type="button">⚡ Speed Round</button>' : '') +
            (readyBoss ? '<button class="pill-btn math-go math-boss-btn" id="math-boss" type="button">👾 Boss: ' + readyBoss.label + '</button>' : '') +
            '<button class="pill-btn math-go" id="math-map" type="button">🗺️ World Map</button>' +
          '</div>' +
          '<button class="math-parent-link" id="math-parent" type="button">📊 For grown-ups</button>' +
        '</div>';
      $('#math-play').addEventListener('click', function () { startSession('mixed'); });
      if (canSpeed) $('#math-speed').addEventListener('click', function () { startSession('speed'); });
      if (readyBoss) $('#math-boss').addEventListener('click', function () { startBoss(readyBoss.factor); });
      $('#math-map').addEventListener('click', renderMap);
      $('#math-parent').addEventListener('click', renderDashboard);
      setStatus(readyBoss ? ('A Boss is ready in the ' + readyBoss.label + ' world! 👾')
                          : (s.due > 0 ? (s.due + ' facts are ready to review!') : 'Let’s learn something new! 🌟'));
    }

    /* ---- world map (meta-progression) ---- */
    const WORLD_EMOJI = { 2: '🐣', 3: '🌱', 4: '🐠', 5: '⭐', 6: '🦋', 7: '🌈', 8: '🚀', 9: '🪐', 10: '🌟' };
    function renderMap() {
      const ws = M.worlds(facts);
      let tiles = '';
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i];
        const pct = w.total ? Math.round((w.mastered / w.total) * 100) : 0;
        const beaten = !!profile.bosses[w.factor];
        const state = w.complete ? 'complete' : (w.started ? 'started' : 'locked');
        const face = w.complete ? '🏆' : (w.started ? WORLD_EMOJI[w.factor] : '🔒');
        tiles +=
          '<div class="world-tile world-' + state + '">' +
            '<div class="world-emoji" aria-hidden="true">' + face + '</div>' +
            '<div class="world-label">' + w.label + '</div>' +
            '<div class="world-bar"><span style="width:' + pct + '%"></span></div>' +
            '<div class="world-count">' + w.mastered + '/' + w.total + (beaten && !w.complete ? ' ✔' : '') + '</div>' +
            (w.bossReady && !beaten ? '<button class="world-boss" type="button" data-f="' + w.factor + '">👾 Boss</button>' : '') +
          '</div>';
      }
      stageEl.innerHTML =
        '<div class="math-panel math-map-panel">' +
          '<h2 class="math-h">🗺️ Your Worlds</h2>' +
          '<p class="math-p">Master a table to grow your map. Beat its Boss to earn a 🏆!</p>' +
          '<div class="world-grid">' + tiles + '</div>' +
          '<button class="pill-btn math-go" id="math-map-back" type="button">⬅️ Back</button>' +
        '</div>';
      $('#math-map-back').addEventListener('click', renderStart);
      $$('#math-stage .world-boss').forEach(function (b) {
        b.addEventListener('click', function () { startBoss(parseInt(b.dataset.f, 10)); });
      });
      setStatus('');
    }

    function startBoss(factor) {
      Audio.play('tap');
      const ids = M.worldFacts(facts, factor).map(function (f) { return f.id; });
      session = { type: 'boss', factor: factor, mode: 'mixed', ids: ids, idx: 0, correct: 0, times: [],
                  rng: M.makeRng((now() & 0xffffff) || 1), newFact: null, newReps: 0, len: Math.max(8, ids.length * 2) };
      lastId = null;
      nextStep();
    }

    /* ---- parent dashboard (offline, read-only insights) ---- */
    const STAGE_CLASS = ['st-new', 'st-learn', 'st-review', 'st-fluent'];
    const STAGE_NAME = ['Not started', 'Learning', 'Reviewing', 'Mastered'];

    function buildHeatmap() {
      const F = M.FACTORS;
      let h = '<div class="heat" style="grid-template-columns:repeat(' + (F.length + 1) + ',1fr)">';
      h += '<div class="heat-corner" aria-hidden="true">×</div>';
      for (let c = 0; c < F.length; c++) { h += '<div class="heat-head">' + F[c] + '</div>'; }
      for (let r = 0; r < F.length; r++) {
        h += '<div class="heat-head">' + F[r] + '</div>';
        for (let c = 0; c < F.length; c++) {
          const f = M.findFact(facts, M.factId(F[r], F[c]));
          h += '<div class="heat-cell ' + STAGE_CLASS[f.stage] + '" title="' + F[r] + '×' + F[c] + '=' + f.p +
               ' (' + STAGE_NAME[f.stage] + ')">' + f.p + '</div>';
        }
      }
      return h + '</div>';
    }

    function factList(list, fmt) {
      if (!list.length) { return '<li class="dash-empty">— none yet —</li>'; }
      let h = '';
      for (let i = 0; i < list.length; i++) {
        const f = list[i];
        h += '<li><span class="dash-fact">' + f.a + '×' + f.b + '</span>' + fmt(f) + '</li>';
      }
      return h;
    }

    function renderDashboard() {
      Audio.play('tap');
      const s = M.summary(facts, now());
      const ins = M.insights(facts, 5);
      const best = profile.bestSpeedMs ? (profile.bestSpeedMs / 1000).toFixed(1) + 's' : '—';
      stageEl.innerHTML =
        '<div class="math-panel dash-panel">' +
          '<h2 class="math-h">📊 Progress</h2>' +
          '<div class="dash-stats">' +
            '<div class="dash-stat"><b>' + s.fluent + '</b><span>mastered</span></div>' +
            '<div class="dash-stat"><b>' + (s.learning + s.reviewing) + '</b><span>in progress</span></div>' +
            '<div class="dash-stat"><b>' + s.newCount + '</b><span>to learn</span></div>' +
            '<div class="dash-stat"><b>' + streak.days + '</b><span>day streak</span></div>' +
            '<div class="dash-stat"><b>' + best + '</b><span>best speed</span></div>' +
          '</div>' +
          buildHeatmap() +
          '<div class="dash-legend">' +
            '<span><i class="sw st-new"></i>Not started</span>' +
            '<span><i class="sw st-learn"></i>Learning</span>' +
            '<span><i class="sw st-review"></i>Reviewing</span>' +
            '<span><i class="sw st-fluent"></i>Mastered</span>' +
          '</div>' +
          '<div class="dash-lists">' +
            '<div class="dash-col"><h3>⚡ Speed up</h3><ul>' +
              factList(ins.slowest, function (f) { return '<span class="dash-val">' + (f.avgMs / 1000).toFixed(1) + 's</span>'; }) +
            '</ul></div>' +
            '<div class="dash-col"><h3>🎯 Needs practice</h3><ul>' +
              factList(ins.focus, function (f) { return '<span class="dash-val">' + STAGE_NAME[f.stage] + '</span>'; }) +
            '</ul></div>' +
          '</div>' +
          '<div class="dash-actions">' +
            '<button class="pill-btn math-go" id="dash-back" type="button">⬅️ Back</button>' +
            '<button class="pill-btn dash-reset" id="dash-reset" type="button">♻️ Reset progress</button>' +
          '</div>' +
        '</div>';
      $('#dash-back').addEventListener('click', renderStart);
      $('#dash-reset').addEventListener('click', function () {
        Confirm.ask({
          title: 'Reset all math progress?',
          sub: 'This erases mastery, streak and worlds for Math Quest. It cannot be undone.',
          yes: 'Yes, reset', onYes: resetProgress
        });
      });
      setStatus('Tip: hover a square to see the fact.');
    }

    function resetProgress() {
      Store.set(KEYS.facts, JSON.stringify(M.createInitialState()));
      Store.set(KEYS.profile, JSON.stringify({ placed: false, allowDivision: profile.allowDivision, bosses: {}, bestSpeedMs: 0 }));
      Store.set(KEYS.streak, JSON.stringify({ days: 0, last: '' }));
      load();
      syncProgress(); syncOps();
      renderStart();
      setStatus('Progress reset — placement will run next time.');
    }

    /* ---- placement ---- */
    function startPlacement() {
      Audio.play('tap');
      const rng = M.makeRng((now() & 0xffffff) || 1);
      session = { type: 'placement', probes: M.placementProbes(rng), idx: 0, results: [], rng: rng };
      nextPlacement();
    }
    function nextPlacement() {
      const p = session.probes[session.idx];
      if (!p) { finishPlacement(); return; }
      curFact = { id: p.id, a: p.a, b: p.b, p: p.a * p.b, stage: M.STAGE.NEW };
      curQ = M.makeQuestion(curFact, { rng: session.rng, allowDivision: false, forceInput: 'choice' });
      answered = false;
      renderQuestion(curQ, session.idx + 1, session.probes.length, 'Quick check');
    }
    function finishPlacement() {
      M.applyPlacement(facts, session.results, now());
      profile.placed = true; saveFacts(); saveProfile();
      session = null;
      const s = M.summary(facts, now());
      syncProgress();
      stageEl.innerHTML =
        '<div class="math-panel">' +
          '<div class="math-big-emoji" aria-hidden="true">🎯</div>' +
          '<h2 class="math-h">All set!</h2>' +
          '<p class="math-p">You already know <strong>' + s.fluent + '</strong> facts. ' +
            'We’ll keep those speedy and learn new ones together!</p>' +
          '<button class="pill-btn pill-primary math-go" id="math-begin" type="button">Let’s play! ▶️</button>' +
        '</div>';
      $('#math-begin').addEventListener('click', function () { startSession('mixed'); });
      setStatus('');
    }

    /* ---- a play session ---- */
    function startSession(mode) {
      Audio.play('tap');
      session = { type: 'play', mode: mode, idx: 0, correct: 0, times: [],
                  rng: M.makeRng((now() & 0xffffff) || 1), newFact: null, newReps: 0 };
      lastId = null;
      if (mode === 'mixed') {
        const nf = M.pickNewFact(facts);     // introduce one new fact with a strategy card
        if (nf) { session.newFact = nf; renderStrategy(nf); return; }
      }
      nextStep();
    }

    function renderStrategy(fact) {
      const s = M.strategyFor(fact.a, fact.b);
      // The whole fact family — so × and ÷ are learned as one idea. Deduped so a
      // square (e.g. 8×8) shows its two real statements, not four near-identical ones.
      let fam = '';
      if (profile.allowDivision) {
        const parts = [
          fact.a + '×' + fact.b + '=' + fact.p,
          fact.b + '×' + fact.a + '=' + fact.p,
          fact.p + '÷' + fact.a + '=' + fact.b,
          fact.p + '÷' + fact.b + '=' + fact.a
        ];
        const uniq = parts.filter(function (p, i) { return parts.indexOf(p) === i; });
        fam = '<div class="math-family" aria-hidden="true"><span>' + uniq.join('</span><span>') + '</span></div>';
      }
      stageEl.innerHTML =
        '<div class="math-panel math-strategy">' +
          '<div class="math-new-badge">✨ New skill!</div>' +
          '<div class="math-prompt math-prompt-lg">' + fact.a + ' × ' + fact.b + ' = ' + fact.p + '</div>' +
          '<h3 class="math-strat-title">' + s.title + '</h3>' +
          '<p class="math-p">' + s.tip + '</p>' + fam +
          '<button class="pill-btn pill-primary math-go" id="math-got" type="button">Got it! ▶️</button>' +
        '</div>';
      $('#math-got').addEventListener('click', function () { Audio.play('tap'); nextStep(); });
      setStatus('Learn the trick, then try it!');
    }

    function sessionLen() { return session.len || SESSION_LEN; }
    function nextStep() {
      if (session.idx >= sessionLen()) { finishSession(); return; }
      session.idx++;
      let fact;
      if (session.newFact && session.newReps < 2) {        // drill a freshly taught fact first
        fact = session.newFact; session.newReps++;
      } else {
        fact = M.selectNext(facts, { mode: session.mode, now: now(), rng: session.rng, excludeId: lastId, ids: session.ids });
        if (!fact && session.ids) fact = M.findFact(facts, session.ids[0]);   // boss fallback
        if (!fact) fact = session.newFact || M.findFact(facts, M.teachOrder()[0]);
      }
      curFact = fact;
      const allowDiv = profile.allowDivision && fact.stage >= M.STAGE.REVIEWING;
      curQ = M.makeQuestion(fact, { rng: session.rng, allowDivision: allowDiv });
      answered = false;
      const label = session.type === 'boss' ? '👾 Boss'
                  : (session.mode === 'speed') ? '⚡ Speed'
                  : (fact === session.newFact ? '✨ New' : 'Practice');
      renderQuestion(curQ, session.idx, sessionLen(), label);
    }

    function finishSession() {
      const total = sessionLen(), correct = session.correct;
      const type = session.type, factor = session.factor;
      const stars = M.sessionStars(correct, total);
      const times = session.times.slice().sort(function (a, b) { return a - b; });
      const median = times.length ? times[Math.floor(times.length / 2)] : 99999;
      const speedy = median <= M.FAST_MS && correct >= Math.ceil(total * 0.7);
      bumpStreak();
      saveFacts();

      let extra = '', bossWon = false, newRecord = false;
      if (type === 'boss') {
        bossWon = correct >= Math.ceil(total * 0.83);     // ~10 of 12
        if (bossWon) { profile.bosses[factor] = true; saveProfile(); extra = ' · 🏆 Boss beaten!'; }
      }
      if (type === 'speed' && correct >= Math.ceil(total * 0.7)) {
        if (!profile.bestSpeedMs || median < profile.bestSpeedMs) { profile.bestSpeedMs = median; saveProfile(); newRecord = true; }
      }

      session = null;
      const s = M.summary(facts, now());
      syncProgress();
      setStatus(type === 'boss' ? (bossWon ? 'Boss beaten! 🏆' : 'Good try — challenge again!') : 'Session done! 🎉');
      Win.show({
        title: type === 'boss' ? (bossWon ? 'Boss beaten! 🏆' : 'So close!') : 'Great work!',
        sub: correct + ' out of ' + total + ' right' +
             (newRecord ? ' · ⚡ New speed record!' : '') + extra +
             (type !== 'boss' && !newRecord ? ' · ⭐ ' + s.fluent + ' mastered' : ''),
        stars: stars,
        speedy: speedy || newRecord,
        next: null,
        again: { cb: function () { if (type === 'boss') startBoss(factor); else startSession(type === 'speed' ? 'speed' : 'mixed'); } }
      });
    }

    function bumpStreak() {
      const today = new Date().toDateString();
      if (streak.last === today) return;                   // already counted today
      const y = new Date(Date.now() - 86400000).toDateString();
      streak.days = (streak.last === y) ? (streak.days + 1) : 1;
      streak.last = today;
      saveStreak();
    }

    /* ---- question rendering & input ---- */
    function progressDots(n, total) {
      let h = '<span class="math-dots" aria-label="Question ' + n + ' of ' + total + '">';
      for (let i = 1; i <= total; i++) {
        h += '<span class="math-dot' + (i < n ? ' done' : (i === n ? ' now' : '')) + '"></span>';
      }
      return h + '</span>';
    }
    function padKey(d) { return '<button class="math-key" type="button" data-k="' + d + '">' + d + '</button>'; }

    function renderQuestion(q, stepNum, stepTotal, label) {
      let inputHtml;
      if (q.inputMode === 'choice') {
        inputHtml = '<div class="math-choices" id="math-choices">';
        for (let i = 0; i < q.choices.length; i++) {
          inputHtml += '<button class="math-choice" type="button" data-v="' + q.choices[i] + '">' + q.choices[i] + '</button>';
        }
        inputHtml += '</div>';
      } else {
        inputHtml =
          '<div class="math-entry" id="math-entry">0</div>' +
          '<div class="math-pad" id="math-pad">' +
            padKey('1') + padKey('2') + padKey('3') +
            padKey('4') + padKey('5') + padKey('6') +
            padKey('7') + padKey('8') + padKey('9') +
            '<button class="math-key math-key-fn" type="button" data-k="back" aria-label="Delete">⌫</button>' +
            padKey('0') +
            '<button class="math-key math-key-go" type="button" data-k="enter" aria-label="Check answer">✓</button>' +
          '</div>';
      }
      stageEl.innerHTML =
        '<div class="math-q">' +
          '<div class="math-q-top">' + progressDots(stepNum, stepTotal) +
            '<span class="math-q-label">' + (label || '') + '</span></div>' +
          '<div class="math-prompt" id="math-prompt">' + q.prompt + ' = ?</div>' +
          inputHtml +
          '<div class="math-feedback" id="math-feedback" aria-live="assertive"></div>' +
        '</div>';

      if (q.inputMode === 'choice') {
        $$('#math-choices .math-choice').forEach(function (b) {
          b.addEventListener('click', function () { onAnswer(parseInt(b.dataset.v, 10), b); });
        });
      } else {
        bindPad();
      }
      qStart = now();
    }

    function bindPad() {
      entry = '';
      const display = $('#math-entry');
      $$('#math-pad .math-key').forEach(function (b) {
        b.addEventListener('click', function () {
          const k = b.dataset.k;
          if (k === 'enter') { if (entry.length) onAnswer(parseInt(entry, 10), null); return; }
          if (k === 'back') { entry = entry.slice(0, -1); }
          else if (entry.length < 3) { entry += k; }
          Audio.play('tap');
          display.textContent = entry.length ? entry : '0';
        });
      });
    }

    function onAnswer(value, btn) {
      if (answered) return;
      answered = true;
      const latency = now() - qStart;
      const correct = value === curQ.answer;

      if (session && session.type === 'placement') {
        session.results.push({ a: curFact.a, b: curFact.b, correct: correct, ms: latency });
        showFeedback(correct, btn, false);
        window.setTimeout(function () { session.idx++; nextPlacement(); }, correct ? 550 : 950);
        return;
      }

      const rec = M.findFact(facts, curQ.id);
      const info = M.grade(rec, correct, latency, now());
      saveFacts();
      if (correct) session.correct++;
      session.times.push(latency);
      lastId = curQ.id;
      showFeedback(correct, btn, info.becameFluent);
      syncProgress();
      window.setTimeout(nextStep, correct ? 650 : 1350);
    }

    function showFeedback(correct, btn, becameFluent) {
      const fb = $('#math-feedback');
      if (correct) {
        Audio.play('place');
        if (btn) btn.classList.add('is-correct');
        fb.textContent = becameFluent ? 'Mastered! ⭐' : pick(['Yes! ✅', 'Nice! 🎉', 'Correct! 🌟', 'Great! 👏']);
        fb.className = 'math-feedback is-good';
      } else {
        Audio.play('error');
        if (btn) btn.classList.add('is-wrong');
        fb.textContent = curQ.prompt + ' = ' + curQ.answer;
        fb.className = 'math-feedback is-bad';
        $$('#math-choices .math-choice').forEach(function (b) {
          if (parseInt(b.dataset.v, 10) === curQ.answer) b.classList.add('is-correct');
        });
      }
      $$('#math-choices .math-choice, #math-pad .math-key').forEach(function (b) { b.disabled = true; });
    }

    /* ---- entry point (called by Nav on every visit) ---- */
    function enter() {
      if (!wired) { wired = true; $('#math-ops').addEventListener('click', toggleOps); }
      session = null; answered = false;
      syncOps(); syncProgress(); renderStart();
    }

    load();   // load once at startup so the home dashboard can show progress

    return { enter: enter, homeStars: homeStars, masteredText: masteredText };
  })();

  /* ========================== 8d. Chess Academy ========================== */
  // A structured chess-learning game. All rules/AI live in the pure ChessCore
  // engine (chess-core.js); this controller is DOM + input + lesson flow, reusing
  // Audio, Confetti, Win and Store like the other games.
  const Chess = (function () {
    const C = window.ChessCore;
    const stageEl = $('#chess-stage');
    const statusEl = $('#chess-status');
    const KEYS = { progress: 'ht_chess_progress', stars: 'ht_chess_stars', placed: 'ht_chess_placed' };
    // Glyphs are used only for the lesson-path icons (dark text on white — fine).
    const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };

    // On the BOARD we draw inline-SVG pieces so White vs Black is unmistakable on
    // every device (Unicode chess glyphs render as fixed-color emoji on some fonts).
    const PC_BASE = '<path d="M10 41 L35 41 L32 35 L13 35 Z"/>';
    const PC_PATHS = {
      P: '<circle cx="22.5" cy="13" r="5"/><path d="M16.5 34 C16.5 26 28.5 26 28.5 34 Z"/>' + PC_BASE,
      R: '<path d="M13 12 h19 v5 h-3 v-2 h-3.5 v2 h-5 v-2 h-3.5 v2 h-1 z"/><path d="M15.5 17 h14 l-1.5 17 h-11 z"/>' + PC_BASE,
      B: '<circle cx="22.5" cy="8" r="2.4"/><path d="M22.5 10 C30 16 29 27 22.5 31 C16 27 15 16 22.5 10 Z"/>' + PC_BASE,
      N: '<path d="M14 34 C13 24 17 15 25 12 C23.5 10.5 22.5 9 23 7.5 L27.5 9 C33.5 12 35 21 33 34 Z"/>',
      Q: '<path d="M9 31 L7 15 L15 21 L22.5 11 L30 21 L38 15 L36 31 Z"/><circle cx="7" cy="14" r="2.2"/><circle cx="22.5" cy="10" r="2.2"/><circle cx="38" cy="14" r="2.2"/>' + PC_BASE,
      K: '<path d="M21 5 h3 v3 h3 v3 h-3 v3 h-3 v-3 h-3 v-3 h3 z"/><path d="M13 31 C12.5 21 32.5 21 32 31 Z"/>' + PC_BASE
    };

    // Flatten the curriculum into one ordered list of lessons.
    const LESSONS = [];
    (function () {
      const U = C.CHESS_UNITS;
      for (let u = 0; u < U.length; u++) {
        for (let k = 0; k < U[u].lessons.length; k++) {
          const l = U[u].lessons[k];
          LESSONS.push({ unit: U[u].title, unitEmoji: U[u].emoji, index: LESSONS.length,
            id: l.id, title: l.title, type: l.type, tip: l.tip,
            piece: l.piece, start: l.start, coins: l.coins, fen: l.fen, goalRank: l.goalRank, botLevel: l.botLevel,
            goal: l.goal, solutions: l.solutions });
        }
      }
    })();

    let unlocked = 0, starMap = {}, placed = false, wired = false, view = null;

    function load() {
      unlocked = parseInt(Store.get(KEYS.progress, '0'), 10) || 0;
      placed = Store.get(KEYS.placed, '') === '1';
      try { const m = JSON.parse(Store.get(KEYS.stars, '{}')); starMap = (m && typeof m === 'object') ? m : {}; }
      catch (e) { starMap = {}; }
    }
    function save() { Store.set(KEYS.progress, String(unlocked)); Store.set(KEYS.stars, JSON.stringify(starMap)); }

    function homeStars() { let t = 0; for (const k in starMap) { t += starMap[k]; } return t; }
    function doneText() { let d = 0; for (const k in starMap) { if (starMap[k] > 0) { d++; } } return d + '/' + LESSONS.length; }
    function syncPill() { $('#chess-done').textContent = doneText(); }
    function setStatus(m) { statusEl.textContent = m; }

    function complete(idx, stars) {
      const id = LESSONS[idx].id;
      if (stars > (starMap[id] || 0)) { starMap[id] = stars; }
      if (idx === unlocked && unlocked < LESSONS.length - 1) { unlocked = idx + 1; }
      save(); syncPill();
    }

    /* ---- helpers ---- */
    function contains(arr, x) { for (let i = 0; i < arr.length; i++) { if (arr[i] === x) { return true; } } return false; }
    function destSquares(moves) { const out = [], seen = {}; for (let i = 0; i < moves.length; i++) { const t = moves[i].to; if (!seen[t]) { seen[t] = true; out.push(t); } } return out; }
    function pieceGlyph(p) {
      const t = C.typeOf(p), white = C.colorOf(p) === C.W;
      const fill = white ? '#ffffff' : '#2b2138';
      const stroke = white ? '#2b2138' : '#0c0714';
      let body = PC_PATHS[t];
      if (t === 'N') { body += '<circle cx="27" cy="16" r="1.4" fill="' + stroke + '" stroke="none"/>' + PC_BASE; }
      return '<svg class="cp-svg" viewBox="0 0 45 45" fill="' + fill + '" stroke="' + stroke +
             '" stroke-width="1.7" stroke-linejoin="round">' + body + '</svg>';
    }
    function lessonIcon(L) {
      if (L.type === 'piece' || L.type === 'promote') { return GLYPH[L.piece]; }
      if (L.type === 'puzzle') { return '♚'; }
      if (L.type === 'play') { return '♞'; }
      return '💡';
    }

    /* ---- the academy path ---- */
    function recommendedIndex() {
      for (let i = 0; i <= unlocked && i < LESSONS.length; i++) { if (!(starMap[LESSONS[i].id] > 0)) { return i; } }
      return Math.min(unlocked, LESSONS.length - 1);
    }
    function renderPath() {
      syncPill();
      const recIdx = recommendedIndex();
      let html = '<div class="chess-path">';
      html += '<div class="chess-retake"><button class="pill-btn" id="chess-retake" type="button"><span aria-hidden="true">🧭</span> Re-check my level</button></div>';
      let lastUnit = '';
      for (let i = 0; i < LESSONS.length; i++) {
        const L = LESSONS[i];
        if (L.unit !== lastUnit) { html += '<div class="chess-unit">' + L.unitEmoji + ' ' + L.unit + '</div>'; lastUnit = L.unit; }
        const locked = i > unlocked;
        const stars = starMap[L.id] || 0;
        const isRec = i === recIdx && !locked;
        html += '<button class="chess-node' + (locked ? ' is-locked' : '') + (isRec ? ' is-rec' : '') + '" type="button" data-i="' + i + '"' + (locked ? ' disabled' : '') + '>' +
                  '<span class="chess-node-ic">' + (locked ? '🔒' : lessonIcon(L)) + '</span>' +
                  '<span class="chess-node-t">' + L.title + (isRec ? '<span class="chess-here">Start here</span>' : '') + '</span>' +
                  '<span class="chess-node-s">' + starsMarkup(stars, 3) + '</span>' +
                '</button>';
      }
      html += '</div>';
      stageEl.innerHTML = html;
      $('#chess-retake').addEventListener('click', function () { Store.set(KEYS.placed, ''); placed = false; startEval(); });
      $$('#chess-stage .chess-node').forEach(function (b) { b.addEventListener('click', function () { openLesson(parseInt(b.dataset.i, 10)); }); });
      setStatus('Pick a lesson to start! ♟️');
    }

    /* ---- evaluation test → personalized plan ---- */
    function renderEvalIntro() {
      syncPill();
      stageEl.innerHTML =
        '<div class="math-panel chess-info">' +
          '<div class="math-big-emoji" aria-hidden="true">♟️🧭</div>' +
          '<h2 class="math-h">Let’s find your chess level!</h2>' +
          '<p class="math-p">Solve a few quick puzzles so we can build <strong>your</strong> lesson plan. ' +
            'Some may be tricky — just try your best!</p>' +
          '<div class="math-actions">' +
            '<button class="pill-btn pill-primary math-go" id="chess-eval-go" type="button">Start the check ▶️</button>' +
            '<button class="pill-btn math-go" id="chess-eval-skip" type="button">Skip</button>' +
          '</div>' +
        '</div>';
      $('#chess-eval-go').addEventListener('click', startEval);
      $('#chess-eval-skip').addEventListener('click', function () { placed = true; Store.set(KEYS.placed, '1'); save(); renderPath(); });
      setStatus('');
    }

    function evalShell(item, n, total) {
      let dots = '<span class="math-dots" aria-label="Question ' + n + ' of ' + total + '">';
      for (let i = 1; i <= total; i++) { dots += '<span class="math-dot' + (i < n ? ' done' : (i === n ? ' now' : '')) + '"></span>'; }
      dots += '</span>';
      stageEl.innerHTML =
        '<div class="chess-lesson">' +
          '<div class="chess-l-head"><div class="chess-l-title">🧭 Chess Check</div>' + dots + '</div>' +
          '<p class="chess-tip">' + item.prompt + '</p>' +
          '<div id="chess-board-slot" class="chess-board-slot"></div>' +
          '<div class="chess-foot"><button class="pill-btn" id="chess-eval-skip2" type="button">Skip ▶️</button></div>' +
        '</div>';
    }

    function startEval() {
      Audio.play('tap');
      const items = C.CHESS_PLACEMENT;
      const skills = {};
      let i = 0;
      function finish() { finishEval(skills); }
      function showItem() {
        if (i >= items.length) { finish(); return; }
        const item = items[i];
        const st = C.parseFEN(item.fen);
        let answered = false;
        view = { board: st.board, coins: null, selected: -1, dests: [], lastFrom: -1, lastTo: -1, checkSq: checkSqOf(st), hintSq: -1, onSq: onSq };
        evalShell(item, i + 1, items.length);
        paintBoard();
        setStatus(item.prompt);
        $('#chess-eval-skip2').addEventListener('click', finish);
        function onSq(sq) {
          if (answered) { return; }
          if (view.selected >= 0 && contains(view.dests, sq)) {
            const m = C.findMove(C.legalMoves(st, view.selected), view.selected, sq);
            if (m) {
              answered = true;
              const pass = C.assessMove(st, item, m);
              C.makeMove(st, m); view.lastFrom = m.from; view.lastTo = sq; view.selected = -1; view.dests = []; view.checkSq = checkSqOf(st); paintBoard();
              if (pass) { skills[item.skill] = true; Audio.play('place'); setStatus('Yes! ✅'); }
              else { Audio.play('error'); setStatus('Good try!'); }
              window.setTimeout(function () { i++; showItem(); }, pass ? 750 : 1100);
            }
            return;
          }
          const p = st.board[sq];
          if (p && C.colorOf(p) === st.turn) { view.selected = sq; view.dests = destSquares(C.legalMoves(st, sq)); Audio.play('tap'); paintBoard(); }
          else { view.selected = -1; view.dests = []; paintBoard(); }
        }
      }
      showItem();
    }

    function finishEval(skills) {
      const plan = C.applyChessPlacement(skills);
      unlocked = plan.unlocked;
      for (const id in plan.stars) { if (plan.stars[id] > (starMap[id] || 0)) { starMap[id] = plan.stars[id]; } }
      placed = true; Store.set(KEYS.placed, '1'); save(); syncPill();
      renderEvalResults(plan);
    }

    function renderEvalResults(plan) {
      const rec = LESSONS[plan.recommend];
      const titles = { pieces: 'Piece Moves', capture: 'Capturing', opening: 'Openings', mate: 'Checkmates', tactics: 'Tactics', endgame: 'Endgames' };
      let badges = '';
      for (let i = 0; i < plan.knownUnits.length; i++) { badges += '<span class="chess-badge">✅ ' + (titles[plan.knownUnits[i]] || plan.knownUnits[i]) + '</span>'; }
      if (!badges) { badges = '<span class="chess-badge">🌱 We’ll start from the very beginning!</span>'; }
      stageEl.innerHTML =
        '<div class="math-panel chess-info">' +
          '<div class="math-big-emoji" aria-hidden="true">🧭✨</div>' +
          '<h2 class="math-h">Your Chess Plan</h2>' +
          '<p class="math-p">Nice work! Here’s what you already show:</p>' +
          '<div class="chess-badges">' + badges + '</div>' +
          '<p class="math-p"><strong>Start here:</strong> ' + rec.unitEmoji + ' ' + rec.title + '</p>' +
          '<div class="math-actions">' +
            '<button class="pill-btn pill-primary math-go" id="chess-start-here" type="button">Start ▶️</button>' +
            '<button class="pill-btn math-go" id="chess-see-all" type="button">See all lessons</button>' +
          '</div>' +
        '</div>';
      $('#chess-start-here').addEventListener('click', function () { openLesson(plan.recommend); });
      $('#chess-see-all').addEventListener('click', renderPath);
      setStatus('Your lessons are ready! 🎉');
    }

    function openLesson(idx) {
      if (idx > unlocked) { return; }
      Audio.play('tap');
      const L = LESSONS[idx];
      if (L.type === 'info') { return renderInfo(L); }
      if (L.type === 'piece') { return startCollect(L); }
      if (L.type === 'promote') { return startPromote(L); }
      if (L.type === 'puzzle') { return startPuzzle(L); }
      if (L.type === 'play') { return startPlay(L); }
    }

    /* ---- shared board rendering ---- */
    function lessonShell(title, tip, footer) {
      stageEl.innerHTML =
        '<div class="chess-lesson">' +
          '<div class="chess-l-head">' +
            '<button class="pill-btn chess-back" id="chess-back" type="button"><span aria-hidden="true">⬅️</span> Lessons</button>' +
            '<div class="chess-l-title">' + title + '</div>' +
          '</div>' +
          '<p class="chess-tip">' + tip + '</p>' +
          '<div id="chess-board-slot" class="chess-board-slot"></div>' +
          (footer || '') +
        '</div>';
      $('#chess-back').addEventListener('click', renderPath);
    }

    function paintBoard() {
      const m = view;
      let html = '<div class="chess-board" id="chess-board">';
      for (let r = 7; r >= 0; r--) {
        for (let f = 0; f < 8; f++) {
          const sq = r * 16 + f;
          let cls = 'sq ' + (((r + f) % 2 === 0) ? 'dark' : 'light');
          if (m.selected === sq) { cls += ' sel'; }
          if (m.hintSq === sq) { cls += ' hint'; }
          if (m.lastFrom === sq || m.lastTo === sq) { cls += ' last'; }
          if (m.checkSq === sq) { cls += ' check'; }
          const p = m.board[sq];
          const isDest = m.dests && contains(m.dests, sq);
          if (isDest) { cls += p ? ' cap' : ' dest'; }
          let inner = p ? pieceGlyph(p) : '';
          if (m.coins && m.coins[sq]) { inner += '<span class="coin" aria-hidden="true">💎</span>'; }
          html += '<button class="' + cls + '" type="button" data-sq="' + sq + '">' + inner + '</button>';
        }
      }
      html += '</div>';
      $('#chess-board-slot').innerHTML = html;
      $$('#chess-board .sq').forEach(function (b) { b.addEventListener('click', function () { m.onSq(parseInt(b.dataset.sq, 10)); }); });
    }

    function emptyState() { return C.parseFEN('8/8/8/8/8/8/8/8 w - - 0 1'); }

    function finishLesson(L, sub, stars) {
      complete(L.index, stars);
      const hasNext = L.index + 1 < LESSONS.length && L.index + 1 <= unlocked;
      setStatus('Well done! 🎉');
      Win.show({
        title: 'Great job!', sub: sub, stars: stars, speedy: false,
        next: hasNext ? { cb: function () { openLesson(L.index + 1); } } : { cb: renderPath },
        again: { cb: function () { openLesson(L.index); } }
      });
    }

    /* ---- info lesson ---- */
    function renderInfo(L) {
      stageEl.innerHTML =
        '<div class="math-panel chess-info">' +
          '<div class="math-big-emoji" aria-hidden="true">💡</div>' +
          '<h2 class="math-h">' + L.title + '</h2>' +
          '<p class="math-p">' + L.tip + '</p>' +
          '<div class="math-actions">' +
            '<button class="pill-btn chess-back2" id="chess-info-back" type="button">⬅️ Lessons</button>' +
            '<button class="pill-btn pill-primary math-go" id="chess-info-go" type="button">Got it! ▶️</button>' +
          '</div>' +
        '</div>';
      $('#chess-info-back').addEventListener('click', renderPath);
      $('#chess-info-go').addEventListener('click', function () {
        Audio.play('place'); complete(L.index, 3);
        if (L.index + 1 <= unlocked && L.index + 1 < LESSONS.length) { openLesson(L.index + 1); } else { renderPath(); }
      });
      setStatus('');
    }

    /* ---- piece mini-game (collect the gems) ---- */
    function startCollect(L) {
      const st = emptyState();
      st.board[C.sqFromAlg(L.start)] = L.piece;
      const coins = {}; for (let i = 0; i < L.coins.length; i++) { coins[C.sqFromAlg(L.coins[i])] = true; }
      const total = L.coins.length;
      let moves = 0;
      view = { board: st.board, coins: coins, selected: -1, dests: [], lastFrom: -1, lastTo: -1, checkSq: -1, onSq: onSq };
      lessonShell(L.title, L.tip, '');
      paintBoard();
      setStatus('Collect all ' + total + ' 💎!');

      function onSq(sq) {
        if (view.selected >= 0 && contains(view.dests, sq)) {
          const m = C.findMove(C.legalMoves(st, view.selected), view.selected, sq);
          if (m) {
            C.makeMove(st, m); moves++;
            st.turn = C.colorOf(L.piece);   // solo mini-game: it's always the mover's turn
            if (coins[sq]) { delete coins[sq]; Audio.play('place'); } else { Audio.play('slide'); }
            view.lastFrom = m.from; view.lastTo = sq; view.selected = -1; view.dests = [];
            paintBoard();
            let left = 0; for (const k in coins) { left++; }
            if (left === 0) {
              const stars = moves <= total ? 3 : (moves <= total + 2 ? 2 : 1);
              finishLesson(L, 'You collected them all in ' + moves + ' moves! 💎', stars);
            } else { setStatus(left + ' 💎 to go · ' + moves + ' moves'); }
          }
          return;
        }
        if (st.board[sq]) { view.selected = sq; view.dests = destSquares(C.legalMoves(st, sq)); Audio.play('tap'); paintBoard(); }
        else { view.selected = -1; view.dests = []; paintBoard(); }
      }
    }

    /* ---- pawn promotion lesson ---- */
    function startPromote(L) {
      const st = C.parseFEN(L.fen);
      const goalR = L.goalRank - 1;
      let moves = 0;
      view = { board: st.board, coins: null, selected: -1, dests: [], lastFrom: -1, lastTo: -1, checkSq: -1, onSq: onSq };
      lessonShell(L.title, L.tip, '');
      paintBoard();
      setStatus('March the pawn to the top to promote! 👑');

      function onSq(sq) {
        if (view.selected >= 0 && contains(view.dests, sq)) {
          const m = C.findMove(C.legalMoves(st, view.selected), view.selected, sq);   // Q-promo is first
          if (m) {
            C.makeMove(st, m); moves++;
            Audio.play(m.captured ? 'place' : 'slide');
            view.lastFrom = m.from; view.lastTo = sq; view.selected = -1; view.dests = [];
            paintBoard();
            if (C.rankOf(sq) === goalR) { finishLesson(L, 'Your pawn became a Queen! 👑', 3); }
          }
          return;
        }
        const p = st.board[sq];
        if (p && C.colorOf(p) === st.turn) { view.selected = sq; view.dests = destSquares(C.legalMoves(st, sq)); Audio.play('tap'); paintBoard(); }
        else { view.selected = -1; view.dests = []; paintBoard(); }
      }
    }

    /* ---- puzzle (mate-in-one / win-a-piece / fork / best-move) ---- */
    const GOAL_PROMPT = { mate1: 'Find checkmate in one! ♚', free: 'Win the free piece! ⚡', fork: 'Find the fork! ⚡', solve: 'Find the best move! 🌟' };
    const GOAL_WIN = { mate1: 'Checkmate! ♚🏆', free: 'You won a piece! 🎉', fork: 'Great fork! 🍴', solve: 'Correct! 🌟' };
    function checkSqOf(st) { const k = C.findKing(st.board, st.turn); return (k >= 0 && C.isInCheck(st, st.turn)) ? k : -1; }
    function hintFromSq(st, L) {
      if (L.solutions && L.solutions.length) { return C.sqFromAlg(L.solutions[0].slice(0, 2)); }
      const moves = C.legalMoves(st);                       // mate1 with no listed solution
      for (let i = 0; i < moves.length; i++) { if (C.moveGivesMate(st, moves[i])) { return moves[i].from; } }
      return -1;
    }

    function startPuzzle(L) {
      const base = C.parseFEN(L.fen);
      const goal = L.goal || 'mate1';
      const prompt = GOAL_PROMPT[goal] || GOAL_PROMPT.solve;
      let st = C.cloneState(base);
      const footer = '<div class="chess-foot"><button class="pill-btn" id="chess-hint" type="button"><span aria-hidden="true">💡</span> Hint</button></div>';
      view = { board: st.board, coins: null, selected: -1, dests: [], lastFrom: -1, lastTo: -1, checkSq: checkSqOf(st), hintSq: -1, onSq: onSq };
      lessonShell(L.title, L.tip, footer);
      paintBoard();
      setStatus(prompt);
      $('#chess-hint').addEventListener('click', function () { view.hintSq = hintFromSq(st, L); paintBoard(); setStatus('Try moving the highlighted piece. 💡'); });

      function reset() {
        st = C.cloneState(base);
        view.board = st.board; view.selected = -1; view.dests = []; view.lastFrom = -1; view.lastTo = -1; view.hintSq = -1; view.checkSq = checkSqOf(st);
        paintBoard(); setStatus(prompt);
      }
      function onSq(sq) {
        if (view.selected >= 0 && contains(view.dests, sq)) {
          const m = C.findMove(C.legalMoves(st, view.selected), view.selected, sq);
          if (m) {
            const solved = C.assessMove(st, L, m);
            C.makeMove(st, m);
            view.lastFrom = m.from; view.lastTo = sq; view.selected = -1; view.dests = []; view.hintSq = -1; view.checkSq = checkSqOf(st);
            paintBoard();
            if (solved) { Audio.play('place'); finishLesson(L, GOAL_WIN[goal] || GOAL_WIN.solve, 3); }
            else { Audio.play('error'); setStatus('Good try — not quite. Let’s reset…'); window.setTimeout(reset, 1100); }
          }
          return;
        }
        const p = st.board[sq];
        if (p && C.colorOf(p) === st.turn) { view.selected = sq; view.dests = destSquares(C.legalMoves(st, sq)); Audio.play('tap'); paintBoard(); }
        else { view.selected = -1; view.dests = []; view.hintSq = -1; paintBoard(); }
      }
    }

    /* ---- play a full game vs the bot ---- */
    function startPlay(L) {
      let st = C.parseFEN(C.START_FEN);
      let over = false;
      const footer = '<div class="chess-foot"><button class="pill-btn pill-primary" id="chess-newgame" type="button"><span aria-hidden="true">🎲</span> New game</button></div>';
      view = { board: st.board, coins: null, selected: -1, dests: [], lastFrom: -1, lastTo: -1, checkSq: -1, onSq: onSq };
      lessonShell(L.title, L.tip, footer);
      paintBoard();
      setStatus('Your move! You are White ⚪');
      $('#chess-newgame').addEventListener('click', function () {
        if (over || confirmCheck()) { restart(); }
        else { Confirm.ask({ title: 'New game?', sub: 'This game will be lost.', yes: 'Yes, new game', onYes: restart }); }
      });
      function confirmCheck() { return st.full <= 1 && st.turn === C.W; }    // nothing meaningful to lose yet
      function restart() { st = C.parseFEN(C.START_FEN); over = false; view.board = st.board; view.selected = -1; view.dests = []; view.lastFrom = -1; view.lastTo = -1; view.checkSq = -1; paintBoard(); setStatus('Your move! You are White ⚪'); }

      function refreshCheck() { const k = C.findKing(st.board, st.turn); view.checkSq = (k >= 0 && C.isInCheck(st, st.turn)) ? k : -1; }
      function endIf() {
        const s = C.gameStatus(st);
        if (s === 'checkmate') {
          over = true;
          const youWin = st.turn === C.B;                 // side to move is the one checkmated
          if (youWin) { finishLesson(L, 'Checkmate — you beat the ' + L.title + '! ♚🏆', 3); }
          else { setStatus('The bot got you this time! 🤖'); Win.show({ title: 'Good game!', sub: 'The bot won — want a rematch?', stars: 0, speedy: false, next: { cb: restart }, again: { cb: restart } }); }
          return true;
        }
        if (s === 'stalemate' || s === 'draw') { over = true; setStatus('It’s a draw! 🤝'); Win.show({ title: 'It’s a draw!', sub: 'Nobody got checkmated.', stars: 1, speedy: false, next: { cb: restart }, again: { cb: restart } }); return true; }
        return false;
      }
      function botMove() {
        if (over) { return; }
        setStatus('The bot is thinking… 🤖');
        window.setTimeout(function () {
          if (over) { return; }
          const m = C.bestMove(st, L.botLevel, Math.random);
          if (!m) { endIf(); return; }
          C.makeMove(st, m); Audio.play(m.captured ? 'place' : 'slide');
          view.lastFrom = m.from; view.lastTo = m.to; refreshCheck(); paintBoard();
          if (!endIf()) { setStatus(view.checkSq >= 0 ? 'Check! Your move ⚪' : 'Your move ⚪'); }
        }, 450);
      }
      function onSq(sq) {
        if (over || st.turn !== C.W) { return; }
        if (view.selected >= 0 && contains(view.dests, sq)) {
          const m = C.findMove(C.legalMoves(st, view.selected), view.selected, sq);   // auto-queen (Q-promo first)
          if (m) {
            C.makeMove(st, m); Audio.play(m.captured ? 'place' : 'slide');
            view.lastFrom = m.from; view.lastTo = m.to; view.selected = -1; view.dests = []; refreshCheck(); paintBoard();
            if (!endIf()) { botMove(); }
          }
          return;
        }
        const p = st.board[sq];
        if (p && C.colorOf(p) === C.W) { view.selected = sq; view.dests = destSquares(C.legalMoves(st, sq)); Audio.play('tap'); paintBoard(); }
        else { view.selected = -1; view.dests = []; paintBoard(); }
      }
    }

    /* ---- entry point ---- */
    function enter() {
      if (!wired) { wired = true; }
      view = null;
      syncPill();
      if (!placed) { renderEvalIntro(); } else { renderPath(); }
    }

    load();   // load progress at startup for the home dashboard

    return { enter: enter, homeStars: homeStars, doneText: doneText };
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
