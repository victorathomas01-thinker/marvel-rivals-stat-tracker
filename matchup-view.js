function renderMatchups(matchups) {
  const list = document.getElementById("matchupList");
  list.replaceChildren();
  for (const { hero, losses, encounters, rate, low, high } of matchups.slice(0, 5)) {
    const item = document.createElement("li");
    const percent = (value) => `${Math.round(value * 100)}%`;
    item.textContent = `${hero} · ${losses}/${encounters} losses · ${percent(rate)} (95% interval ${percent(low)}–${percent(high)})`;
    list.appendChild(item);
  }
  document.getElementById("matchupEmpty").hidden = matchups.length > 0;
}

function renderRecentMatches(matches) {
  const recent = matches.filter((match) => match.recordedAt).slice(0, 5);
  const list = document.getElementById("recentMatches");
  list.replaceChildren();
  for (const match of recent) {
    const item = document.createElement("li");
    const date = new Date(match.recordedAt).toLocaleDateString();
    const score = match.playerScore === null || match.opponentScore === null
      ? "" : " " + match.playerScore + "–" + match.opponentScore;
    item.textContent = date + " · " + match.outcome.toUpperCase() + score;
    list.appendChild(item);
  }
  document.getElementById("recentEmpty").hidden = recent.length > 0;
}
