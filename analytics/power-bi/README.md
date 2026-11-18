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

## Round 2: reproducible preparation

Requires Node.js 22+ and Python 3.12+ with SQLite JSON support (included in standard Python distributions). From the repository root:

```sh
python analytics/power-bi/build_model.py
python -B -m unittest discover -s analytics/power-bi -p test_model.py -v
```

The build runs the extension validator, executes [SQL transformations](transform.sql), and writes ignored local `generated/model.sqlite` and `generated/model.json` files. Pass `--source PATH --output DIRECTORY` to process another export. Keep personal exports and their outputs outside tracked directories. Each build replaces the output model for one export; it does not combine players or append history.

| Table | Grain / purpose | Fixture rows |
| --- | --- | ---: |
| Matches | One accepted match | 360 |
| Heroes | One exact hero label | 12 |
| MatchHeroes | One match–hero encounter, with AppearanceCount | 2,521 |
| RecordingDate | One UTC recording date key, including Unknown | 91 |
| Rejections | One rejected source row with match ID and reason | 0 |
| ImportSummary | Source, accepted, and rejected row totals | 1 |

Duplicate IDs quarantine **all** occurrences, avoiding arbitrary first-row selection. Invalid records use the extension's `readHistory` rules and receive `invalid_match_record`; duplicate IDs receive `duplicate_match_id`. SourceRow is one-based. Unsupported envelopes fail the whole build. No raw rejected payload is copied into the report. Empty hero arrays remain valid, matching the extension. Labels are not trimmed or normalized because the extension counts their exact values.

RecordingDateKey derives from UTC, with a literal Unknown key for missing dates. The date dimension currently contains observed recording dates; a continuous calendar and time-intelligence measures are outside this round. The build checks 179 wins, 169 losses, 12 draws, 13 missing dates, 10 missing scores, and 33 repeated appearances. Tests compare all twelve heroes' decisive encounters, losses, rates, and Wilson bounds against the extension.

### Load in Power BI Desktop

Create a blank query named `ModelTables`. Paste [ModelTables.pq](ModelTables.pq) into Advanced Editor and replace ModelPath with the absolute generated JSON path. Disable load on this staging query. Create six reference queries named as above, each returning its record field, for example:

```powerquery
= ModelTables[Matches]
```

The adapter supplies explicit column names and types even for empty rejection or encounter tables. Refresh rereads the generated file; rerun the Python build first when the export changes. Native Desktop import is verified in Round 3.

## Round 3: semantic model

```sh
python analytics/power-bi/build_semantic_model.py
```

In a **new, dedicated blank report**, open TMDL View, paste the generated `model.tmdl`, and select Apply, then Refresh now. This creates six imported tables, one shared Power Query expression, three relationships, and sixteen formatted DAX measures. The generated script embeds the absolute model path; regenerate it after moving the data. Keep generated scripts untracked. The script replaces its named objects, so do not apply it to an unrelated report or a report with custom measures on these tables.

[Model generator and DAX definitions](build_semantic_model.py) are the canonical editable source. The script follows Microsoft's [TMDL workflow](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-tmdl-view).

| One side | Many side | Direction |
| --- | --- | --- |
| RecordingDate.RecordingDateKey | Matches.RecordingDateKey | Date → Matches |
| Matches.MatchId | MatchHeroes.MatchId | Matches → Encounters |
| Heroes.Hero | MatchHeroes.Hero | Hero → Encounters |

One-way relationships keep hero selection from shrinking the overall match baseline. Use **Heroes.Hero** for hero slicers and **RecordingDate.RecordingDateKey** for date selection including Unknown. Hero measures count distinct match IDs, so multi-select heroes describe the union of encounters. Their totals are not the sum of hero rows. Outcome and date filters intersect the selected context. Rejections and ImportSummary are disconnected import diagnostics; their counts describe the whole import, independent of report slicers.

Run [validate_model.dax](validate_model.dax) in DAX Query View after refreshing the synthetic fixture. Both result rows must show zero failures: 10 total/filter checks and 12 per-hero checks (each verifies counts, rates, and both interval bounds). The query is fixture-specific and should not be used as an expected result for personal exports. Native Desktop execution passed both suites. Report pages and accessible visual formatting remain for Round 4.
