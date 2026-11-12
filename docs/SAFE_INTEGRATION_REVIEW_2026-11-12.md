# Safe integration review — November 12, 2026

## Purpose

Provide one reviewable integration candidate for the **existing 13 stacked Chrome-extension PRs** without changing the current default branch, extension installed on any user's machine, or any published demo.

**Status: review-only. Do not merge until acceptance gates are completed.**

### Frozen reference points

| Item | Git reference |
| --- | --- |
| Existing default `main` | `86dee74b469bf8b12ec5db00244ce13226afb960` |
| Consolidated development baseline | `4b789d4ac82a659c597fc26ebdd82d93fe1cdae0` |
| Source | Existing draft PRs #2–#14; integration candidate starts from #14 head |
| Deployment | No GitHub Pages deployment for this extension; no extension store publication is authorized |

The development baseline was 51 commits ahead of `main` when reviewed. The 13 source PRs are intentionally **left open** while this integration candidate is evaluated. Do not close their audit trail or delete their branches prematurely.

## What the integration candidate includes

- Safer DOM rendering, robust poll handling, player team detection and hero-stat keys
- CSV export escaping, popup storage synchronization and serialized concurrent match writes
- Corrupt-storage recovery controls, versioned complete backups, preflight validation, and guarded restore
- Service-worker privileged-command sender restrictions and Chrome acceptance-test checklist
- Node regression tests and a GitHub Actions verification workflow

These are *implementation scopes inferred from the source PRs*. They do not prove that the extension currently works on Tracker.gg or that every backup/restore path has been exercised in a real browser.

## Merge gates

- [ ] Review the diff against `main` and confirm that only intended functionality is included.
- [ ] Ensure `npm run verify` passes on **this consolidated PR**, not merely on a stacked parent PR.
- [ ] Manually install **this exact branch/commit** into an isolated temporary Chrome profile.
- [ ] Run every case C1–C10 in [the Chrome acceptance checklist](chrome-recovery-acceptance.md), including multitab persistence, CSV/JSON exports, failed restores, popup authorization, and extension reload.
- [ ] Record pass/fail/not-run evidence for each case without exposing private match or account data.
- [ ] Verify match detection on current supported Tracker.gg pages, including a win, a loss, a draw/unknown case, and a player whose name is a substring of another name.
- [ ] Check that upgrade from an existing local-storage layout does not erase stats; test using a disposable copy, not real user data.
- [ ] Get explicit approval before merge, release, or any extension update affecting an installed copy.

## Safe rollback/release notes

- Keep the `main` baseline SHA above available as an immutable reference. Do not force-push `main`.
- If the integration is later approved and merged, test the resulting `main` commit; the PR head and merged commit are not necessarily identical.
- If regressions appear after approval, revert the merge commit through a reviewed PR rather than rewriting history.
- No backend, credential, Supabase, GitHub Pages, or browser storage operation is performed by this review document.

## Other project boundaries (not part of this PR)

- **Tasteprint:** preserve `main` at `acca63e45dbde456aeb194088af6abde99ddf7dd` and do not accidentally enable unverified Supabase/social features.
- **TasteSocial public demo:** preserve its published build `4b88f2777c1c2ecd7020b73623390d4142941ba3`. Do not republish the separate demo artifact as part of Tasteprint cleanup.
- **Personal Job Agent:** preserve `main` at `11af6a262859847b7507ed9eca69480a5bff032f`; do not enable unattended live submissions.
- **Throwback TV:** paused; no new streaming integrations or deployment work.
