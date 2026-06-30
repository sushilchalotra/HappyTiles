/* ============================================================================
   HappyTiles — math-core.js
   Pure, DOM-free adaptive engine for the Math Quest game (times-tables &
   division fluency). The counterpart to games-core.js: it owns the pedagogy
   (fact model, spaced repetition, mastery tracking, item selection, question
   building) and contains NO DOM, audio, storage, or LLM calls.

   Written in the same deliberately old-school style as games-core.js (var /
   function / index loops; no template literals, arrows, Array.from, forEach,
   Object.keys, or Array.prototype.indexOf) so the EXACT same file runs in:
     - the browser            (via window.MathCore)
     - Node.js                (via module.exports)
     - Windows cscript/JScript (for offline smoke testing)

   Determinism: all randomness flows through an injectable rng(); all "current
   time" flows in as a `now` argument (ms). Nothing here reads the clock or the
   global Math.random on its own unless a caller omits them.

   THE PEDAGOGY (why it works without an LLM):
   - Fluency, not just correctness — every fact tracks response time, and only
     a correct AND fast answer can make a fact "fluent".
   - Spaced repetition — each fact rides a Leitner box; correct answers push it
     to a longer interval, a miss drops it back to "see it again soon".
   - Mastery stages — New -> Learning -> Reviewing -> Fluent. New facts are
     introduced only when the "learning edge" isn't already crowded.
   - Smart sequencing — anchor tables first (2, 10, 5), then 3, 4, then the hard
     core (9 via its trick, then 6, 7, 8). Commutativity folds 6x7 == 7x6, so
     there are only 45 unique facts to master.
   ============================================================================ */
