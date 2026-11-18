# Report pages and viewer guide

The native report uses built-in Power BI visuals and the verified semantic model. The source is [build_report.py](build_report.py); it writes Microsoft's documented PBIR files into an existing, dedicated project copy saved by Desktop.

```sh
python analytics/power-bi/build_report.py PATH/TO/marvel-rivals-analytics.Report
```

Save Desktop edits before generating pages. Apply external changes in Desktop only after preserving any unsaved state. The generator writes three named pages and their metadata, leaving unrelated folders intact. A blank starter page must be archived separately if it remains in the project. Refresh is unnecessary for a page-only change.

## Pages

| Page | What the viewer sees | Useful interaction |
| --- | --- | --- |
| Overview | Captured and decisive matches, loss rate, draws, labeled outcome chart, denominator guide | Choose a recording-date window, including Unknown when wanted |
| Matchups | Hero/date selectors, overall baseline, encounter and loss counts, loss rate, both 95% Wilson bounds | Select a hero and compare its rate with the unchanged date-selected baseline |
| Data Quality | Missing dates/scores, repeated appearances, rejected rows, grain and limitations, rejection table | Audit the full import; no page slicers obscure its diagnostics |

Fixture default: 360 captured matches, 348 decisive matches, 48.6% overall loss rate, and 12 draws. Selecting Groot produces 212 decisive encounters, 102 losses, and 48.1% loss rate, while the baseline stays 48.6%. Hero rows sort by descending lower bound, then descending encounters, then ascending hero name. Bounds are blank below five decisive encounters; the guide explains this explicitly. Table totals are hidden because hero rows overlap and should not be added together.

## Accessibility and clarity

- Page names, headings, and layouts repeat in a predictable order.
- Numeric labels and exact table values accompany charts; color is not the only signal.
- Tables grow to fill their visual, with alternating rows and full hero labels.
- Each visual has descriptive alternative text and a unique tab-order position. Footer notes come last.
- The primary text/background contrast is 13.14:1; secondary text is 6.97:1; accent text is 5.73:1; white table headers against navy are 14.25:1. These checks cover the authored palette, not every Power BI chrome or interaction state.
- The report is designed at 1280 × 900. In Desktop, collapse editing panes or use the zoom control when reviewing on a smaller display.

Power BI keyboard navigation uses Ctrl+F6 between sections, Tab within a section, Ctrl+Right to enter a visual, and Escape to leave a visual. See [Microsoft's keyboard guide](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-accessibility-keyboard-shortcuts). Basic section navigation was exercised in Desktop. A complete screen-reader and keyboard-only interaction audit remains a release check; the report does not claim accessibility certification.

## Evidence and remaining delivery

All three pages rendered in Desktop. The native hero-slicer smoke check reproduced Groot's counts and kept the overall baseline fixed. The Data Quality page displayed 13 missing dates, 10 missing-score records, 33 repeated appearances, and zero rejections. All 38 generated page/visual documents passed the public Microsoft JSON schemas. Bounds, alternative text, and unique tab orders were checked for all 34 visuals.

The source model's 22 native DAX acceptance checks passed in Round 3. Round 4 changes only presentation and visual bindings. Final release work includes a portable project, native PBIX snapshot, report previews, a short walkthrough, and the remaining accessibility checks. No publishing account or paid Power BI service is needed for the local demo.
