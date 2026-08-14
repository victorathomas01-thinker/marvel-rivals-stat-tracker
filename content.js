const STORAGE_KEYS = {
  stats: "heroTrackerStats",
  processedMatches: "heroTrackerProcessedMatches",
  playerName: "heroTrackerPlayerName"
};

const DEFAULT_PLAYER_NAME = "MrKilometer";
const MVP_WEIGHT = 1.2;
const MAX_PROCESSED_MATCHES = 500;

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(values) {
  return new Promise((resolve) => chrome.storage.local.set(values, resolve));
}

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

  const tableHasPlayer = (table) => [...table.querySelectorAll("tbody tr")].some((row) =>
    row.textContent.toLowerCase().includes(normalized)
  );

  if (tableHasPlayer(teamATable)) return "Team A";
  if (tableHasPlayer(teamBTable)) return "Team B";
  return null;
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

function updateStats(currentStats, heroEntries) {
  const nextStats = structuredClone(currentStats || {});

  for (const { hero, weight, hasAward } of heroEntries) {
    if (!nextStats[hero]) {
      nextStats[hero] = {
        losses: 0,
        appearances: 0,
        weightedLosses: 0,
        mvpSvpAppearances: 0
      };
    }

    nextStats[hero].losses += 1;
    nextStats[hero].appearances += 1;
    nextStats[hero].weightedLosses = Number((nextStats[hero].weightedLosses + weight).toFixed(2));
    if (hasAward) nextStats[hero].mvpSvpAppearances += 1;
  }

  return nextStats;
}

function rankThreats(stats) {
  return Object.entries(stats || {})
    .sort(([, a], [, b]) =>
      b.weightedLosses - a.weightedLosses ||
      b.losses - a.losses ||
      b.appearances - a.appearances
    );
}

function renderOverlay(stats, message) {
  document.getElementById("hero-tracker-overlay")?.remove();

  const overlay = document.createElement("aside");
  overlay.id = "hero-tracker-overlay";

  const threats = rankThreats(stats).slice(0, 5);
  const threatMarkup = threats.length
    ? threats.map(([hero, data], index) => `
        <li>
          <span class="hero-tracker-rank">${index + 1}</span>
          <span class="hero-tracker-hero">${hero}</span>
          <span class="hero-tracker-score">${data.weightedLosses.toFixed(1)}</span>
        </li>`).join("")
    : "<li class=\"hero-tracker-empty\">No losses recorded yet.</li>";

  overlay.innerHTML = `
    <button class="hero-tracker-close" type="button" aria-label="Close">×</button>
    <h2>Top Threats</h2>
    <p class="hero-tracker-message">${message}</p>
    <ol>${threatMarkup}</ol>
    <p class="hero-tracker-note">Score = losses, with MVP/SVP rows weighted 1.2×.</p>
  `;

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

  const stored = await storageGet([
    STORAGE_KEYS.stats,
    STORAGE_KEYS.processedMatches,
    STORAGE_KEYS.playerName
  ]);

  const playerName = stored[STORAGE_KEYS.playerName] || DEFAULT_PLAYER_NAME;
  const playerTeam = getPlayerTeam(playerName, teamATable, teamBTable);

  if (!playerTeam) {
    renderOverlay(stored[STORAGE_KEYS.stats] || {}, `Player “${playerName}” was not found on this match page.`);
    return true;
  }

  const matchId = getMatchId();
  const processedMatches = stored[STORAGE_KEYS.processedMatches] || [];
  const currentStats = stored[STORAGE_KEYS.stats] || {};

  if (processedMatches.includes(matchId)) {
    renderOverlay(currentStats, "This match was already processed.");
    return true;
  }

  const playerScore = playerTeam === "Team A" ? scoreA : scoreB;
  const opponentScore = playerTeam === "Team A" ? scoreB : scoreA;

  if (playerScore >= opponentScore) {
    await storageSet({
      [STORAGE_KEYS.processedMatches]: [...processedMatches, matchId].slice(-MAX_PROCESSED_MATCHES)
    });
    renderOverlay(currentStats, playerScore === opponentScore ? "Draw detected — no loss data added." : "Win detected — no loss data added.");
    return true;
  }

  const opponentTable = playerTeam === "Team A" ? teamBTable : teamATable;
  const heroEntries = extractHeroEntries(opponentTable);

  if (!heroEntries.length) {
    renderOverlay(currentStats, "Loss detected, but no opponent hero images were found.");
    return true;
  }

  const nextStats = updateStats(currentStats, heroEntries);
  const nextProcessed = [...processedMatches, matchId].slice(-MAX_PROCESSED_MATCHES);

  await storageSet({
    [STORAGE_KEYS.stats]: nextStats,
    [STORAGE_KEYS.processedMatches]: nextProcessed
  });

  renderOverlay(nextStats, `Loss recorded. Added ${heroEntries.length} opponent hero appearance${heroEntries.length === 1 ? "" : "s"}.`);
  return true;
}

function waitForMatchData() {
  let attempts = 0;
  const maxAttempts = 20;

  const timer = window.setInterval(async () => {
    attempts += 1;
    const processed = await processMatch();

    if (processed || attempts >= maxAttempts) {
      window.clearInterval(timer);
    }
  }, 500);
}

waitForMatchData();
