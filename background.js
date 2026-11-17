importScripts("match-data.js");

let pending = Promise.resolve();
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  const isMatchPage = sender.url?.startsWith("https://tracker.gg/marvel-rivals/matches/");
  const isPopup = sender.url === chrome.runtime.getURL("popup.html");
  if (!(message.type === "recordMatch" && isMatchPage) && !(message.type === "clearMatches" && isPopup)) return;

  const operation = pending.then(async () => {
    const stored = await chrome.storage.local.get(null);
    if (message.type === "clearMatches") {
      const matchKeys = Object.keys(stored).filter((key) => key.startsWith(MATCH_KEY_PREFIX));
      await chrome.storage.local.remove([...matchKeys, "heroTrackerStats", "heroTrackerProcessedMatches"]);
      return {};
    }

    const { match } = message;
    const key = MATCH_KEY_PREFIX + JSON.stringify([match.player, match.id]);
    if (Object.hasOwn(stored, key) || stored.heroTrackerProcessedMatches?.includes(match.id)) {
      return { duplicate: true };
    }
    await chrome.storage.local.set({ [key]: { ...match, recordedAt: new Date().toISOString() } });
    return { duplicate: false };
  });
  pending = operation.catch(() => {});
  operation.then(respond, (error) => respond({ error: error.message }));
  return true;
});
