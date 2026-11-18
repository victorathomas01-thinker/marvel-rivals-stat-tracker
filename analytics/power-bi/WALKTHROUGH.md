# Two-minute walkthrough

Open [the PBIX snapshot](demo/marvel-rivals-analytics.pbix) in Power BI Desktop, or use the [three-page PDF](demo/marvel-rivals-analytics.pdf) for a quick visual review. The snapshot contains synthetic data and needs no account to view locally. Do not refresh the snapshot on a different machine; prepare the editable project first using the instructions in README.

## 0:00–0:25 — Frame the question

“The browser extension captures one player's visited matches. I built this report to inspect outcomes and hero encounters without hiding small samples or missing data. The public demo is seeded synthetic history: 360 matches, with outcomes generated independently of heroes.”

Show Overview. Point to 348 decisive matches and 48.6% overall loss rate. Explain that the 12 draws stay visible but are excluded from the denominator.

## 0:25–1:00 — Demonstrate filter semantics

Open Matchups. Select Groot in the hero selector. Show 212 encounters, 102 losses, and 48.1% loss rate. The baseline remains 48.6% because the hero dimension filters encounters, not the match population. Clear the hero selector.

Select recording date 2026-08-03. The baseline becomes 25.0% for four decisive matches. Bounds disappear where fewer than five encounters remain. Explain that the timestamp is when the extension recorded the result, not the match's occurrence time. Restore All before leaving.

## 1:00–1:25 — Show uncertainty and data quality

Compare the interval columns with sample sizes. “I sort by lower confidence bound, but overlapping intervals and selection bias prevent a causal counter-pick conclusion.”

Open Data Quality: 13 missing dates, 10 missing-score records, 33 repeated appearances, and zero rejected rows. Explain the distinction between accepted nulls, duplicate-ID quarantine, and deduplicated match–hero encounters.

## 1:25–2:00 — Explain the engineering

Show the repository's SQL, shared Power Query adapter, one-way relationship map, and native DAX acceptance query. “I reuse the extension's validator, test malformed exports, and reconcile every hero's counts, rates, and Wilson bounds. The model passed 22 native acceptance checks. The report source is versioned PBIR/TMDL; a preparation script rebuilds a refreshable project in a new folder.”

Close with the tradeoff: a small local import model gives a reproducible demo without adding a service dependency. A multi-player production system would need dataset identity, consent-aware collection, and an explicit ingestion/refresh strategy before combining exports.
