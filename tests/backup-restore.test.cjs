const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function workerFixture({ pauseWrites = false, empty = false } = {}) {
  const values = empty ? {} : {
    heroTrackerStats: { Luna: { losses: 1, appearances: 1, weightedLosses: 1, mvpSvpAppearances: 0 } },
    heroTrackerProcessedMatches: ["old"],
    heroTrackerPlayerName: "OldPlayer"
  };
  const queuedWrites = [];
  let failNextSet = false;
  let listener;
  const chrome = {
    runtime: { lastError: null, onMessage: { addListener(fn) { listener = fn; } } },
    storage: { local: {
      get(keys, callback) { callback(Object.fromEntries(keys.map(key => [key, values[key]]))); },
      set(update, callback) {
        const apply = () => {
          Object.assign(values, structuredClone(update));
          if (failNextSet) {
            failNextSet = false;
            chrome.runtime.lastError = { message: "simulated write failure" };
            callback();
            chrome.runtime.lastError = null;
          } else callback();
        };
        if (pauseWrites) queuedWrites.push(apply); else apply();
      },
      remove(keys, callback) { for (const key of keys) delete values[key]; callback(); }
    } }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), { chrome, structuredClone });
  return {
    values, queuedWrites,
    failOnce() { failNextSet = true; },
    send(message) { return new Promise(resolve => assert.equal(listener(message, { id: "extension" }, resolve), true)); }
  };
}

const backup = (overrides = {}) => ({
  schemaVersion: 1,
  exportedAt: "2026-10-31T12:00:00.000Z",
  playerName: "RestoredPlayer",
  stats: { Storm: { losses: 2, appearances: 2, weightedLosses: 2.2, mvpSvpAppearances: 1 } },
  processedMatchIds: ["a", "b"],
  ...overrides
});
const restore = b => ({ type: "heroTracker/restoreBackup", backup: b });
const match = id => ({ type: "heroTracker/recordMatch", matchId: id, outcome: "loss", heroEntries: [{ hero: "Storm", hasAward: false }] });
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test("valid full restore replaces all three keys in one worker operation", async () => {
  const w = workerFixture();
  const result = await w.send(restore(backup()));
  assert.equal(result.ok, true);
  assert.equal(result.status, "restored");
  assert.equal(result.matches, 2);
  assert.deepEqual(w.values.heroTrackerProcessedMatches, ["a", "b"]);
  assert.equal(w.values.heroTrackerStats.Storm.weightedLosses, 2.2);
  assert.equal(w.values.heroTrackerPlayerName, "RestoredPlayer");
  assert.equal(Object.hasOwn(w.values.heroTrackerStats, "Luna"), false);
});

test("invalid backup is rejected before any writes and queue stays healthy", async () => {
  const w = workerFixture();
  const original = structuredClone(w.values);
  const rejected = await w.send(restore(backup({ processedMatchIds: ["a", "a"] })));
  assert.equal(rejected.ok, false);
  assert.deepEqual(w.values, original);
  assert.equal((await w.send(match("new"))).status, "recorded");
});

test("restore waits behind pending match write and next match uses restored state", async () => {
  const w = workerFixture({ pauseWrites: true });
  const first = w.send(match("before"));
  const restoring = w.send(restore(backup()));
  const after = w.send(match("after"));
  await nextTurn();
  assert.equal(w.queuedWrites.length, 1);
  w.queuedWrites.shift()();
  await nextTurn();
  assert.equal(w.queuedWrites.length, 1);
  w.queuedWrites.shift()();
  await nextTurn();
  assert.equal(w.queuedWrites.length, 1);
  w.queuedWrites.shift()();
  await Promise.all([first, restoring, after]);
  assert.deepEqual(w.values.heroTrackerProcessedMatches, ["a", "b", "after"]);
  assert.equal(w.values.heroTrackerStats.Storm.losses, 3);
});

test("failed partial write restores the previous values", async () => {
  const w = workerFixture();
  const original = structuredClone(w.values);
  w.failOnce();
  const result = await w.send(restore(backup()));
  assert.equal(result.ok, false);
  assert.match(result.error, /previous data was restored/);
  assert.deepEqual(w.values, original);
});

test("failed restore removes keys that did not exist before", async () => {
  const w = workerFixture({ empty: true });
  w.failOnce();
  const result = await w.send(restore(backup()));
  assert.equal(result.ok, false);
  assert.deepEqual(w.values, {});
});

test("player setting changes use the same queue as restore", async () => {
  const w = workerFixture();
  const [restored, saved] = await Promise.all([
    w.send(restore(backup())),
    w.send({ type: "heroTracker/setPlayerName", playerName: "NewName" })
  ]);
  assert.equal(restored.ok, true);
  assert.equal(saved.ok, true);
  assert.equal(w.values.heroTrackerPlayerName, "NewName");
});
