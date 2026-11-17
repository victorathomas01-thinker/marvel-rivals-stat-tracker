const STORAGE_KEYS = {
  stats: "heroTrackerStats",
  processedMatches: "heroTrackerProcessedMatches",
  playerName: "heroTrackerPlayerName"
};

const DEFAULT_PLAYER_NAME = "MrKilometer";

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
        <span class="hero"></span>
        <span class="score">${data.weightedLosses.toFixed(1)}</span>
      `;
      item.querySelector(".hero").textContent = hero;
      list.appendChild(item);
    });
  }

  document.getElementById("matchCount").textContent = `${processedMatches.length} matches seen`;
}

async function refresh() {
  const stored = await chrome.storage.local.get(null);
  const playerName = stored[STORAGE_KEYS.playerName] || DEFAULT_PLAYER_NAME;
  const player = playerName.trim().toLowerCase();
  const history = exportMatchHistory(stored, player);
  const stats = weightedStats(stored, player);
  renderStats(stats, [...(stored[STORAGE_KEYS.processedMatches] || []), ...history.matches]);

  renderMatchups(summarizeMatchups(stored, playerName));
  renderRecentMatches(history.matches);
  const matchExport = document.getElementById("exportMatches");
  matchExport.disabled = history.matches.length === 0;
  matchExport.onclick = () => download("marvel-rivals-match-history.json",
    JSON.stringify(history, null, 2), "application/json");
  document.getElementById("exportJson").onclick = () =>
    download("marvel-rivals-threats.json", JSON.stringify(stats, null, 2), "application/json");
  document.getElementById("exportCsv").onclick = () =>
    download("marvel-rivals-threats.csv", toCsv(stats), "text/csv");
}

async function initialize() {
  const nameInput = document.getElementById("playerName");
  const status = document.getElementById("saveStatus");
  const stored = await chrome.storage.local.get(STORAGE_KEYS.playerName);
  nameInput.value = stored[STORAGE_KEYS.playerName] || DEFAULT_PLAYER_NAME;

  document.getElementById("savePlayer").onclick = async () => {
    const value = nameInput.value.trim();
    if (!value) return;
    await chrome.storage.local.set({ [STORAGE_KEYS.playerName]: value });
    await refresh();
    status.textContent = "Player name saved.";
  };
  document.getElementById("clearData").onclick = async () => {
    if (!confirm("Clear all tracked match data?")) return;
    const result = await chrome.runtime.sendMessage({ type: "clearMatches" });
    if (result.error) {
      status.textContent = "Could not clear tracked data.";
      return;
    }
    await refresh();
  };
  await refresh();
}

initialize();
