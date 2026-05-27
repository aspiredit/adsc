# Issue 003 — "More Upcoming Events" list renders below Featured

**Type**: AFK
**Status**: Done

## What to build

Add a sub-grid in the RSVP section that renders the next 2-3 upcoming events after the Featured Next Event. Provides a "browse a few options" alternative for members who can't make the featured event.

Behavior:
- If `events.json` has exactly 1 upcoming event → only Featured renders, this sub-grid is hidden entirely (no empty container, no "more events coming" heading).
- If 2-4 upcoming events exist → Featured renders the nearest one, sub-grid renders the next 1-3 in chronological order.
- Cap visible at 3 in the sub-grid; if more exist, they live in the calendar grid (covered by issue 007) but don't bloat the homepage.

Cards in this sub-grid are smaller than the Featured card — title, date+time (CT), location, "RSVP" link (using same `cta_label`/`rsvp_url` defaults as the Featured renderer). No flyer image in this view (compact form).

**TDD**: write failing tests for the upcoming-list selector (returns 0/1/2/3 events excluding the featured) before implementing the renderer.

## Acceptance criteria

- [ ] Failing unit tests written first for the upcoming-list selector (excludes featured, caps at 3, returns empty when none)
- [ ] New container `<div id="more-upcoming">` added inside the RSVP section, below the form
- [ ] Renderer populates it with up to 3 event cards in chronological order
- [ ] Container is hidden when no additional upcoming events exist
- [ ] Card layout is compact (no flyer image), matches v5.1 visual language (Carolina blue, Fraunces headings)
- [ ] Each card links to `rsvp_url` with `cta_label` per the master JotForm convention
- [ ] Tests pass

## Blocked by

- Issue 001 (renderer infrastructure + events.json)
