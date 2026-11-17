# Metric contract

## Grain and identity

The raw export contains one record per match ID for a selected player. A hero appearance is one entry in that record's heroes array. Several entries for the same hero in one match reduce to one match–hero encounter for the rate calculations. Preserve raw appearance counts separately so the reduction is visible.

An export has no player label. Load each export as a separate dataset unless an explicit dataset identity and duplicate-handling rule is supplied. Match IDs alone cannot distinguish two players' exports of the same match.

## Measures

| Measure | Definition |
| --- | --- |
| Captured matches | Distinct accepted match IDs |
| Wins, losses, draws | Match counts by the outcome field |
| Decisive matches | Wins + losses |
| Overall loss rate | Losses / decisive matches |
| Hero encounters | Distinct decisive match IDs containing the hero |
| Hero losses | Distinct loss match IDs containing the hero |
| Hero loss rate | Hero losses / hero encounters |
| Eligible hero | At least five decisive encounters in the active filter context |
| Repeated appearance rows | Raw hero appearance rows minus distinct match–hero pairs |
| Missing recording dates | Accepted matches with recordedAt equal to null |
| Missing scores | Accepted matches with either score null |

A zero denominator returns an unavailable value. Draws remain visible in outcome totals and stay outside both rate denominators. Missing scores or recording dates do not exclude a match from all-time outcome or hero-rate measures.

## Uncertainty

For n encounters, x losses, p = x/n, and z = 1.96, use the Wilson score interval:

- scale = 1 + z²/n
- center = (p + z²/(2n)) / scale
- margin = z × sqrt(p(1−p)/n + z²/(4n²)) / scale
- lower = max(0, center − margin)
- upper = min(1, center + margin)

Match the extension's ordering by descending lower bound, descending encounter count, then hero name. Calculate intervals only for eligible heroes.

## Filter semantics

A hero filter changes hero encounter measures. Overall loss rate retains the date and dataset filters while removing the hero filter, so its population remains the selected match history. Date selection excludes unknown dates unless the viewer explicitly includes an Unknown category. An all-time view includes missing-date records.

## Validation and reconciliation

Reject unsupported schema versions, duplicate match IDs within an export, malformed outcomes, invalid scores or dates, and empty hero labels. Missing dates and scores are accepted when explicitly null, as in version 1. Publish rejected-row counts with reasons.

Reconcile raw match totals, decisive totals, per-hero encounters and losses, and intervals against the extension's rankMatchups function before adding presentation-only measures.

Loss rates are descriptive. Hero combinations, maps, opponents, and which matches the user visits can affect them. A confidence interval does not establish counter strength or remove selection bias.
