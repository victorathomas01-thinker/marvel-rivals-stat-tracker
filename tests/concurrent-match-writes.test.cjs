const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadWorker({ pauseWrites = false } = {}) {
  const values = { heroTrackerStats: {}, heroTrackerProcessedMatches: [] };
  const writes = [];
  let listener;
  const chrome = {
    runtime: {
      lastError: null,
      onMessage: { addListener(callback) { listener = callback; } }
    },
    storage: {
      local: {
        get(keys, callback) {
          callback(Object.fromEntries(keys.map(key => [key, values[key]])));
        },
        set(update, callback) {
          const apply = () => { Object.assign(values, structuredClone(update)); callback(); };
          if (pauseWrites) writes.push(apply);
          else apply();
        },
        remove(keys, callback) {
          for (const key of keys) delete values[key];
          callback();
        }
      }
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), {
    chrome, structuredClone
  });
  return {
    values, writes,
    send(message) {
      return new Promise((resolve) => {
        assert.equal(listener(message, { id: "extension" }, resolve), true);
      });
    }
  };
}

const loss = (matchId, hero, hasAward = false) => ({
  type: "heroTracker/recordMatch", matchId, outcome: "loss",
  heroEntries: [{ hero, hasAward }]
});
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test("concurrent match tabs cannot overwrite each other's hero stats or match IDs", async () => {
  const worker = loadWorker({ pauseWrites: true });
  const first = worker.send(loss("match-a", "Luna Snow", true));
  const second = worker.send(loss("match-b", "Luna Snow"));
  await nextTurn();
  assert.equal(worker.writes.length, 1, "second write must wait for first to finish");
  worker.writes.shift()();
  await nextTurn();
  assert.equal(worker.writes.length, 1, "second write must use freshly stored data");
  worker.writes.shift()();
  assert.equal((await first).status, "recorded");
  assert.equal((await second).status, "recorded");
  assert.deepEqual(worker.values.heroTrackerProcessedMatches, ["match-a", "match-b"]);
  assert.deepEqual(worker.values.heroTrackerStats["Luna Snow"], {
    losses: 2, appearances: 2, weightedLosses: 2.2, mvpSvpAppearances: 1
  });
});

test("simultaneous requests for the same match are counted only once", async () => {
  const worker = loadWorker();
  const [first, second] = await Promise.all([
    worker.send(loss("same-match", "__proto__", true)),
    worker.send(loss("same-match", "__proto__", true))
  ]);
  assert.equal(first.status, "recorded");
  assert.equal(second.status, "duplicate");
  assert.equal(worker.values.heroTrackerProcessedMatches.length, 1);
  assert.equal(Object.hasOwn(worker.values.heroTrackerStats, "__proto__"), true);
  assert.equal(worker.values.heroTrackerStats["__proto__"].weightedLosses, 1.2);
});

test("clear-data is ordered with pending match writes", async () => {
  const worker = loadWorker({ pauseWrites: true });
  const first = worker.send(loss("before-clear", "Storm"));
  const clear = worker.send({ type: "heroTracker/clearData" });
  const second = worker.send(loss("after-clear", "Luna Snow"));
  await nextTurn();
  assert.equal(worker.writes.length, 1);
  worker.writes.shift()();
  await nextTurn();
  assert.equal((await clear).status, "cleared");
  assert.equal(worker.writes.length, 1);
  worker.writes.shift()();
  await Promise.all([first, second]);
  assert.deepEqual(worker.values.heroTrackerProcessedMatches, ["after-clear"]);
  assert.equal(Object.hasOwn(worker.values.heroTrackerStats, "Storm"), false);
  assert.equal(worker.values.heroTrackerStats["Luna Snow"].losses, 1);
});

test("invalid requests do not poison the worker queue", async () => {
  const worker = loadWorker();
  const rejected = await worker.send({ type: "heroTracker/recordMatch", matchId: "x", outcome: "loss", heroEntries: [] });
  assert.equal(rejected.ok, false);
  const accepted = await worker.send({ type: "heroTracker/recordMatch", matchId: "win", outcome: "win" });
  assert.equal(accepted.ok, true);
  assert.deepEqual(worker.values.heroTrackerProcessedMatches, ["win"]);
});

test("invalid processed-match history cannot be silently reset by a new write", async () => {
  const worker = loadWorker();
  worker.values.heroTrackerProcessedMatches = { 0: "already-recorded" };
  const original = structuredClone(worker.values);
  const response = await worker.send(loss("new-match", "Storm"));
  assert.equal(response.ok, false);
  assert.match(response.error, /Stored tracker data is invalid/);
  assert.deepEqual(worker.values, original);
});

test("malformed hero totals cannot produce NaN or overwrite stored data", async () => {
  const worker = loadWorker();
  worker.values.heroTrackerStats.Storm = { losses: 2, appearances: 2, weightedLosses: "2", mvpSvpAppearances: 0 };
  const original = structuredClone(worker.values);
  const response = await worker.send(loss("new-match", "Storm"));
  assert.equal(response.ok, false);
  assert.deepEqual(worker.values, original);
});

test("after rejecting corrupt storage, Clear Data restores normal writes", async () => {
  const worker = loadWorker();
  worker.values.heroTrackerProcessedMatches = "bad history";
  assert.equal((await worker.send(loss("first", "Storm"))).ok, false);
  assert.equal((await worker.send({ type: "heroTracker/clearData" })).ok, true);
  const accepted = await worker.send(loss("second", "Storm"));
  assert.equal(accepted.status, "recorded");
  assert.equal(worker.values.heroTrackerStats.Storm.weightedLosses, 1);
  assert.deepEqual(worker.values.heroTrackerProcessedMatches, ["second"]);
});

test("null stored values are rejected rather than treated as missing", async () => {
  const worker = loadWorker();
  worker.values.heroTrackerProcessedMatches = null;
  const response = await worker.send(loss("new-match", "Storm"));
  assert.equal(response.ok, false);
  assert.equal(worker.values.heroTrackerProcessedMatches, null);
  assert.equal(Object.hasOwn(worker.values.heroTrackerStats, "Storm"), false);
});
