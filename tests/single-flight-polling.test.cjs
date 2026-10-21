const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadPollingScript() {
  const scheduled = [];
  const warnings = [];
  const context = {
    window: {
      setTimeout(callback, delay) {
        assert.equal(delay, 500);
        scheduled.push(callback);
      },
      setInterval() { throw new Error("Overlapping setInterval polling is forbidden"); },
      clearInterval() { throw new Error("No interval should be used"); }
    },
    chrome: { storage: { local: { get() {}, set() {} } } },
    structuredClone,
    console: { warn(...args) { warnings.push(args); } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8"), context);
  return { context, scheduled, warnings };
}

test("waitForMatchData: waits for an in-flight attempt before scheduling another", async () => {
  const { context, scheduled } = loadPollingScript();
  let resolveFirst;
  let calls = 0;
  context.processMatch = () => {
    calls += 1;
    return new Promise((resolve) => { resolveFirst = resolve; });
  };

  assert.equal(scheduled.length, 1);
  const first = scheduled.shift()();
  assert.equal(calls, 1);
  assert.equal(scheduled.length, 0, "must not queue a second attempt while storage is pending");

  resolveFirst(false);
  await first;
  assert.equal(scheduled.length, 1, "retry only after previous attempt finishes");

  context.processMatch = async () => { calls += 1; return true; };
  await scheduled.shift()();
  assert.equal(calls, 2);
  assert.equal(scheduled.length, 0, "stop polling after a processed match");
});

test("waitForMatchData: retries a transient processing failure", async () => {
  const { context, scheduled, warnings } = loadPollingScript();
  context.processMatch = async () => { throw new Error("temporary storage failure"); };

  await scheduled.shift()();
  assert.equal(warnings.length, 1);
  assert.equal(scheduled.length, 1, "a transient rejection must not abandon the match");

  context.processMatch = async () => true;
  await scheduled.shift()();
  assert.equal(scheduled.length, 0);
});

test("waitForMatchData: stops after twenty unsuccessful attempts", async () => {
  const { context, scheduled } = loadPollingScript();
  let calls = 0;
  context.processMatch = async () => { calls += 1; return false; };

  for (let i = 0; i < 20; i += 1) {
    assert.equal(scheduled.length, 1);
    await scheduled.shift()();
  }

  assert.equal(calls, 20);
  assert.equal(scheduled.length, 0);
});
