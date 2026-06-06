/* Windows cscript / JScript runner for the HappyTiles smoke tests.
 * Usage:  cscript //nologo tests\run-cscript.js
 * Lets you run the game-logic tests on any Windows box with zero installs.
 * (Note: do NOT add "use strict" here — non-strict eval lets the loaded files
 *  declare their top-level vars in this scope.) */

var fso = new ActiveXObject('Scripting.FileSystemObject');
var scriptDir = fso.GetParentFolderName(WScript.ScriptFullName);

function readFile(p) {
  var f = fso.OpenTextFile(p, 1);
  var t = f.AtEndOfStream ? '' : f.ReadAll();
  f.Close();
  return t;
}

// Load the game core and the shared test suite into this scope.
eval(readFile(scriptDir + '\\..\\src\\games-core.js'));
eval(readFile(scriptDir + '\\smoke-tests.js'));

var res = runHappyTests(HappyCore);

for (var i = 0; i < res.results.length; i++) {
  var r = res.results[i];
  WScript.Echo((r.ok ? '  PASS  ' : '  FAIL  ') + r.name + (r.ok ? '' : '  -> ' + r.message));
}
WScript.Echo('');
WScript.Echo(res.passed + ' passed, ' + res.failed + ' failed, ' + res.total + ' total');
WScript.Quit(res.failed ? 1 : 0);
