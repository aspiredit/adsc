# Issue 009 — Past Events archive page at `/past-events/`

**Type**: AFK
**Status**: Done

## What to build

Add a separate archive page at `docs/past-events/index.html` (URL: `https://aspiredit.github.io/adsc/past-events/`) listing all past events in reverse chronological order. Reads the same `events.json` as the main page.

Behavior:
- Fetches `events.json` on load
- Filters to events where `starts_at + 12h <= now` (the inverse of the upcoming filter from issue 004)
- Sorts reverse chronological (newest past event first)
- Renders cards using the same card template as the main page (per issue 006 — flyer with typographic fallback)
- Adds a "PAST" badge to each card (small pill, muted color) so the visual distinction from upcoming is obvious
- Honors draft filter from issue 005 (drafts excluded unless `?preview=true`)
- No pagination in v1 (acceptable at expected volume; revisit if archive exceeds ~50 events)

Page structure:
- Reuses the existing header, footer, fonts, and CSS variables from `docs/index.html`
- Page title: "Past Events — Autism Dads Social Club"
- Single content section: heading "Past Events" + card grid
- Footer-links back to the main homepage

Footer link on main homepage:
- Add "Past events" link to one of the footer columns in `docs/index.html`
- Per design grilling: footer placement, NOT main nav (see [CONTEXT.md Archive term](../CONTEXT.md))

**TDD**: write failing tests for the past-events filter (inverse of upcoming, sorted reverse-chrono) before implementing the page.

## Acceptance criteria

- [ ] Failing unit tests written first: filter returns events where `starts_at + 12h <= now`, sorted newest first
- [ ] `docs/past-events/index.html` created
- [ ] Page loads, fetches events.json, renders past events as cards
- [ ] Cards use same template as main page (flyer + fallback per issue 006)
- [ ] "PAST" badge on each card
- [ ] Reverse-chronological order
- [ ] Draft filter honored
- [ ] Empty state: when no past events exist, page shows "No past events yet — we're just getting started."
- [ ] Footer link to `/past-events/` added on main homepage
- [ ] Page styling matches main site (Carolina blue, Fraunces, footer)
- [ ] Tests pass

## Blocked by

- Issue 004 (past-event filter logic — invert the same predicate)
- Issue 006 (card template with flyer + fallback)
