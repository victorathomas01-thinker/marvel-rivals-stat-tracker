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

test("content.js: filters rank images and deduplicates heroes per row", () => {
  const context = loadScript("content.js");
  const img = (src, alt) => ({ getAttribute(key) { return key === "src" ? src : alt; } });
  context.table = { querySelectorAll() {
    return [{ textContent: "MVP", querySelectorAll() {
      return [img("/heroes/luna.png", "Luna Snow"), img("/heroes/luna.png", "Luna Snow"), img("/ranks/gold.png", "Gold")];
    }}];
  }};
  const entries = JSON.parse(JSON.stringify(vm.runInContext("extractHeroEntries(table)", context)));
  assert.deepEqual(entries, [{ hero: "Luna Snow", weight: 1.2, hasAward: true }]);
});

test("content.js: weighted stats update leaves original untouched", () => {
  const context = loadScript("content.js");
  context.stats = { "Luna Snow": { losses: 1, appearances: 1, weightedLosses: 1, mvpSvpAppearances: 0 } };
  context.entries = [{ hero: "Luna Snow", weight: 1.2, hasAward: true }];
  const updated = JSON.parse(JSON.stringify(vm.runInContext("updateStats(stats, entries)", context)));
  assert.deepEqual(updated["Luna Snow"], { losses: 2, appearances: 2, weightedLosses: 2.2, mvpSvpAppearances: 1 });
  assert.equal(context.stats["Luna Snow"].losses, 1);
});

test("content.js: overlay escapes hero labels and messages", () => {
  const context = loadScript("content.js");
  let overlay;
  context.document = {
    getElementById() { return null; },
    createElement() { return { querySelector() { return { addEventListener() {} }; } }; },
    body: { appendChild(element) { overlay = element; } }
  };
  context.stats = { "<img src=x>": { weightedLosses: 1, losses: 1, appearances: 1 } };
  context.message = "<script>alert(1)</script>";
  vm.runInContext("renderOverlay(stats, message)", context);
  assert.ok(overlay.innerHTML.includes("&lt;img src=x&gt;"));
  assert.ok(overlay.innerHTML.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
});

test("popup.js: hero labels are escaped in threat list", () => {
  const context = loadScript("popup.js");
  const items = [];
  const list = { innerHTML: "", appendChild(item) { items.push(item); } };
  context.document = {
    getElementById(id) { return id === "threatList" ? list : { textContent: "" }; },
    createElement() { return {}; }
  };
  context.stats = { "<img src=x>": { weightedLosses: 1, losses: 1, appearances: 1 } };
  vm.runInContext("renderStats(stats, [])", context);
  assert.equal(items.length, 1);
  assert.ok(items[0].innerHTML.includes("&lt;img src=x&gt;"));
});
