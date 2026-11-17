const demoMatches = {};
for (let index = 0; index < 12; index += 1) {
  const heroes = [{ hero: "Storm" }];
  if (index % 2 === 0) heroes.push({ hero: "Magneto" });
  if (index >= 5) heroes.push({ hero: "Luna Snow" });
  demoMatches[MATCH_KEY_PREFIX + index] = {
    id: "demo-" + index, player: "demo", outcome: index < 7 ? "loss" : "win", heroes,
    recordedAt: new Date(Date.UTC(2026, 10, index + 1)).toISOString(),
    playerScore: index < 7 ? 1 : 2, opponentScore: index < 7 ? 2 : 1
  };
}

function showHistory(matches) {
  renderMatchups(rankMatchups(matches));
  renderRecentMatches(matches);
}

showHistory(exportMatchHistory(demoMatches, "demo").matches);
document.getElementById("openHistory").addEventListener("change", async (event) => {
  const file = event.currentTarget.files[0];
  if (!file) return;
  const status = document.getElementById("historyStatus");
  try {
    const matches = readHistory(JSON.parse(await file.text()));
    showHistory(matches);
    document.getElementById("datasetLabel").textContent = "Local history export";
    status.textContent = "Showing " + matches.length + " matches from the local export.";
  } catch {
    status.textContent = "Choose a valid version 1 match-history export.";
  }
});
