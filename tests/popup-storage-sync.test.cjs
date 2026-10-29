const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const stat = (losses) => ({ losses, appearances: losses, weightedLosses: losses, mvpSvpAppearances: 0 });

function loadPopup(initialStats = {}) {
  const values = { heroTrackerStats: initialStats, heroTrackerProcessedMatches: ["old-match"], heroTrackerPlayerName: "Tester" };
  const listeners = [];
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) {
      const element = {
        value: "", textContent: "", innerHTML: "", children: [],
        appendChild(child) { this.children.push(child); },
        addEventListener(type, callback) { this[type] = callback; }
      };
      elements.set(id, element);
    }
    return elements.get(id);
  };
  const chrome = { storage: {
    local: {
      get(keys, callback) {
        const requested = Array.isArray(keys) ? keys : [keys];
        callback(Object.fromEntries(requested.map(key => [key, values[key]])));
      },
      set(update, callback) { Object.assign(values, update); callback?.(); },
      remove(keys, callback) { for (const key of keys) delete values[key]; callback?.(); }
    },
    onChanged: { addListener(listener) { listeners.push(listener); } }
  }, runtime: {
    lastError: null,
    sendMessage(message, callback) {
      assert.equal(message.type, "heroTracker/clearData");
      for (const key of ["heroTrackerStats", "heroTrackerProcessedMatches"]) delete values[key];
      callback({ ok: true, status: "cleared" });
    }
  }};
  const context = {
    chrome, confirm: () => true,
    document: { getElementById: getElement, createElement: () => ({ className: "", textContent: "", innerHTML: "" }) }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "popup.js"), "utf8"), context);
  const exports = [];
  context.download = (filename, content) => exports.push({ filename, content });
  return {
    chrome, values, exports, getElement,
    click(id) { getElement(id).click(); },
    change(update, areaName = "local") {
      const changes = {};
      for (const [key, value] of Object.entries(update)) {
        changes[key] = { oldValue: values[key], newValue: value };
        values[key] = value;
      }
      for (const listener of listeners) listener(changes, areaName);
    }
  };
}

test("popup refreshes threat list and match count after another tab writes", () => {
  const popup = loadPopup({ Luna: stat(1) });
  assert.equal(popup.getElement("matchCount").textContent, "1 matches seen");
  popup.change({ heroTrackerStats: { Storm: stat(3) }, heroTrackerProcessedMatches: ["one", "two"] });
  assert.equal(popup.getElement("matchCount").textContent, "2 matches seen");
  assert.match(popup.getElement("threatList").children.at(-1).innerHTML, /Storm/);
});

test("export buttons read fresh storage rather than initial popup snapshot", () => {
  const popup = loadPopup({ Luna: stat(1) });
  // Simulate a write between popup load and the export click.
  popup.values.heroTrackerStats = { Storm: stat(4) };
  popup.click("exportJson");
  popup.click("exportCsv");
  assert.equal(JSON.parse(popup.exports[0].content).Storm.losses, 4);
  assert.equal(Object.hasOwn(JSON.parse(popup.exports[0].content), "Luna"), false);
  assert.match(popup.exports[1].content, /"Storm","4"/);
  assert.doesNotMatch(popup.exports[1].content, /Luna/);
});

test("clear data also clears popup state and subsequent exports", () => {
  const popup = loadPopup({ Luna: stat(2) });
  popup.click("clearData");
  assert.equal(popup.getElement("matchCount").textContent, "0 matches seen");
  assert.equal(popup.getElement("threatList").children.at(-1).textContent, "No loss data recorded yet.");
  popup.click("exportJson");
  popup.click("exportCsv");
  assert.deepEqual(JSON.parse(popup.exports[0].content), {});
  assert.equal(popup.exports[1].content.split("\n").length, 1);
  assert.equal(popup.values.heroTrackerStats, undefined);
});

test("corrupt statistics show a recovery message without disabling JSON backup or Clear Data", () => {
  const corrupt = { Storm: { losses: 2, appearances: 2, weightedLosses: "bad", mvpSvpAppearances: 0 } };
  const popup = loadPopup(corrupt);
  assert.match(popup.getElement("threatList").children.at(-1).textContent, /Export JSON before clearing/);
  assert.equal(popup.getElement("matchCount").textContent, "Stored data needs repair");
  popup.click("exportJson");
  assert.deepEqual(JSON.parse(popup.exports[0].content), corrupt);
  popup.click("exportCsv");
  assert.equal(popup.exports.length, 1, "invalid data must not be exported as numeric CSV");
  assert.match(popup.getElement("saveStatus").textContent, /Export JSON instead/);
  popup.click("clearData");
  assert.equal(popup.getElement("matchCount").textContent, "0 matches seen");
  assert.equal(popup.values.heroTrackerStats, undefined);
});

test("null processed-match history displays a repair warning", () => {
  const popup = loadPopup({ Storm: stat(1) });
  popup.change({ heroTrackerProcessedMatches: null });
  assert.equal(popup.getElement("matchCount").textContent, "Stored data needs repair");
});

test("full backup captures fresh statistics, processed IDs, and player name without changing legacy JSON", () => {
  const popup = loadPopup({ Luna: stat(1) });
  popup.values.heroTrackerStats = { Storm: stat(3) };
  popup.values.heroTrackerProcessedMatches = ["match-a", "match-b"];
  popup.values.heroTrackerPlayerName = "NewPlayer";
  popup.click("exportBackup");
  assert.equal(popup.exports[0].filename, "marvel-rivals-full-backup.json");
  const backup = JSON.parse(popup.exports[0].content);
  assert.equal(backup.schemaVersion, 1);
  assert.match(backup.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(backup.stats.Storm.losses, 3);
  assert.equal(Object.hasOwn(backup.stats, "Luna"), false);
  assert.deepEqual(backup.processedMatchIds, ["match-a", "match-b"]);
  assert.equal(backup.playerName, "NewPlayer");
  popup.click("exportJson");
  assert.deepEqual(JSON.parse(popup.exports[1].content), { Storm: stat(3) });
});

test("full backup preserves malformed data for recovery rather than silently normalizing it", () => {
  const corrupt = { Storm: { losses: "bad", weightedLosses: null } };
  const popup = loadPopup(corrupt);
  popup.values.heroTrackerProcessedMatches = null;
  popup.click("exportBackup");
  const backup = JSON.parse(popup.exports[0].content);
  assert.deepEqual(backup.stats, corrupt);
  assert.equal(backup.processedMatchIds, null);
  assert.equal(popup.values.heroTrackerProcessedMatches, null);
});

test("full backup fails closed on a storage read error", () => {
  const popup = loadPopup({ Storm: stat(1) });
  popup.chrome.runtime.lastError = { message: "Storage unavailable" };
  popup.click("exportBackup");
  assert.equal(popup.exports.length, 0);
  assert.match(popup.getElement("saveStatus").textContent, /Unable to read backup data/);
});

test("full backup after clearing includes empty records and retained player setting", () => {
  const popup = loadPopup({ Storm: stat(1) });
  popup.click("clearData");
  popup.click("exportBackup");
  const backup = JSON.parse(popup.exports[0].content);
  assert.deepEqual(backup.stats, {});
  assert.deepEqual(backup.processedMatchIds, []);
  assert.equal(backup.playerName, "Tester");
});
