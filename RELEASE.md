# Marvel Rivals Stat Tracker 1.3.0

## What changed

- Observed loss rates use player-scoped match records and show sample sizes and 95% Wilson intervals.
- Earlier aggregate totals have a separate download and stay outside current player statistics.
- Duplicate checks fetch keyed records. Score parsing rejects malformed values.
- Versioned JSON histories reproduce matchup rates and recent matches in the offline demo.
- Regression fixtures include anonymized historical and November 2026 scoreboards supplied by the owner.

## Install

Extract the extension ZIP. In Chrome or Edge, open the extensions page, enable Developer mode, select Load unpacked, and choose the extracted folder containing `manifest.json`.

Set your exact Tracker.gg player name in the popup. Open a match details page and wait for its final score and both team tables. The extension records visited matches. Reopening the same match should report that it was already processed.

## Offline demonstration

Extract the offline demo bundle and open `demo.html`. It starts with synthetic records. Select a version 1 JSON history export to reproduce that export's calculations. See [DEMO.md](DEMO.md) for a two-minute presentation.

## Evidence and remaining release check

Unit and Chromium checks passed during development, including the captured scoreboard layouts, duplicate recording, and export replay. A normal-browser installation and capture on a live page remain the owner's final release check.

GitHub Actions attaches the extension ZIP and offline demo to the candidate workflow run. Record the reviewed commit and download links when publishing the release.
