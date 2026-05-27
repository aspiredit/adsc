# Issue 007 — Calendar month-grid component

**Type**: AFK
**Status**: Done

## What to build

Add a calendar month-grid component to the homepage, inserted between the RSVP section and the Lead Magnet section. Reads from the same `events.json` as the rest of the site (see [ADR-0003](../adr/0003-calendar-reads-events-json-not-google-embed.md) for why we're NOT embedding Google Calendar).

Behavior:
- Renders the current month as a 7-column grid (Sun–Sat), one cell per day.
- Days outside the current month appear muted/grey.
- Today's date is visually highlighted.
- Dates with one or more events get a colored dot (Carolina blue for `meetup`/`other`, gold for `family_event`/`fundraiser` — small visual differentiation by type).
- Clicking a date with events scrolls smoothly to that event's card in the "More Upcoming Events" list, or focuses the Featured card if it's the nearest one. If the event isn't in the upcoming list (it's past), no scroll behavior — just visual feedback.
- Previous/next month navigation buttons. Past months show past events on their actual dates (calendar acts as visual archive of when things happened).
- Honors draft filter from issue 005 (drafts hidden unless `?preview=true`).

Visual:
- Carolina blue (`--blue-deep`) for header and event dots
- Fraunces for the month heading ("June 2026"), Source Sans 3 for day numbers
- Match the visual rhythm of the surrounding sections — generous padding, no harsh borders
- Mobile-responsive: collapses to a more compact representation on narrow screens (still grid, smaller cells)

~150 lines of vanilla JS + CSS. No library dependencies.

**TDD**: write failing tests for the month-grid generator (pure function: given a year + month, returns the 6×7 grid with day numbers and out-of-month flags), the event-to-date mapper, and the dot-color selector before rendering.

## Acceptance criteria

- [ ] Failing unit tests written first for: month-grid generator, event-to-date mapper, dot-color-by-type selector, today-detection logic
- [ ] New `<section id="calendar">` inserted between RSVP and Lead Magnet sections in `docs/index.html`
- [ ] Component renders current month on load
- [ ] Today's date highlighted
- [ ] Event dots render on correct dates, color-coded by event type
- [ ] Previous/next month navigation works without page reload
- [ ] Clicking a date with upcoming events scrolls to the corresponding event card
- [ ] Draft filter honored (`?preview=true` shows draft events on calendar)
- [ ] Mobile-responsive layout works on 320px width and up
- [ ] Calendar visually matches v5.1 design system (Carolina blue, Fraunces, generous padding)
- [ ] No external library dependencies (vanilla JS + CSS only)
- [ ] Tests pass

## Blocked by

- Issue 001 (events.json + render infrastructure)
