/* Node.js runner for the HappyTiles smoke tests.
 * Usage:  node tests/run-node.js
 * Exits non-zero if any test fails (CI-friendly). No dependencies. */
'use strict';
var path = require('path');
var Core = require(path.join(__dirname, '..', 'src', 'games-core.js'));
var MathCore = require(path.join(__dirname, '..', 'src', 'math-core.js'));
var runHappyTests = require(path.join(__dirname, 'smoke-tests.js'));

var res = runHappyTests(Core, MathCore);

for (var i = 0; i < res.results.length; i++) {
  var r = res.results[i];
  console.log((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + (r.ok ? '' : '  -> ' + r.message));
}
console.log('\n' + res.passed + ' passed, ' + res.failed + ' failed, ' + res.total + ' total');
process.exit(res.failed ? 1 : 0);
