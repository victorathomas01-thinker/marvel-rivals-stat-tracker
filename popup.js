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

function toCsv(stats) {
  const rows = [["Hero", "Losses", "Appearances", "Weighted Losses", "MVP/SVP Appearances"]];
  for (const [hero, data] of rankThreats(stats)) {
    rows.push([hero, data.losses, data.appearances, data.weightedLosses, data.mvpSvpAppearances]);
  }
  return rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
}

function renderStats(stats, processedMatches) {
  const list = document.getElementById("threatList");
  const ranked = rankThreats(stats).slice(0, 5);
  list.innerHTML = "";

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
        <span class="hero">${hero}</span>
        <span class="score">${data.weightedLosses.toFixed(1)}</span>
      `;
      list.appendChild(item);
    });
  }

  document.getElementById("matchCount").textContent = `${processedMatches.length} matches seen`;
}

chrome.storage.local.get(Object.values(STORAGE_KEYS), (stored) => {
  const stats = stored[STORAGE_KEYS.stats] || {};
  const processedMatches = stored[STORAGE_KEYS.processedMatches] || [];
  const playerName = stored[STORAGE_KEYS.playerName] || DEFAULT_PLAYER_NAME;

  document.getElementById("playerName").value = playerName;
  renderStats(stats, processedMatches);

  document.getElementById("savePlayer").addEventListener("click", () => {
    const value = document.getElementById("playerName").value.trim();
    if (!value) return;
    chrome.storage.local.set({ [STORAGE_KEYS.playerName]: value }, () => {
      document.getElementById("saveStatus").textContent = "Player name saved.";
    });
  });

  document.getElementById("exportJson").addEventListener("click", () => {
    download("marvel-rivals-threats.json", JSON.stringify(stats, null, 2), "application/json");
  });

  document.getElementById("exportCsv").addEventListener("click", () => {
    download("marvel-rivals-threats.csv", toCsv(stats), "text/csv");
  });

  document.getElementById("clearData").addEventListener("click", () => {
    if (!confirm("Clear all tracked match data?")) return;
    chrome.storage.local.remove([STORAGE_KEYS.stats, STORAGE_KEYS.processedMatches], () => {
      renderStats({}, []);
    });
  });
});
