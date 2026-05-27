# ADR-0003: Calendar reads from events.json, not a Google Calendar embed

**Date**: 2026-05-27
**Status**: Accepted

## Context

The homepage needs an embedded calendar view of Events. The obvious option is a Google Calendar iframe — fast to add, free, members already know how to use it. The non-obvious cost is that it requires a second source of truth: Admins would add Events both in [[pages-cms]] AND in the shared Google Calendar.

## Decision

Build a hand-rolled month-grid component that reads from the same `events.json` the upcoming-events list uses. Provide a per-event "Add to my calendar" button that generates an `.ics` file in the browser, so members can still pull events into their personal calendar app of choice.

## Consequences

**Positive:**
- Single source of truth — Admins add an Event once in the CMS; both views update.
- Visual consistency with the v5.1 design system (Carolina blue, Fraunces). No iframe styling fight.
- No third-party dependency on a Google Calendar account staying available or correctly shared.
- ~150 lines of vanilla JS, no library dependency.

**Negative:**
- Members can't subscribe to a live calendar feed (yet). They can only download individual `.ics` files for events they want. If subscription becomes a request, generating an `.ics` feed alongside `events.json` is a small addition.
- More code we own vs an iframe we don't.

## Alternatives rejected

- **Google Calendar iframe embed**: Drift between Pages CMS and Google Calendar is the dominant failure mode for this pattern. Auto-syncing via the Google Calendar API would require a Cloud Function and a service account — meaningful complexity for a feature that's primarily decorative.
- **FullCalendar.js**: 200kb library designed for SaaS scheduling apps. For a passive month grid with ~5-10 visible events at a time, the bundle weight and generic UI aren't justified.
