const MATCH_KEY_PREFIX = "heroTrackerMatch:";

function summarizeMatchups(stored, playerName) {
  return rankMatchups(playerMatches(stored, playerName.trim().toLowerCase()));
}

function playerMatches(stored, player) {
  return Object.entries(stored)
    .filter(([key, match]) => key.startsWith(MATCH_KEY_PREFIX) && match.player === player)
    .map(([, match]) => match);
}

function rankMatchups(matches) {
  const totals = new Map();
  for (const match of matches) {
    if (match.outcome === "draw") continue;

    for (const hero of new Set(match.heroes.map((entry) => entry.hero))) {
      const count = totals.get(hero) ?? { encounters: 0, losses: 0 };
      count.encounters += 1;
      count.losses += Number(match.outcome === "loss");
      totals.set(hero, count);
    }
  }

  return [...totals].map(([hero, { encounters, losses }]) => {
    const rate = losses / encounters;
    const z = 1.96;
    const scale = 1 + z ** 2 / encounters;
    const center = (rate + z ** 2 / (2 * encounters)) / scale;
    const margin = z * Math.sqrt(rate * (1 - rate) / encounters + z ** 2 / (4 * encounters ** 2)) / scale;
    return { hero, encounters, losses, rate, low: Math.max(0, center - margin), high: Math.min(1, center + margin) };
  }).filter(({ encounters }) => encounters >= 5)
    .sort((a, b) => b.low - a.low || b.encounters - a.encounters || a.hero.localeCompare(b.hero));
}

function updateStats(currentStats, heroEntries) {
  const nextStats = structuredClone(currentStats || {});

  for (const { hero, weight, hasAward } of heroEntries) {
    if (!Object.hasOwn(nextStats, hero)) {
      Object.defineProperty(nextStats, hero, { enumerable: true, value: {
        losses: 0,
        appearances: 0,
        weightedLosses: 0,
        mvpSvpAppearances: 0
      } });
    }

    nextStats[hero].losses += 1;
    nextStats[hero].appearances += 1;
    nextStats[hero].weightedLosses = Number((nextStats[hero].weightedLosses + weight).toFixed(2));
    if (hasAward) nextStats[hero].mvpSvpAppearances += 1;
  }

  return nextStats;
}

function weightedStats(stored, player) {
  const entries = Object.entries(stored)
    .filter(([key, match]) => key.startsWith(MATCH_KEY_PREFIX)
      && match.player === player && match.outcome === "loss")
    .flatMap(([, match]) => match.heroes);
  return updateStats(stored.heroTrackerStats, entries);
}

function exportMatchHistory(stored, player) {
  const matches = playerMatches(stored, player)
    .map((match) => ({
      id: match.id,
      outcome: match.outcome,
      recordedAt: match.recordedAt ?? null,
      playerScore: match.playerScore ?? null,
      opponentScore: match.opponentScore ?? null,
      heroes: match.heroes.map(({ hero, weight, hasAward }) => ({ hero, weight, hasAward }))
    }))
    .sort((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? "") || a.id.localeCompare(b.id));
  return { schemaVersion: 1, matches };
}

function readHistory(payload) {
  if (payload?.schemaVersion !== 1 || !Array.isArray(payload.matches)) {
    throw new TypeError("Unsupported history format.");
  }
  const seen = new Set();
  for (const match of payload.matches) {
    if (!match || typeof match.id !== "string" || !match.id || seen.has(match.id)
        || !["win", "loss", "draw"].includes(match.outcome)
        || !Array.isArray(match.heroes)
        || match.heroes.some((entry) => typeof entry?.hero !== "string" || !entry.hero)
        || (match.recordedAt !== null && (typeof match.recordedAt !== "string" || !Number.isFinite(Date.parse(match.recordedAt))))
        || ![match.playerScore, match.opponentScore].every((score) => score === null || (Number.isInteger(score) && score >= 0))) {
      throw new TypeError("Invalid match record.");
    }
    seen.add(match.id);
  }
  return [...payload.matches].sort((a, b) => (Date.parse(b.recordedAt) || 0) - (Date.parse(a.recordedAt) || 0)
    || a.id.localeCompare(b.id));
}
