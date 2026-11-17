# Matchup analytics in Power BI

This case study follows the browser extension's version 1 history export from raw records to a report with traceable metrics. The initial dataset contains 360 synthetic matches generated with seed 20261117. Outcomes are generated independently of heroes. Apparent matchup patterns are simulated.

## Questions

- How many captured matches were wins, losses, or draws?
- What is the observed loss rate against each hero, and how large is its sample?
- Which records have missing dates or scores?
- Can the report reproduce the extension's matchup rates and Wilson intervals?

## Round 1 deliverables

Run `python analytics/power-bi/generate_fixture.py` from the repository root to regenerate the public JSON fixture and its metadata. The file uses the same schema as the extension export. Repeated hero rows, missing recorded dates, and missing scores exercise actual export edge cases.

[Metric definitions](METRICS.md) explain the grain, denominator, and exclusions. [Development rounds](PLAN.md) describe the next deliverables.

## Planned report

| Page | Viewer question |
| --- | --- |
| Overview | What outcomes appear in the captured history? |
| Matchups | How often did losses occur alongside each hero, with what uncertainty? |
| Data quality and methods | What was excluded, missing, or deduplicated? |

The date field records ingestion into the extension. Charts using it describe recording activity. Match occurrence time is unavailable in version 1 exports.

Power BI report files, SQL transformations, and DAX are scheduled for later rounds. This folder currently contains the dataset and specification.
