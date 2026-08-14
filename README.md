# Marvel Rivals Stat Tracker

A Chrome extension prototype for analyzing personal **Marvel Rivals** match history and identifying recurring enemy-team threats.

## Overview

The project is designed to turn match-history data into practical, player-focused insights. It reads match information from Tracker.gg pages, focuses on heroes appearing on the enemy team, and summarizes patterns associated with losses.

The goal is not just to display raw match data, but to answer a more useful question: **Which opposing heroes show up most often when I lose, and which ones should I consider prioritizing in bans or matchup preparation?**

## Current Features

- Collects and summarizes match-history data from Tracker.gg pages
- Identifies enemy-team heroes rather than mixing both teams together
- Detects match outcomes from team scores
- Tracks MVP/SVP indicators
- Applies additional weight to enemy heroes associated with MVP/SVP performances
- Stores match information locally in the browser
- Displays a Top Threats view for recurring difficult matchups
- Supports match-history filtering and review
- Exports collected data in CSV and JSON formats
- Includes fallback extraction logic intended to improve reliability when page data varies
- Provides controls for clearing locally stored data

## Tech Stack

- JavaScript
- HTML
- CSS
- Chrome Extension APIs
- Browser `localStorage`
- CSV / JSON data handling
- Git / GitHub

## How It Works

At a high level, the extension follows this flow:

1. Read relevant match-history information from the page.
2. Determine whether the match was a win or loss.
3. On losses, isolate the opposing team and identify the heroes used.
4. Detect MVP/SVP information when available.
5. Store the processed result locally.
6. Aggregate recurring enemy heroes into weighted threat statistics.
7. Present those results through the extension popup and allow export for further analysis.

## Why I Built It

I wanted a more useful way to review my own competitive match history than simply looking at wins and losses one match at a time. The project became an exercise in browser-based data extraction, defensive parsing, local data storage, interface design, and translating noisy page data into a repeatable analytical workflow.

## Engineering Challenges

A major challenge has been making extraction reliable when webpage structure and available match data are not perfectly uniform. The project has therefore involved iterative debugging, filtering, and fallback logic rather than relying on a single brittle selector or data source.

Other areas of focus include:

- avoiding accidental collection of heroes from the player's own team
- preventing duplicate match processing
- keeping stored data useful across browsing sessions
- turning individual matches into aggregate threat rankings
- keeping the popup interface compact enough to be useful during normal browsing

## Project Status

**Active prototype / work in progress.**

The public repository is currently being organized for portfolio use. Source files, screenshots, and additional technical documentation will be added as the project is cleaned up and packaged for public release.

## Planned Improvements

- Stronger duplicate-match detection
- More robust hero identification fallbacks
- Expanded match-history views and filters
- Improved ban-recommendation logic
- Better visual summaries of matchup trends
- Optional Google Sheets synchronization
- Additional documentation of the extraction and scoring pipeline

## Disclaimer

This is an independent personal project and is not affiliated with, endorsed by, or sponsored by Marvel, NetEase Games, or Tracker.gg. Product and character names belong to their respective owners.
