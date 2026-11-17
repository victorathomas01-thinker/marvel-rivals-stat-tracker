const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function load(context, file) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
}

test("analytics count distinct encounters, filter by player, and omit draws and small samples", () => {
  const context = vm.createContext({ structuredClone });
  load(context, "match-data.js");
  const stats = { heroTrackerStats: { Legacy: { losses: 2, appearances: 2, weightedLosses: 2, mvpSvpAppearances: 0 } } };
  for (let i = 0; i < 5; i += 1) {
    stats["heroTrackerMatch:" + i] = {
      player: "player", outcome: i < 2 ? "loss" : "win",
      heroes: [
        { hero: "Storm", weight: 1, hasAward: false },
        { hero: "Storm", weight: 1.2, hasAward: true },
        ...(i === 0 ? [{ hero: "Hulk", weight: 1, hasAward: false }] : [])
      ]
    };
  }
  stats["heroTrackerMatch:draw"] = { player: "player", outcome: "draw", heroes: [{ hero: "Storm" }] };
  stats["heroTrackerMatch:other"] = { player: "someone else", outcome: "loss", heroes: [{ hero: "Storm" }] };
  const results = context.summarizeMatchups(stats, " Player ");
  assert.equal(results.length, 1);
  assert.equal(results[0].hero, "Storm");
  assert.equal(results[0].rate, 0.4);
  assert.ok(results[0].low < 0.4 && results[0].high > 0.4);
  assert.equal(context.weightedStats(stats, "player").Legacy.losses, 2);
});

test("two tabs recording the same match only write once", async () => {
  const stored = {};
  let listener;
  let writes = 0;
  const reads = [];
  const context = vm.createContext({ importScripts: () => {}, chrome: {
    runtime: { onMessage: { addListener: (fn) => { listener = fn; } }, getURL: (file) => "chrome-extension://test/" + file },
    storage: { local: {
      get: async (keys) => {
        reads.push(keys);
        return keys === null ? { ...stored } : Object.fromEntries(
          keys.filter((key) => Object.hasOwn(stored, key)).map((key) => [key, stored[key]]));
      },
      set: async (values) => { writes += 1; Object.assign(stored, values); },
      remove: async (keys) => keys.forEach((key) => delete stored[key])
    } }
  } });
  load(context, "match-data.js");
  load(context, "background.js");
  const match = { player: "player", id: "test", outcome: "win", heroes: [] };
  const record = () => new Promise((resolve) => listener({ type: "recordMatch", match },
    { url: "https://tracker.gg/marvel-rivals/matches/test" }, resolve));
  const results = await Promise.all([record(), record()]);
  assert.deepEqual(results.map((result) => result.duplicate), [false, true]);
  assert.equal(writes, 1);
  assert.equal(reads.length, 2);
  assert.ok(reads.every((keys) => keys.length === 2 && keys.includes("heroTrackerProcessedMatches")));
  await new Promise((resolve) => listener({ type: "clearMatches" },
    { url: "chrome-extension://test/popup.html" }, resolve));
  assert.deepEqual(Object.keys(stored), []);
});

test("exact profile labels reject substring and ambiguous team matches", () => {
  const context = vm.createContext({ window: { setTimeout: () => {} } });
  load(context, "content.js");
  const table = (name) => ({ querySelectorAll: () => [{
    querySelectorAll: () => [{ textContent: name }],
    cells: [{ textContent: "Unrelated Player text" }]
  }] });
  assert.equal(context.getPlayerTeam("player", table("PlayerTwo"), table(" PLAYER ")), "Team B");
  assert.equal(context.getPlayerTeam("Player", table("Player"), table("Player")), null);
  assert.equal(context.getPlayerTeam("Player", table("PlayerTwo"), table("Other")), null);
});

test("history export scopes records and represents missing legacy fields", () => {
  const context = vm.createContext({});
  load(context, "match-data.js");
  const record = { player: "player", outcome: "win", heroes: [] };
  const history = context.exportMatchHistory({
    "heroTrackerMatch:old": { ...record, id: "old" },
    "heroTrackerMatch:new": { ...record, id: "new", recordedAt: "2026-11-16T12:00:00Z",
      playerScore: 2, opponentScore: 0 },
    "heroTrackerMatch:other": { ...record, id: "other", player: "other" },
  }, "player");
  assert.deepEqual(JSON.parse(JSON.stringify(history)), { schemaVersion: 1, matches: [
    { id: "new", outcome: "win", recordedAt: "2026-11-16T12:00:00Z",
      playerScore: 2, opponentScore: 0, heroes: [] },
    { id: "old", outcome: "win", recordedAt: null, playerScore: null, opponentScore: null, heroes: [] }
  ] });
});

test("an export reproduces the live matchup rates and rejects duplicate records", () => {
  const context = vm.createContext({});
  load(context, "match-data.js");
  const records = Object.fromEntries(Array.from({ length: 5 }, (_, index) => [
    "heroTrackerMatch:" + index,
    { id: String(index), player: "player", outcome: index < 4 ? "loss" : "win",
      heroes: [{ hero: "Storm", weight: 1, hasAward: false }] }
  ]));
  const payload = context.exportMatchHistory(records, "player");
  assert.deepEqual(context.rankMatchups(context.readHistory(payload)), context.summarizeMatchups(records, "player"));
  assert.throws(() => context.readHistory({ schemaVersion: 1, matches: [...payload.matches, payload.matches[0]] }),
    /Invalid match record/);
});

test("scores require a complete nonnegative safe integer", () => {
  const label = { textContent: "Team A" };
  const value = { textContent: " 2 " };
  const entry = { querySelector: (selector) => selector === ".label" ? label : value };
  const document = { querySelector: () => ({ querySelectorAll: () => [entry] }) };
  const context = vm.createContext({ document, window: { setTimeout: () => {} } });
  load(context, "content.js");
  assert.equal(context.getTeamScore("Team A"), 2);
  for (const text of ["2–1", "-1", "2 OT", "9007199254740993", ""]) {
    value.textContent = text;
    assert.equal(context.getTeamScore("Team A"), null);
  }
});
