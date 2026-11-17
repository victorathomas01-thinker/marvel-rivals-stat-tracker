const STORAGE_KEYS = {
  stats: "heroTrackerStats",
  processedMatches: "heroTrackerProcessedMatches",
  playerName: "heroTrackerPlayerName"
};

const DEFAULT_PLAYER_NAME = "MrKilometer";
const MVP_WEIGHT = 1.2;

function getMatchId() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts.at(-1) || window.location.href;
}

function findTeamTable(teamName) {
  return [...document.querySelectorAll("table")].find((table) => {
    const firstHeader = table.querySelector("thead th");
    return firstHeader?.textContent?.trim() === teamName;
  }) || null;
}

function getTeamScore(teamName) {
  const header = document.querySelector(".v3-match__header");
  if (!header) return null;

  const entry = [...header.querySelectorAll(".v3-match__entry")].find((candidate) => {
    const label = candidate.querySelector(".label");
    return label?.textContent?.trim() === teamName;
  });

  if (!entry) return null;
  const score = Number.parseInt(entry.querySelector(".value")?.textContent?.trim() ?? "", 10);
  return Number.isFinite(score) ? score : null;
}

function getPlayerTeam(playerName, teamATable, teamBTable) {
  const normalized = playerName.trim().toLowerCase();
  if (!normalized) return null;

  const tableHasPlayer = (table) => [...table.querySelectorAll("tbody tr")].some((row) => {
    const profiles = [...row.querySelectorAll('a[href*="/marvel-rivals/profile/"]')];
    const labels = profiles.length ? profiles : [...row.cells];
    return labels.some((label) => label.textContent.trim().toLowerCase() === normalized);
  });

  const onA = tableHasPlayer(teamATable);
  const onB = tableHasPlayer(teamBTable);
  if (onA === onB) return null;
  return onA ? "Team A" : "Team B";
}

function extractHeroEntries(teamTable) {
  const entries = [];

  for (const row of teamTable.querySelectorAll("tbody tr")) {
    const rowText = row.textContent || "";
    const hasAward = /\b(MVP|SVP)\b/i.test(rowText);
    const weight = hasAward ? MVP_WEIGHT : 1;

    const heroes = [...row.querySelectorAll("img")]
      .filter((img) => {
        const src = img.getAttribute("src") || "";
        return src.includes("/heroes/") || src.includes("%2Fheroes%2F");
      })
      .map((img) => img.getAttribute("alt")?.trim())
      .filter(Boolean);

    for (const hero of new Set(heroes)) {
      entries.push({ hero, weight, hasAward });
    }
  }

  return entries;
}

function renderOverlay(stats, message) {
  document.getElementById("hero-tracker-overlay")?.remove();

  const overlay = document.createElement("aside");
  overlay.id = "hero-tracker-overlay";

  const threats = rankThreats(stats).slice(0, 5);
  const threatMarkup = threats.length
    ? threats.map(([, data], index) => `
        <li>
          <span class="hero-tracker-rank">${index + 1}</span>
          <span class="hero-tracker-hero"></span>
          <span class="hero-tracker-score">${data.weightedLosses.toFixed(1)}</span>
        </li>`).join("")
    : "<li class=\"hero-tracker-empty\">No losses recorded yet.</li>";

  overlay.innerHTML = `
    <button class="hero-tracker-close" type="button" aria-label="Close">×</button>
    <h2>Top Threats</h2>
    <p class="hero-tracker-message"></p>
    <ol>${threatMarkup}</ol>
    <p class="hero-tracker-note">Score = losses, with MVP/SVP rows weighted 1.2×.</p>
  `;

  overlay.querySelector(".hero-tracker-message").textContent = message;
  overlay.querySelectorAll(".hero-tracker-hero").forEach((label, index) => {
    label.textContent = threats[index][0];
  });
  overlay.querySelector(".hero-tracker-close").addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
}

async function processMatch() {
  const teamATable = findTeamTable("Team A");
  const teamBTable = findTeamTable("Team B");
  const scoreA = getTeamScore("Team A");
  const scoreB = getTeamScore("Team B");

  if (!teamATable || !teamBTable || scoreA === null || scoreB === null) {
    return false;
  }

  const stored = await chrome.storage.local.get(null);
  const playerName = stored[STORAGE_KEYS.playerName] || DEFAULT_PLAYER_NAME;
  const player = playerName.trim().toLowerCase();
  const playerTeam = getPlayerTeam(playerName, teamATable, teamBTable);
  const currentStats = weightedStats(stored, player);

  if (!playerTeam) {
    renderOverlay(currentStats, `Player “${playerName}” could not be identified on one team.`);
    return false;
  }

  const playerScore = playerTeam === "Team A" ? scoreA : scoreB;
  const opponentScore = playerTeam === "Team A" ? scoreB : scoreA;
  const outcome = playerScore === opponentScore ? "draw" : playerScore < opponentScore ? "loss" : "win";
  const opponentTable = playerTeam === "Team A" ? teamBTable : teamATable;
  const heroes = extractHeroEntries(opponentTable);
  if (outcome !== "draw" && !heroes.length) return false;

  const result = await chrome.runtime.sendMessage({
    type: "recordMatch",
    match: { id: getMatchId(), player, outcome, playerScore, opponentScore, heroes }
  });
  if (result.error) throw new Error(result.error);

  const latest = await chrome.storage.local.get(null);
  renderOverlay(weightedStats(latest, player), result.duplicate
    ? "This match was already processed." : `${outcome[0].toUpperCase() + outcome.slice(1)} recorded.`);
  return true;
}

async function waitForMatchData() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    try {
      if (await processMatch()) return;
    } catch (error) {
      console.error("Marvel Rivals Stat Tracker could not record the match.", error);
      renderOverlay({}, "Could not save the match. Reload the page to retry.");
      return;
    }
  }
}

waitForMatchData();
