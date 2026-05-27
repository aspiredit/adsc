# Issue 004 — Past events filtered out with 12hr grace period

**Type**: AFK
**Status**: Done

## What to build

Apply a 12-hour grace window when filtering past events out of the upcoming-events views (Featured Next Event and More Upcoming). An event is considered "still upcoming" while `starts_at + 12 hours > now`.

Why the grace period (per [CONTEXT.md](../CONTEXT.md)): a member checking the site at 6:58 PM for a 7:00 PM meetup must still see the event. Hiding it the instant `starts_at` passes is hostile UX. 12 hours gets the event through the evening and clears it from the upcoming list by next morning.

This filter applies to:
- Featured Next Event selector (issue 001) — currently uses `starts_at > now`; update to `starts_at + 12h > now`
- More Upcoming Events selector (issue 003) — same rule

This filter does NOT apply to:
- Calendar grid (issue 007) — past events stay visible in their historical date cells
- Archive page (issue 009) — past events are the entire point of that page

**TDD**: write failing tests for the grace-period boundary condition (event exactly 11h 59m past, 12h 1m past, etc.) before updating the existing selectors.

## Acceptance criteria

- [ ] Failing unit tests written first covering boundary conditions: event 12h - 1min past (still visible), event 12h + 1min past (filtered)
- [ ] Featured selector updated to apply 12h grace
- [ ] More Upcoming selector updated to apply 12h grace
- [ ] Calendar grid unaffected (events show on their actual dates regardless of past status)
- [ ] No `ends_at` field required (the grace is uniform; multi-day events are deferred per design)
- [ ] All existing tests still pass; new boundary tests pass

## Blocked by

- Issue 001 (Featured Next Event selector needs to exist)
- Issue 003 recommended but not strictly required (More Upcoming selector to be updated)
