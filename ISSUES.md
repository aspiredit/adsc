# Event Management System — Tracking

Tracer-bullet vertical slices for the event management system designed in the grilling session. See [CONTEXT.md](CONTEXT.md) for terminology and [adr/](adr/) for architectural decisions.

GitHub Issues was skipped (PAT scope friction); tracking lives here instead. Each issue is a markdown file in [issues/](issues/) with the standard "What to build / Acceptance criteria / Blocked by" template.

## Dashboard

| # | Title | Type | Status | Blocked by |
|---|---|---|---|---|
| [001](issues/001-featured-next-event.md) | Frontend renders Featured Next Event from events.json | AFK | Open | — |
| [002](issues/002-pages-cms-connected.md) | Pages CMS connected; admin can CRUD events | HITL | Open | 001 |
| [003](issues/003-more-upcoming-events.md) | "More Upcoming Events" list renders below Featured | AFK | Open | 001 |
| [004](issues/004-past-events-grace-period.md) | Past events filtered with 12hr grace | AFK | Open | 001 |
| [005](issues/005-draft-events-preview-mode.md) | Draft events hidden; `?preview=true` reveals | AFK | Open | 001 |
| [006](issues/006-flyer-with-fallback.md) | Flyer image with typographic fallback | AFK | Open | 001 |
| [007](issues/007-calendar-month-grid.md) | Calendar month-grid component | AFK | Open | 001 |
| [008](issues/008-add-to-my-calendar-ics.md) | "Add to My Calendar" `.ics` download | AFK | Open | 006 |
| [009](issues/009-past-events-archive-page.md) | Past Events archive page at `/past-events/` | AFK | Open | 004, 006 |
| [010](issues/010-admin-onboarding.md) | Admin onboarding: second admin end-to-end | HITL | Open | 002 |

## Suggested order

The critical path is **001 → 002 → 010**. Issues 003-007 can be tackled in any order once 001 lands (they're independent capabilities all reading the same `events.json`). Issues 008 and 009 depend on 006.

1. **Phase 0 — Tracer bullet** (001, 002): proves the round-trip from CMS edit to live site
2. **Phase 1 — Capability fill-in** (003, 004, 005, 006, 007): parallel-friendly slices
3. **Phase 2 — Derived features** (008, 009): build on the card template and filter logic
4. **Phase 3 — Operational** (010): hand the system to real second admin

## Conventions

- **AFK** = Away From Keyboard. No human interaction required during implementation. An autonomous agent or solo developer can finish without external blocks.
- **HITL** = Human In The Loop. Requires a real person to log in somewhere, click through OAuth flows, or do something that can't be scripted.
- **TDD baked into AFK criteria** — write failing tests first, then implement. Tests live in `tests/` at the repo root (outside `docs/` so they're not deployed to the public site). Vitest as the runner — it handles ESM natively, no build step required, dev-only dependency.

## Updating status

When an issue completes:
1. Update the **Status** column in this table from `Open` to `Done`
2. Change `**Status**: Open` to `**Status**: Done` in the issue file's frontmatter
3. (Optional) Add a one-liner under the issue's acceptance criteria with the commit SHA or PR link
