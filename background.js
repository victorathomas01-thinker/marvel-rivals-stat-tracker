// All match writes and Clear Data requests pass through this single MV3 worker.
// Chrome storage has no atomic read-modify-write primitive across content-script tabs.
const KEYS = {
  stats: "heroTrackerStats",
  processed: "heroTrackerProcessedMatches",
  playerName: "heroTrackerPlayerName"
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

function validateStoredData(stats, processed) {
  const validRecord = (record) => record !== null && typeof record === "object" && !Array.isArray(record) &&
    ["losses", "appearances", "mvpSvpAppearances"].every((key) =>
      Number.isSafeInteger(record[key]) && record[key] >= 0) &&
    Number.isFinite(record.weightedLosses) && record.weightedLosses >= 0;
  if (!stats || typeof stats !== "object" || Array.isArray(stats) ||
      !Object.values(stats).every(validRecord) ||
      !Array.isArray(processed) || !processed.every((id) => typeof id === "string" && id.length > 0)) {
    // Never silently reset processed IDs or write NaN into existing hero totals.
    throw new Error("Stored tracker data is invalid. Back up the data before clearing it.");
  }
}

// Validate in the worker too: popup preflight is advisory, never a trust boundary.
function validateBackup(backup) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup) ||
      backup.schemaVersion !== 1 ||
      typeof backup.exportedAt !== "string" || !Number.isFinite(Date.parse(backup.exportedAt)) ||
      typeof backup.playerName !== "string" || !backup.playerName.trim() ||
      backup.playerName.length > 2048 ||
      !Array.isArray(backup.processedMatchIds) || backup.processedMatchIds.length > MAX_PROCESSED_MATCHES ||
      backup.processedMatchIds.some(id => typeof id !== "string" || !id || id.length > 2048) ||
      new Set(backup.processedMatchIds).size !== backup.processedMatchIds.length) {
    throw new Error("Invalid full backup; no data was restored.");
  }
  validateStoredData(backup.stats, backup.processedMatchIds);
  if (Object.keys(backup.stats).length > 1000 ||
      Object.entries(backup.stats).some(([hero]) => !hero.trim() || hero.length > 200)) {
    throw new Error("Invalid hero names in full backup; no data was restored.");
  }
}

// This operation shares the match/clear queue. A failed storage write triggers
// best-effort rollback of both existing values and previously absent keys.
async function restoreBackup(backup) {
  validateBackup(backup);
  const keys = [KEYS.stats, KEYS.processed, KEYS.playerName];
  const before = await getStored(keys);
  const replacement = {
    [KEYS.stats]: backup.stats,
    [KEYS.processed]: backup.processedMatchIds,
    [KEYS.playerName]: backup.playerName
  };
  try {
    await setStored(replacement);
  } catch (error) {
    const existing = Object.fromEntries(Object.entries(before).filter(([, value]) => value !== undefined));
    const absent = keys.filter(key => before[key] === undefined);
    try {
      if (Object.keys(existing).length) await setStored(existing);
      if (absent.length) await removeStored(absent);
    } catch (rollbackError) {
      throw new Error("Restore failed and rollback also failed. Export a full backup before further changes.");
    }
    throw new Error("Restore failed; previous data was restored. " + error.message);
  }
  return { status: "restored", matches: backup.processedMatchIds.length, heroes: Object.keys(backup.stats).length };
}

async function savePlayerName(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) {
    throw new Error("Invalid player name.");
  }
  await setStored({ [KEYS.playerName]: value.trim() });
  return { status: "saved" };
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
  const processed = stored[KEYS.processed] === undefined ? [] : stored[KEYS.processed];
  const stats = stored[KEYS.stats] === undefined ? {} : stored[KEYS.stats];
  validateStoredData(stats, processed);
  if (processed.includes(matchId)) return { status: "duplicate", stats };

  const updates = {
    [KEYS.processed]: [...processed, matchId].slice(-MAX_PROCESSED_MATCHES)
  };
  if (outcome === "loss") updates[KEYS.stats] = addHeroEntries(stats, entries);
  await setStored(updates);
  return { status: "recorded", stats: updates[KEYS.stats] || stats };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;
  if (!["heroTracker/recordMatch", "heroTracker/clearData", "heroTracker/restoreBackup",
         "heroTracker/setPlayerName"].includes(type)) {
    return false;
  }
  serialize(() => {
    if (type === "heroTracker/clearData") {
      return removeStored([KEYS.stats, KEYS.processed]).then(() => ({ status: "cleared" }));
    }
    if (type === "heroTracker/restoreBackup") return restoreBackup(message.backup);
    if (type === "heroTracker/setPlayerName") return savePlayerName(message.playerName);
    return recordMatch(message);
  }).then(
    (result) => sendResponse({ ok: true, ...result }),
    (error) => sendResponse({ ok: false, error: error.message })
  );
  return true; // Keep the message channel open while the serialized write completes.
});
