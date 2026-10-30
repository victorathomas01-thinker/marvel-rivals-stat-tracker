const STORAGE_KEYS = {
  stats: "heroTrackerStats",
  processedMatches: "heroTrackerProcessedMatches",
  playerName: "heroTrackerPlayerName"
};

const DEFAULT_PLAYER_NAME = "MrKilometer";

function rankThreats(stats) {
  return Object.entries(stats || {}).sort(([, a], [, b]) =>
    b.weightedLosses - a.weightedLosses ||
    b.losses - a.losses ||
    b.appearances - a.appearances
  );
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value) {
  const text = String(value);
  // Quoting alone does not prevent spreadsheet formula interpretation.
  const unsafe = /^[\t\r\n]/.test(text) || /^\s*[=+\-@]/.test(text);
  return '"' + (unsafe ? "'" + text : text).replaceAll('"', '""') + '"';
}

function toCsv(stats) {
  const rows = [["Hero", "Losses", "Appearances", "Weighted Losses", "MVP/SVP Appearances"]];
  for (const [hero, data] of rankThreats(stats)) {
    rows.push([hero, data.losses, data.appearances, data.weightedLosses, data.mvpSvpAppearances]);
  }
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function isValidSnapshot(stats, processedMatches) {
  return !!stats && typeof stats === "object" && !Array.isArray(stats) &&
    Object.values(stats).every((record) => record !== null && typeof record === "object" &&
      !Array.isArray(record) &&
      ["losses", "appearances", "mvpSvpAppearances"].every((key) =>
        Number.isSafeInteger(record[key]) && record[key] >= 0) &&
      Number.isFinite(record.weightedLosses) && record.weightedLosses >= 0) &&
    Array.isArray(processedMatches) &&
    processedMatches.every((id) => typeof id === "string" && id.length > 0);
}

// Preflight is deliberately read-only. Restoring must use the serialized worker
// rather than writing chrome.storage.local directly from this popup.
function checkBackupDocument(backup) {
  if (!backup || typeof backup !== "object" || Array.isArray(backup)) {
    throw new Error("Expected a full-backup JSON object.");
  }
  if (backup.schemaVersion !== 1) {
    throw new Error("Unsupported backup version.");
  }
  if (typeof backup.exportedAt !== "string" || !Number.isFinite(Date.parse(backup.exportedAt))) {
    throw new Error("Missing or invalid backup timestamp.");
  }
  if (typeof backup.playerName !== "string" || !backup.playerName.trim() || backup.playerName.length > 2048) {
    throw new Error("Invalid saved player name.");
  }
  if (!isValidSnapshot(backup.stats, backup.processedMatchIds) ||
      backup.processedMatchIds.length > 500 ||
      backup.processedMatchIds.some((id) => id.length > 2048) ||
      new Set(backup.processedMatchIds).size !== backup.processedMatchIds.length) {
    throw new Error("Backup contains malformed tracking data; preserve it for troubleshooting.");
  }
  return `Backup checked: ${backup.processedMatchIds.length} matches and ${Object.keys(backup.stats).length} heroes. Nothing imported.`;
}

function renderStats(stats, processedMatches) {
  const list = document.getElementById("threatList");
  list.innerHTML = "";

  if (!isValidSnapshot(stats, processedMatches)) {
    const warning = document.createElement("li");
    warning.className = "empty";
    warning.textContent = "Stored data needs repair. Export JSON before clearing data.";
    list.appendChild(warning);
    document.getElementById("matchCount").textContent = "Stored data needs repair";
    return;
  }

  const ranked = rankThreats(stats).slice(0, 5);
  if (!ranked.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No loss data recorded yet.";
    list.appendChild(empty);
  } else {
    ranked.forEach(([hero, data], index) => {
      const item = document.createElement("li");
      item.innerHTML = `
        <span class="rank">${index + 1}</span>
        <span class="hero">${escapeHtml(hero)}</span>
        <span class="score">${data.weightedLosses.toFixed(1)}</span>
      `;
      list.appendChild(item);
    });
  }

  document.getElementById("matchCount").textContent = `${processedMatches.length} matches seen`;
}

chrome.storage.local.get(Object.values(STORAGE_KEYS), (stored) => {
  let stats = stored[STORAGE_KEYS.stats] === undefined ? {} : stored[STORAGE_KEYS.stats];
  let processedMatches = stored[STORAGE_KEYS.processedMatches] === undefined ? [] : stored[STORAGE_KEYS.processedMatches];
  const playerName = stored[STORAGE_KEYS.playerName] || DEFAULT_PLAYER_NAME;

  document.getElementById("playerName").value = playerName;
  renderStats(stats, processedMatches);

  // Other match tabs can update storage while this popup is open.
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (!Object.hasOwn(changes, STORAGE_KEYS.stats) &&
        !Object.hasOwn(changes, STORAGE_KEYS.processedMatches)) return;
    if (Object.hasOwn(changes, STORAGE_KEYS.stats)) stats = changes[STORAGE_KEYS.stats].newValue === undefined ? {} : changes[STORAGE_KEYS.stats].newValue;
    if (Object.hasOwn(changes, STORAGE_KEYS.processedMatches)) processedMatches = changes[STORAGE_KEYS.processedMatches].newValue === undefined ? [] : changes[STORAGE_KEYS.processedMatches].newValue;
    renderStats(stats, processedMatches);
  });

  document.getElementById("savePlayer").addEventListener("click", () => {
    const value = document.getElementById("playerName").value.trim();
    if (!value) return;
    chrome.storage.local.set({ [STORAGE_KEYS.playerName]: value }, () => {
      document.getElementById("saveStatus").textContent = "Player name saved.";
    });
  });

  document.getElementById("exportJson").addEventListener("click", () => {
    chrome.storage.local.get([STORAGE_KEYS.stats], (latest) => {
      download("marvel-rivals-threats.json", JSON.stringify(latest[STORAGE_KEYS.stats] === undefined ? {} : latest[STORAGE_KEYS.stats], null, 2), "application/json");
    });
  });

  // Keep the legacy statistics-only JSON export unchanged for existing users.
  // A full backup captures the other keys needed to identify processed matches.
  document.getElementById("exportBackup").addEventListener("click", () => {
    chrome.storage.local.get(Object.values(STORAGE_KEYS), (latest) => {
      if (chrome.runtime.lastError) {
        document.getElementById("saveStatus").textContent = "Unable to read backup data. Please retry.";
        return;
      }
      const backup = {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        stats: latest[STORAGE_KEYS.stats] === undefined ? {} : latest[STORAGE_KEYS.stats],
        processedMatchIds: latest[STORAGE_KEYS.processedMatches] === undefined ? [] : latest[STORAGE_KEYS.processedMatches],
        playerName: latest[STORAGE_KEYS.playerName] === undefined ? DEFAULT_PLAYER_NAME : latest[STORAGE_KEYS.playerName]
      };
      download("marvel-rivals-full-backup.json", JSON.stringify(backup, null, 2), "application/json");
    });
  });

  document.getElementById("backupFile").addEventListener("change", async () => {
    const input = document.getElementById("backupFile");
    const status = document.getElementById("backupStatus");
    const file = input.files?.[0];
    if (!file) {
      status.textContent = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      status.textContent = "Backup check failed: File exceeds the 2 MB inspection limit.";
      return;
    }
    try {
      const text = await file.text();
      // Ignore a slower previous selection if the user has chosen another file.
      if (input.files?.[0] !== file) return;
      status.textContent = checkBackupDocument(JSON.parse(text));
    } catch (error) {
      if (input.files?.[0] !== file) return;
      status.textContent = error instanceof SyntaxError
        ? "Backup check failed: Invalid JSON."
        : `Backup check failed: ${error.message}`;
    }
  });

  document.getElementById("exportCsv").addEventListener("click", () => {
    chrome.storage.local.get([STORAGE_KEYS.stats], (latest) => {
      const latestStats = latest[STORAGE_KEYS.stats] === undefined ? {} : latest[STORAGE_KEYS.stats];
      if (!isValidSnapshot(latestStats, [])) {
        document.getElementById("saveStatus").textContent = "Cannot export invalid statistics as CSV. Export JSON instead.";
        return;
      }
      download("marvel-rivals-threats.csv", toCsv(latestStats), "text/csv");
    });
  });

  document.getElementById("clearData").addEventListener("click", () => {
    if (!confirm("Clear all tracked match data?")) return;
    chrome.runtime.sendMessage({ type: "heroTracker/clearData" }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        document.getElementById("saveStatus").textContent = "Unable to clear data. Please retry.";
        return;
      }
      stats = {};
      processedMatches = [];
      renderStats(stats, processedMatches);
    });
  });
});
