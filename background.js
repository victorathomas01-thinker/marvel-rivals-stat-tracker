// All match writes and Clear Data requests pass through this single MV3 worker.
// Chrome storage has no atomic read-modify-write primitive across content-script tabs.
const KEYS = {
  stats: "heroTrackerStats",
  processed: "heroTrackerProcessedMatches"
};
const MAX_PROCESSED_MATCHES = 500;
let pending = Promise.resolve();

function serialize(operation) {
  const result = pending.then(operation);
  pending = result.catch(() => {});
  return result;
}

function getStored(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (values) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(values);
    });
  });
}

function setStored(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function removeStored(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keys, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    });
  });
}

function addHeroEntries(currentStats, entries) {
  const next = structuredClone(currentStats || {});
  for (const { hero, hasAward } of entries) {
    if (!Object.hasOwn(next, hero)) {
      Object.defineProperty(next, hero, {
        value: { losses: 0, appearances: 0, weightedLosses: 0, mvpSvpAppearances: 0 },
        enumerable: true, writable: true, configurable: true
      });
    }
    const record = next[hero];
    record.losses += 1;
    record.appearances += 1;
    record.weightedLosses = Number((record.weightedLosses + (hasAward ? 1.2 : 1)).toFixed(2));
    if (hasAward) record.mvpSvpAppearances += 1;
  }
  return next;
}

async function recordMatch(message) {
  const { matchId, outcome } = message;
  if (typeof matchId !== "string" || !matchId || matchId.length > 2048 ||
      !["win", "draw", "loss"].includes(outcome)) {
    throw new Error("Invalid match request.");
  }

  const entries = message.heroEntries;
  if (outcome === "loss" &&
      (!Array.isArray(entries) || entries.length === 0 || entries.length > 120 ||
       entries.some((entry) => !entry || typeof entry.hero !== "string" ||
         !entry.hero.trim() || entry.hero.length > 200 || typeof entry.hasAward !== "boolean"))) {
    throw new Error("Invalid opponent hero data.");
  }

  // This read, duplicate check, and write are serialized with all other requests.
  const stored = await getStored([KEYS.stats, KEYS.processed]);
  const processed = Array.isArray(stored[KEYS.processed]) ? stored[KEYS.processed] : [];
  const stats = stored[KEYS.stats] || {};
  if (processed.includes(matchId)) return { status: "duplicate", stats };

  const updates = {
    [KEYS.processed]: [...processed, matchId].slice(-MAX_PROCESSED_MATCHES)
  };
  if (outcome === "loss") updates[KEYS.stats] = addHeroEntries(stats, entries);
  await setStored(updates);
  return { status: "recorded", stats: updates[KEYS.stats] || stats };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "heroTracker/recordMatch" && message?.type !== "heroTracker/clearData") {
    return false;
  }
  serialize(() => message.type === "heroTracker/clearData"
    ? removeStored([KEYS.stats, KEYS.processed]).then(() => ({ status: "cleared" }))
    : recordMatch(message)
  ).then(
    (result) => sendResponse({ ok: true, ...result }),
    (error) => sendResponse({ ok: false, error: error.message })
  );
  return true; // Keep the message channel open while the serialized write completes.
});
