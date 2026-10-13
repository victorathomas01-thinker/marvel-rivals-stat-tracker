const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function loadScript(filename) {
  const sandbox = {
    window: { setInterval() {} },
    chrome: { storage: { local: { get() {} } } },
    structuredClone
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", filename), "utf8"), sandbox);
  return sandbox;
}

for (const filename of ["content.js", "popup.js"]) {
  test(`${filename}: escapes page-derived HTML characters`, () => {
    const context = loadScript(filename);
    context.input = '<img src=x onerror="alert(1)"> & \'';
    const result = vm.runInContext("escapeHtml(input)", context);
    assert.equal(result, "&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;");
    assert.equal(vm.runInContext('escapeHtml("Luna Snow")', context), "Luna Snow");
  });
}

test("content.js: ranking still prioritizes weighted losses", () => {
  const context = loadScript("content.js");
  context.stats = {
    "Hero A": { weightedLosses: 2, losses: 2, appearances: 2 },
    "Hero B": { weightedLosses: 2.2, losses: 2, appearances: 2 }
  };
  assert.equal(vm.runInContext("rankThreats(stats)[0][0]", context), "Hero B");
});
