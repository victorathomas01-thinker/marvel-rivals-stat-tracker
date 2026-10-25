const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const context = {
  window: { setTimeout() {} },
  chrome: { storage: { local: { get() {} } } },
  structuredClone
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8"), context);

const table = (...rows) => ({
  querySelectorAll() {
    return rows.map(textContent => ({ textContent }));
  }
});
function detect(name, a, b) {
  context.playerName = name;
  context.teamA = table(...a);
  context.teamB = table(...b);
  return vm.runInContext("getPlayerTeam(playerName, teamA, teamB)", context);
}

test("player detection avoids substring collisions across teams", () => {
  assert.equal(detect("Ace", ["Space 12 3", "Tracer 5 2"], ["Ace 7 4"]), "Team B");
  assert.equal(detect("Ace", ["Space 12 3"], ["Racecar 7 4"]), null);
});

test("player detection matches names case-insensitively and handles punctuation literally", () => {
  assert.equal(detect("Zoë", ["ZOË 8 1"], ["Other 3 2"]), "Team A");
  assert.equal(detect("Mr.Km", ["MrXKm 12"], ["Mr.Km 7"]), "Team B");
  assert.equal(detect("a+b", ["aab 12"], ["a+b 7"]), "Team B");
});

test("player detection rejects empty names and still matches ordinary rows", () => {
  assert.equal(detect("  ", ["Ace 5"], ["Bob 3"]), null);
  assert.equal(detect(" MrKilometer ", ["MrKilometer 12 2"], ["Other 4 2"]), "Team A");
});