var MathCore = (function () {
  'use strict';

  /* ------------------------------ constants ------------------------------ */
  var FACTORS = [2, 3, 4, 5, 6, 7, 8, 9, 10];
  // Pedagogical teaching order of the tables: anchors first, hard core last.
  var FACTOR_ORDER = [2, 10, 5, 3, 4, 9, 6, 7, 8];

  var STAGE = { NEW: 0, LEARNING: 1, REVIEWING: 2, FLUENT: 3 };

  var FLUENT_MS = 3500;   // sustained average at/under this can earn "fluent"
  var FAST_MS   = 3000;   // a single answer at/under this counts as "fast"
  var LEARNING_CAP = 5;   // don't introduce a new fact while this many are mid-learning

  // Leitner box -> review interval (ms). Tuned for a kid who plays ~daily:
  // same-session, ~10 min, ~8 h, 1 day, 3 days, 7 days.
  var BOX_MS = [
    60 * 1000,
    10 * 60 * 1000,
    8 * 60 * 60 * 1000,
    24 * 60 * 60 * 1000,
    3 * 24 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000
  ];
  var BOX_MAX = BOX_MS.length - 1;

  var MUL = '×';   // ×
  var DIV = '÷';   // ÷

  /* ------------------------------ helpers ------------------------------ */
  function intervalMs(box) {
    if (box < 0) { box = 0; }
    if (box > BOX_MAX) { box = BOX_MAX; }
    return BOX_MS[box];
  }

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

  function factId(a, b) {
    var lo = a < b ? a : b, hi = a < b ? b : a;
    return lo + 'x' + hi;
  }

  function findFact(facts, id) {
    for (var i = 0; i < facts.length; i++) { if (facts[i].id === id) { return facts[i]; } }
    return null;
  }

  function countStage(facts, stage) {
    var n = 0;
    for (var i = 0; i < facts.length; i++) { if (facts[i].stage === stage) { n++; } }
    return n;
  }

  /* ------------------------------ fact universe ------------------------------ */
  function newRecord(a, b) {
    return {
      id: factId(a, b), a: (a < b ? a : b), b: (a < b ? b : a), p: a * b,
      stage: STAGE.NEW, box: 0, dueAt: 0,
      seen: 0, correct: 0, streak: 0,
      bestMs: 0, avgMs: 0, lastMs: 0
    };
  }

  // The 45 unique multiplication facts for factors 2..10 (commutativity folded).
  function buildFacts() {
    var facts = [], seen = {}, i, j;
    for (i = 0; i < FACTORS.length; i++) {
      for (j = 0; j < FACTORS.length; j++) {
        var id = factId(FACTORS[i], FACTORS[j]);
        if (seen[id]) { continue; }
        seen[id] = true;
        facts.push(newRecord(FACTORS[i], FACTORS[j]));
      }
    }
    return facts;
  }
  function createInitialState() { return buildFacts(); }

  // Order in which brand-new facts get introduced (anchors first, hard core last).
  function teachOrder() {
    var order = [], seen = {}, i, j;
    for (i = 0; i < FACTOR_ORDER.length; i++) {
      for (j = 0; j < FACTORS.length; j++) {
        var id = factId(FACTOR_ORDER[i], FACTORS[j]);
        if (!seen[id]) { seen[id] = true; order.push(id); }
      }
    }
    return order;
  }

  // The next fact worth teaching, or null if the learning edge is full / done.
  function pickNewFact(facts) {
    if (countStage(facts, STAGE.LEARNING) >= LEARNING_CAP) { return null; }
    var order = teachOrder();
    for (var i = 0; i < order.length; i++) {
      var f = findFact(facts, order[i]);
      if (f && f.stage === STAGE.NEW) { return f; }
    }
    return null;
  }

  /* ------------------------------ strategies ------------------------------ */
  // Kid-friendly memory trick for a fact. Static pedagogy — no LLM needed.
  function strategyFor(a, b) {
    function has(n) { return a === n || b === n; }
    function other(n) { return a === n ? b : a; }
    if (a === b) {
      return { title: 'Square it!', tip: 'A number times itself is a "square". ' + a + MUL + a + ' = ' + (a * a) + '.' };
    }
    if (has(10)) {
      return { title: MUL + '10 is easy', tip: 'To times by 10, just add a 0 on the end. ' + other(10) + ' becomes ' + (other(10) * 10) + '.' };
    }
    if (has(2)) {
      return { title: 'Doubling', tip: MUL + '2 means double it. ' + other(2) + ' + ' + other(2) + ' = ' + (other(2) * 2) + '.' };
    }
    if (has(5)) {
      return { title: 'Count by 5s', tip: MUL + '5 is half of ' + MUL + '10. Half of ' + (other(5) * 10) + ' is ' + (other(5) * 5) + '.' };
    }
    if (has(9)) {
      return { title: 'The 9 trick', tip: MUL + '9 is ' + MUL + '10 take away one group: ' + (other(9) * 10) + ' − ' + other(9) + ' = ' + (other(9) * 9) + '. (Its digits add up to 9!)' };
    }
    if (has(4)) {
      return { title: 'Double, double', tip: MUL + '4 = double it twice. ' + other(4) + ' → ' + (other(4) * 2) + ' → ' + (other(4) * 4) + '.' };
    }
    if (has(3)) {
      return { title: 'Count by 3s', tip: MUL + '3 = double it, then add one more group. ' + (other(3) * 2) + ' + ' + other(3) + ' = ' + (other(3) * 3) + '.' };
    }
    // The hard core (6x7, 6x8, 7x8): build up from a x5.
    return { title: 'Build it up', tip: a + MUL + '5 = ' + (a * 5) + ', plus ' + a + MUL + (b - 5) + ' = ' + (a * (b - 5)) + ', makes ' + (a * b) + '.' };
  }

  /* ------------------------------ grading ------------------------------ */
  // Update a fact record in place from one answered question. Mutates `rec`
  // (accuracy, speed, streak, box, stage, dueAt) and returns an info object.
  // `now` schedules the next review; `latencyMs` is how long the answer took.
  function grade(rec, correct, latencyMs, now) {
    var before = rec.stage;
    rec.seen += 1;
    rec.lastMs = latencyMs;
    if (correct) {
      rec.correct += 1;
      rec.streak += 1;
      rec.bestMs = (rec.bestMs === 0) ? latencyMs : Math.min(rec.bestMs, latencyMs);
      rec.avgMs = (rec.avgMs === 0) ? latencyMs : Math.round(rec.avgMs * 0.6 + latencyMs * 0.4);
      if (rec.box < BOX_MAX) { rec.box += 1; }
      if (rec.stage === STAGE.NEW) { rec.stage = STAGE.LEARNING; }
      else if (rec.stage === STAGE.LEARNING && rec.streak >= 2) { rec.stage = STAGE.REVIEWING; }
      else if (rec.stage === STAGE.REVIEWING && rec.streak >= 3 && rec.avgMs <= FLUENT_MS) { rec.stage = STAGE.FLUENT; }
    } else {
      rec.streak = 0;
      rec.box = 0;
      if (rec.stage === STAGE.FLUENT) { rec.stage = STAGE.REVIEWING; }
      else if (rec.stage === STAGE.REVIEWING) { rec.stage = STAGE.LEARNING; }
      else if (rec.stage === STAGE.NEW) { rec.stage = STAGE.LEARNING; }
    }
    rec.dueAt = now + intervalMs(rec.box);
    return {
      correct: !!correct,
      stageBefore: before,
      stageAfter: rec.stage,
      becameFluent: before !== STAGE.FLUENT && rec.stage === STAGE.FLUENT,
      fast: !!correct && latencyMs <= FAST_MS
    };
  }

  /* ------------------------------ item selection ------------------------------ */
  function poolFor(facts, mode) {
    var pool = [], i;
    if (mode === 'speed') {
      for (i = 0; i < facts.length; i++) { if (facts[i].stage === STAGE.FLUENT) { pool.push(facts[i]); } }
      if (pool.length < 4) {                       // not enough fluent yet — widen to reviewing
        pool = [];
        for (i = 0; i < facts.length; i++) { if (facts[i].stage >= STAGE.REVIEWING) { pool.push(facts[i]); } }
      }
    } else {                                        // 'review' / 'mixed'
      for (i = 0; i < facts.length; i++) { if (facts[i].stage >= STAGE.LEARNING) { pool.push(facts[i]); } }
    }
    return pool;
  }

  function weightOf(f, mode, now, excludeId) {
    var w = 1;
    if (f.dueAt <= now) {                            // due / overdue facts come first
      var over = (now - f.dueAt) / intervalMs(1);
      if (over > 4) { over = 4; }
      w += 2 + over;
    }
    var s = f.streak; if (s > 3) { s = 3; } if (s < 0) { s = 0; }
    w += (3 - s);                                    // weaker facts (short streak) weigh more
    if (f.stage === STAGE.LEARNING) { w += 2; }      // keep reps on the learning edge
    if (mode === 'speed') {                          // in speed mode, drill the slow-but-known
      var slow = ((f.avgMs || f.lastMs || 0) - FAST_MS) / 1000;
      if (slow < 0) { slow = 0; } if (slow > 4) { slow = 4; }
      w += slow;
    }
    if (excludeId && f.id === excludeId) { w *= 0.05; }  // avoid an immediate repeat
    if (w < 0.01) { w = 0.01; }
    return w;
  }

  // Pick the next fact to ask. opts: { mode, now, rng, excludeId, ids }.
  // mode: 'review' | 'mixed' | 'speed'. `ids` (optional) restricts the pool to a
  // specific set of fact ids — used by Boss Battles to drill one world. Returns a
  // fact record or null.
  function selectNext(facts, opts) {
    opts = opts || {};
    var mode = opts.mode || 'mixed';
    var now = opts.now || 0;
    var rng = opts.rng || Math.random;
    var pool = poolFor(facts, mode);
    var i;
    if (opts.ids) {
      var allow = {}, fp = [];
      for (i = 0; i < opts.ids.length; i++) { allow[opts.ids[i]] = true; }
      for (i = 0; i < pool.length; i++) { if (allow[pool[i].id]) { fp.push(pool[i]); } }
      pool = fp;
    }
    if (!pool.length) { return null; }
    var weights = [], total = 0;
    for (i = 0; i < pool.length; i++) { weights[i] = weightOf(pool[i], mode, now, opts.excludeId); total += weights[i]; }
    var r = rng() * total, acc = 0;
    for (i = 0; i < pool.length; i++) { acc += weights[i]; if (r <= acc) { return pool[i]; } }
    return pool[pool.length - 1];
  }

  /* ------------------------------ questions ------------------------------ */
  // new/learning facts -> low-pressure multiple choice; once you're past that,
  // type the answer so it's true recall (and you can be timed for speed).
  function pickInputMode(fact) {
    return fact.stage <= STAGE.LEARNING ? 'choice' : 'pad';
  }

  function pushChoice(arr, v, avoid) {
    if (v === avoid) { return; }
    if (v <= 0) { return; }
    if (Math.floor(v) !== v) { return; }
    for (var i = 0; i < arr.length; i++) { if (arr[i] === v) { return; } }
    arr.push(v);
  }

  // Pedagogically chosen distractors: off-by-a-row (answer +/- a factor), plus
  // near-misses. Always returns 4 distinct positive options including the answer.
  function makeChoices(answer, fact, op, rng) {
    var d = [];
    if (op === 'div') {
      pushChoice(d, answer + 1, answer); pushChoice(d, answer - 1, answer);
      pushChoice(d, answer + 2, answer); pushChoice(d, answer - 2, answer);
      pushChoice(d, fact.a, answer); pushChoice(d, fact.b, answer);
    } else {
      pushChoice(d, answer + fact.a, answer); pushChoice(d, answer - fact.a, answer);
      pushChoice(d, answer + fact.b, answer); pushChoice(d, answer - fact.b, answer);
      pushChoice(d, answer + 1, answer); pushChoice(d, answer - 1, answer);
    }
    shuffleInPlace(d, rng);
    var choices = [answer];
    for (var i = 0; i < d.length && choices.length < 4; i++) { choices.push(d[i]); }
    var pad = 2;
    while (choices.length < 4) { pushChoice(choices, answer + pad, -999); pad++; }
    shuffleInPlace(choices, rng);
    return choices;
  }

  // Build a concrete question from a fact. opts: { rng, allowDivision, forceInput }.
  // Returns { id, op:'mul'|'div', x, y, answer, prompt, inputMode, choices? }.
  function makeQuestion(fact, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    var inputMode = opts.forceInput || pickInputMode(fact);
    var op = (opts.allowDivision && rng() < 0.5) ? 'div' : 'mul';
    var q = { id: fact.id, op: op, inputMode: inputMode };
    if (op === 'mul') {
      var swap = rng() < 0.5;                         // show a x b or b x a for variety
      q.x = swap ? fact.b : fact.a;
      q.y = swap ? fact.a : fact.b;
      q.answer = fact.p;
      q.prompt = q.x + ' ' + MUL + ' ' + q.y;
    } else {
      var byA = rng() < 0.5;                          // p / a = b  OR  p / b = a
      q.x = fact.p;
      q.y = byA ? fact.a : fact.b;
      q.answer = byA ? fact.b : fact.a;
      q.prompt = fact.p + ' ' + DIV + ' ' + q.y;
    }
    if (inputMode === 'choice') { q.choices = makeChoices(q.answer, fact, op, rng); }
    return q;
  }

  /* ------------------------------ placement ------------------------------ */
  // A short adaptive probe set: ~2 facts per table, spread across the tables, so
  // we can seed the whole mastery model from a few minutes of answers.
  function placementProbes(rng) {
    rng = rng || Math.random;
    var probes = [], seen = {}, i;
    for (i = 0; i < FACTOR_ORDER.length; i++) {
      var f = FACTOR_ORDER[i], got = 0, attempts = 0;
      while (got < 2 && attempts < 20) {
        attempts++;
        var g = 2 + Math.floor(rng() * 9);            // partner factor in 2..10
        if (g === f) { continue; }
        var id = factId(f, g);
        if (seen[id]) { continue; }
        seen[id] = true;
        probes.push({ a: (f < g ? f : g), b: (f < g ? g : f), id: id });
        got++;
      }
    }
    return probes;
  }

  // Seed each fact's stage from placement results. results: array of
  // { a, b, correct, ms } (or { id, correct, ms }). Inference is per-table; each
  // fact then takes the stronger of its two tables (optimistic — weak facts will
  // simply demote themselves the first time they're missed in play).
  function applyPlacement(facts, results, now) {
    var stat = {}, i;
    function bump(factor, correct, fast) {
      if (!stat[factor]) { stat[factor] = { n: 0, ok: 0, fast: 0 }; }
      stat[factor].n++;
      if (correct) { stat[factor].ok++; }
      if (correct && fast) { stat[factor].fast++; }
    }
    for (i = 0; i < results.length; i++) {
      var r = results[i], a = r.a, b = r.b;
      if (a === undefined && r.id) { var parts = ('' + r.id).split('x'); a = parseInt(parts[0], 10); b = parseInt(parts[1], 10); }
      var fast = (r.ms !== undefined) && r.ms <= FLUENT_MS;
      bump(a, r.correct, fast);
      if (b !== a) { bump(b, r.correct, fast); }
    }
    function tableStage(factor) {
      var s = stat[factor];
      if (!s || s.n === 0) { return STAGE.NEW; }
      var rate = s.ok / s.n;
      if (rate >= 0.99 && s.fast === s.n) { return STAGE.FLUENT; }
      if (rate >= 0.99) { return STAGE.REVIEWING; }
      if (rate >= 0.5) { return STAGE.LEARNING; }
      return STAGE.NEW;
    }
    for (i = 0; i < facts.length; i++) {
      var f = facts[i];
      var sa = tableStage(f.a), sb = tableStage(f.b);
      var st = sa > sb ? sa : sb;
      f.stage = st;
      if (st === STAGE.FLUENT) { f.box = 3; f.streak = 3; f.avgMs = FLUENT_MS; }
      else if (st === STAGE.REVIEWING) { f.box = 2; f.streak = 2; }
      else if (st === STAGE.LEARNING) { f.box = 1; f.streak = 1; }
      else { f.box = 0; f.streak = 0; }
      f.dueAt = now;                                  // available now; scheduler spaces from here
    }
    return facts;
  }

  /* ------------------------------ summaries ------------------------------ */
  function summary(facts, now) {
    var s = { total: facts.length, fluent: 0, reviewing: 0, learning: 0, newCount: 0, due: 0 };
    for (var i = 0; i < facts.length; i++) {
      var f = facts[i];
      if (f.stage === STAGE.FLUENT) { s.fluent++; }
      else if (f.stage === STAGE.REVIEWING) { s.reviewing++; }
      else if (f.stage === STAGE.LEARNING) { s.learning++; }
      else { s.newCount++; }
      if (f.stage >= STAGE.LEARNING && f.dueAt <= now) { s.due++; }
    }
    s.started = s.fluent + s.reviewing + s.learning;
    s.masteredPct = Math.round((s.fluent / s.total) * 100);
    return s;
  }

  // Session stars from accuracy (kept off the clock, like the rest of HappyTiles).
  function sessionStars(correct, total) {
    if (total <= 0) { return 1; }
    var rate = correct / total;
    if (rate >= 0.9) { return 3; }
    if (rate >= 0.7) { return 2; }
    return 1;
  }

  /* ------------------------------ worlds (meta-progression) ------------------------------ */
  // Each of the 45 facts is "owned" by exactly one table — the first table in
  // teaching order that introduces it (so e.g. 7x8 belongs to the ×7 world, not ×8).
  // Mastering a world's owned facts completes it: the visible long-term goal.
  var OWNER = (function () {
    var owner = {}, i, j;
    for (i = 0; i < FACTOR_ORDER.length; i++) {
      for (j = 0; j < FACTORS.length; j++) {
        var id = factId(FACTOR_ORDER[i], FACTORS[j]);
        if (owner[id] === undefined) { owner[id] = FACTOR_ORDER[i]; }
      }
    }
    return owner;
  })();
  function worldOf(id) { return OWNER[id]; }
  function worldLabel(factor) { return '×' + factor; }

  // Per-world progress, one entry per table in teaching order:
  // { factor, label, total, mastered, started, complete, bossReady }.
  function worlds(facts) {
    var by = {}, i, fac, w;
    for (i = 0; i < FACTOR_ORDER.length; i++) {
      by[FACTOR_ORDER[i]] = { factor: FACTOR_ORDER[i], label: worldLabel(FACTOR_ORDER[i]),
        total: 0, mastered: 0, reviewingPlus: 0, started: 0 };
    }
    for (i = 0; i < facts.length; i++) {
      fac = OWNER[facts[i].id]; w = by[fac];
      w.total++;
      if (facts[i].stage === STAGE.FLUENT) { w.mastered++; }
      if (facts[i].stage >= STAGE.REVIEWING) { w.reviewingPlus++; }
      if (facts[i].stage >= STAGE.LEARNING) { w.started++; }
    }
    var out = [];
    for (i = 0; i < FACTOR_ORDER.length; i++) {
      w = by[FACTOR_ORDER[i]];
      w.complete = w.total > 0 && w.mastered === w.total;
      // Boss is ready once every owned fact is at least reviewing, but not all fluent.
      w.bossReady = w.total > 0 && w.reviewingPlus === w.total && !w.complete;
      out.push(w);
    }
    return out;
  }

  // The owned fact records for a world — used to build a Boss Battle's question set.
  function worldFacts(facts, factor) {
    var out = [], i;
    for (i = 0; i < facts.length; i++) { if (OWNER[facts[i].id] === factor) { out.push(facts[i]); } }
    return out;
  }

  /* ------------------------------ parent insights ------------------------------ */
  // Actionable, LLM-free read-outs for the grown-ups dashboard:
  //  - slowest: known facts (reviewing+) ranked by slowest average time → "speed up".
  //  - focus:   facts still being learned or recently missed → "needs practice".
  function insights(facts, n) {
    n = n || 5;
    var slow = [], focus = [], i, f;
    for (i = 0; i < facts.length; i++) {
      f = facts[i];
      if (f.stage >= STAGE.REVIEWING && f.avgMs > 0) { slow.push(f); }
      if (f.stage === STAGE.LEARNING ||
          (f.stage === STAGE.REVIEWING && f.streak < 1) ||
          (f.stage < STAGE.REVIEWING && f.seen > 0)) { focus.push(f); }
    }
    slow.sort(function (a, b) { return b.avgMs - a.avgMs; });
    focus.sort(function (a, b) { return (a.stage - b.stage) || (a.streak - b.streak) || (b.avgMs - a.avgMs); });
    return { slowest: slow.slice(0, n), focus: focus.slice(0, n) };
  }

  /* ------------------------------ exports ------------------------------ */
  return {
    STAGE: STAGE, FACTORS: FACTORS, FACTOR_ORDER: FACTOR_ORDER,
    FLUENT_MS: FLUENT_MS, FAST_MS: FAST_MS, LEARNING_CAP: LEARNING_CAP,
    // util
    makeRng: makeRng, shuffleInPlace: shuffleInPlace, factId: factId,
    findFact: findFact, intervalMs: intervalMs,
    // facts & teaching
    buildFacts: buildFacts, createInitialState: createInitialState,
    teachOrder: teachOrder, pickNewFact: pickNewFact, strategyFor: strategyFor,
    // play loop
    grade: grade, selectNext: selectNext, pickInputMode: pickInputMode,
    makeChoices: makeChoices, makeQuestion: makeQuestion,
    // placement / progress
    placementProbes: placementProbes, applyPlacement: applyPlacement,
    summary: summary, sessionStars: sessionStars,
    // worlds (meta-progression)
    worlds: worlds, worldFacts: worldFacts, worldOf: worldOf, worldLabel: worldLabel,
    // parent insights
    insights: insights
  };
})();

// Export for Node (CommonJS) and browser (global). cscript/JScript picks up the
// top-level `var MathCore` directly when this file is eval'd.
if (typeof module !== 'undefined' && module.exports) { module.exports = MathCore; }
if (typeof window !== 'undefined') { window.MathCore = MathCore; }
