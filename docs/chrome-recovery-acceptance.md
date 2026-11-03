# Chrome recovery acceptance test (manual, isolated profile)

Purpose: close the browser-validation gap for draft PRs #7–#13. Automated Node tests do not establish that the Chrome popup, downloads, service worker, or real multi-tab behavior work. This checklist is a **test plan**, not a record of completed testing.

## Setup and safeguards

- [ ] Use a separate temporary Chrome profile with no existing Tracker data. Do **not** run restore/clear against your regular profile.
- [ ] Load the unpacked extension from this branch via `chrome://extensions` (Developer mode); record Chrome version, extension ID, branch/commit, and date.
- [ ] Open the extension service-worker console and popup inspector; record errors without sharing account tokens or personal browsing data.
- [ ] Create a disposable synthetic match fixture and a backup using invented player/hero names. Keep a copy of the original synthetic backup outside Chrome.

## Acceptance cases

| ID | Action | Expected result | Evidence |
| --- | --- | --- | --- |
| C1 | Record a synthetic match, close/reopen popup | Counts persist and show exactly once | Before/after counts |
| C2 | Open two supported match tabs, submit different synthetic match IDs close together | Both unique matches recorded; no lost update | Two IDs and final counts |
| C3 | Submit the same synthetic match ID from both tabs | Only one recorded | IDs and counts |
| C4 | Keep popup open while another tab records a match | Popup refreshes; CSV/JSON exports reflect latest storage | Popup and export values |
| C5 | Export full backup; inspect downloaded JSON locally | Version, player name, stats and processed IDs are present; legacy exports remain usable | Redacted schema/sample |
| C6 | Choose malformed JSON, wrong version, blank/201-character hero name, and 1,001 heroes | Preflight refuses Restore; stored data unchanged | Warning and counts |
| C7 | Choose valid synthetic backup and confirm restore; close/reopen popup and reload extension | Exact stats, player name and processed IDs persist; replaying old match does not double-count | Before/after and replay |
| C8 | Trigger restore failure in an isolated test setup, if reproducible safely | Previous state is retained or recovery failure is clearly surfaced; do not claim atomic rollback | Error and post-failure state |
| C9 | Try privileged clear/restore message from a content-script context, then use the popup | Content-script request rejected; authorized popup action works | Worker response and popup outcome |
| C10 | Clear only the disposable profile's data, then export | No stale match statistics exported | Popup and export |

## Exit criteria

- Record pass/fail/not-run for **each** case and link sanitized screenshots or logs.
- Any failing case gets a reproducible issue before merging; distinguish environmental limitations from product defects.
- Check Chrome service-worker lifecycle by repeating C2/C7 after worker suspension or extension reload.
- Do not claim browser validation, successful recovery, or authorization hardening based solely on CI.
- Do not merge or deploy this stack without explicit approval.

## Career evidence

Once actually executed, this can substantiate browser integration testing, data-recovery verification, and security boundary testing. Until then, describe it only as an AI-assisted acceptance-test plan.
