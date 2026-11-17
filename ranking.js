function rankThreats(stats) {
  return Object.entries(stats || {}).sort(([, a], [, b]) =>
    b.weightedLosses - a.weightedLosses ||
    b.losses - a.losses ||
    b.appearances - a.appearances
  );
}
