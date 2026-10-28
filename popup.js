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
