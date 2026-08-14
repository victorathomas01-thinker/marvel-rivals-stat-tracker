# Marvel Rivals Stat Tracker

A Chrome extension for analyzing personal **Marvel Rivals** match history on Tracker.gg and surfacing the enemy heroes that appear most often in losses.

## What It Does

The extension reads individual Tracker.gg match pages, determines which team the configured player is on, checks the final score, and records opposing heroes only when that player loses.

Enemy heroes associated with an MVP or SVP row receive a **1.2× weighted-loss value**, making standout performances count slightly more heavily in the threat ranking.

## Features

- Detects the configured player on Team A or Team B
- Reads match scores directly from the Tracker.gg match header
- Records opponent heroes only on losses
- Supports multiple hero images for players who switched heroes during a match
- Applies 1.2× weighting to MVP/SVP opponent rows
- Deduplicates previously processed match IDs
- Stores data with the Chrome Storage API
- Displays a Top 5 Threats overlay directly on match pages
- Provides a browser-extension popup with the same threat summary
- Lets the user configure their Tracker.gg player name
- Exports tracked data as JSON or CSV
- Provides a clear-data control

## Tech Stack

- JavaScript
- HTML
- CSS
- Chrome Extensions Manifest V3
- Chrome Storage API
- DOM parsing / browser automation logic
- CSV and JSON serialization

## How It Works

1. Wait for Tracker.gg match data to render.
2. Locate the Team A and Team B stat tables.
3. Find the configured player name and determine that player's team.
4. Read Team A and Team B scores from the match header.
5. If the player lost, inspect the opposing team's player rows.
6. Extract hero names from hero-image metadata while ignoring non-hero images such as rank icons.
7. Detect MVP/SVP labels and apply the 1.2× weight where appropriate.
8. Save aggregated statistics and the processed match ID in Chrome storage.
9. Rank heroes by weighted losses and display the top five.

## Data Model

Each tracked hero stores:

```json
{
  "losses": 3,
  "appearances": 3,
  "weightedLosses": 3.2,
  "mvpSvpAppearances": 1
}
```

The threat list is sorted primarily by `weightedLosses`, then raw losses and appearances.

## Install Locally

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the repository folder.
6. Open the extension popup and confirm your Tracker.gg player name.
7. Visit a Marvel Rivals match-detail page on Tracker.gg.

## Validation

The current parser was checked against saved Tracker.gg match-page fixtures representing both a loss and a win. In the loss fixture, the parser correctly isolated the opposing team and detected the MVP-weighted hero row. In the win fixture, it correctly skipped loss-stat updates.

The saved fixture pages are not included in the public repository because they contain third-party page markup and player/match data.

## Engineering Decisions

### Narrow host permissions

The extension only runs on Tracker.gg Marvel Rivals match-detail URLs instead of requesting access to all websites.

### Match deduplication

Processed match IDs are stored so refreshing or revisiting the same page does not repeatedly inflate the statistics.

### Hero-image filtering

Tracker.gg rows contain both hero images and rank images. The parser filters image URLs for the hero asset path before reading the image `alt` text.

### Configurable player name

The original prototype was built around one account. The public version makes the player name configurable so the extension is reusable without editing source code.

## Current Limitations

- The project depends on Tracker.gg's current DOM structure and may require selector updates if the site changes.
- It processes individual match-detail pages as they are visited; automated traversal of an entire match history is not implemented yet.
- The scoring model is intentionally simple and currently uses only loss frequency plus MVP/SVP weighting.
- Automated browser tests are not yet included.

## Planned Improvements

- Automated match-history traversal
- More defensive selector fallbacks
- Additional threat-ranking signals
- Match-history and trend visualizations
- Automated parser tests using sanitized fixtures
- Optional Google Sheets synchronization
- Portfolio screenshots and demo media

## Background

I built this project because the standard match-history view made it difficult to answer a practical competitive question: **Which enemy heroes repeatedly show up in my losses?**

The project became an exercise in DOM inspection, data extraction, defensive parsing, state persistence, browser-extension design, and turning raw match data into a small decision-support tool.

## Disclaimer

This is an independent personal project and is not affiliated with, endorsed by, or sponsored by Marvel, NetEase Games, or Tracker.gg. Product and character names belong to their respective owners.
