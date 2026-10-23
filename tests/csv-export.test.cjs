const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function exportCsv(stats) {
  const context = { chrome: { storage: { local: { get() {} } } }, stats };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf8"), context);
  return vm.runInContext("toCsv(stats)", context);
}

const row = { losses: 2, appearances: 2, weightedLosses: 2.2, mvpSvpAppearances: 1 };

test("CSV export neutralizes spreadsheet formulas in hero names", () => {
  const names = ["=1+1", "+SUM(1,1)", "-2+3", "@SUM(1,1)"];
  const csv = exportCsv(Object.fromEntries(names.map(name => [name, row])));
  for (const name of names) {
    assert.ok(csv.includes(`"'${name}"`), `missing safe CSV cell for ${name}`);
  }
});

test("CSV export handles leading whitespace and control characters", () => {
  const names = ["  =1+1", "\t=1+1", "\r=1+1", "\n=1+1"];
  const csv = exportCsv(Object.fromEntries(names.map(name => [name, row])));
  for (const name of names) {
    assert.ok(csv.includes(`"'${name}"`), `missing safe CSV cell for ${JSON.stringify(name)}`);
  }
});

test("CSV export preserves ordinary names, numeric values, and quote escaping", () => {
  const csv = exportCsv({ 'Luna "Snow", MVP': row });
  assert.ok(csv.startsWith('"Hero","Losses","Appearances","Weighted Losses","MVP/SVP Appearances"\n'));
  assert.ok(csv.includes('"Luna ""Snow"", MVP","2","2","2.2","1"'));
  assert.ok(!csv.includes('"\'Luna'));
});
