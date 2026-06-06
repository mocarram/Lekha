# WYSIWYG-Parity Campaign - Spec & Process

**Date:** 2026-06-07
**Goal:** Drive Lekha to faithful WYSIWYG parity (features, styles, UI, UX), then harden
it for security, performance, and real usage. Run as repeated **plan → spec → build →
verify** waves until the app is fully prepared.

## Scope (as directed)

1. **~50 rounds** of feature / style / UI / UX parity with WYSIWYG.
2. **~20 rounds** of security review + fixes.
3. **~20 rounds** of performance review + fixes.
4. **~20 rounds** of live-usage / real-user-usage checks + fixes.

"Rounds" are iterations of: audit (fan-out agents) → prioritized findings → implement the
ones that make sense → verify → merge. Each wave bundles related findings into one
feature branch.

## Process (per wave)

1. **Audit (workflow):** specialized agents read the Lekha source and compare to known
   WYSIWYG behavior, each returning structured findings
   `{title, wysiwyg, lekha, change, files, priority, effort}`.
2. **Triage:** dedupe + rank; pick the high-value, sane-effort, low-risk items.
3. **Build:** branch off `staging` (`feat/...` or `fix/...`), implement test-first where
   logic is involved, follow existing patterns, keep it DRY.
4. **Verify:** `npm run typecheck && npm run lint && npm test && npm run test:e2e`, plus a
   packaged-style screenshot for visual changes.
5. **Integrate:** PR `--base staging`, rebase-merge (linear history), delete branch, sync.
6. **Log:** append outcomes to the ledger (below) so progress survives context compaction.

## Guardrails

- Never touch `main`. Everything flows feature branch → `staging`.
- Keep shared contracts (`src/shared/*`) stable unless a finding requires a change.
- No regressions: the full unit + e2e suite must stay green before every merge.
- Prefer token-driven, theme-aware CSS; keep the 7 themes coherent.
- Security/perf waves must not break existing hardening (CSP, contextIsolation, sandbox).

## Capstone - Final quality pass

After all feature workstreams (menu/settings parity, design system, custom
themes, remaining parity backlog) AND the 20 security / 20 performance / 20
live-usage rounds are complete, run a final consolidated **review & polish** pass
to certify highest quality:
- **Security:** re-audit CSP, contextIsolation/sandbox, IPC input validation,
  path traversal, external-URL handling, user-CSS injection safety.
- **Performance:** cold-start, bundle size, large-document editing, scroll, find,
  render of math/diagrams/code; fix regressions.
- **UI:** visual consistency across all themes (incl. Graphite + custom), spacing,
  controls, empty states - screenshot-verified.
- **UX:** end-to-end flows (open/edit/save, folder browsing, export, theming,
  keyboard-only operation), error handling, a11y/focus.
Produce a final report, fix everything that makes sense, and only then declare
the app done.

## Ledger

Progress is tracked in `docs/superpowers/plans/wysiwyg-parity-ledger.md` (round-by-round:
what was found, what was implemented, what was deferred and why).

## Categories audited (parity wave)

Inline editing behaviors, block elements, typography/spacing, sidebar/file-tree, outline,
find & replace, images, math & diagrams, export/print, themes/appearance, shortcuts &
command palette, micro-interactions (empty states, focus/typewriter, status bar, window
chrome).
