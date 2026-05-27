# Issue 008 — "Add to My Calendar" (.ics) download on each event card

**Type**: AFK
**Status**: Done

## What to build

Add an "Add to my calendar" button on each event card (Featured + More Upcoming). Clicking it generates a valid `.ics` file in the browser and triggers a download. The user's device (iPhone, Mac Calendar, Outlook, Google Calendar mobile) opens its native "Add to Calendar" dialog, pre-filled with the event details.

This is the "subscribe" affordance that members would otherwise expect from a Google Calendar embed. We don't have a subscription feed (yet), but per-event ICS downloads cover the 95% case: "I want this one event on my phone."

Behavior:
- Client-side ICS generation — no server, no Cloud Function. Pure JS function that takes an event object and returns an ICS string.
- ICS must be valid per RFC 5545: include `VCALENDAR`, `VEVENT`, `UID` (use event `id`), `DTSTART` (with `TZID=America/Chicago`), `SUMMARY`, `LOCATION`, `DESCRIPTION`, `URL` (pointing back to the homepage).
- Default duration: 2 hours (since we don't store `ends_at` per design). DTEND = DTSTART + 2h.
- Filename: `<event-id>.ics`.
- Special character handling: escape commas, semicolons, newlines per RFC 5545.

Button placement:
- Below the RSVP CTA on each card, smaller visual weight than RSVP (RSVP is the primary action, calendar download is secondary).
- Button copy: "Add to my calendar" (lowercase per v5.1 voice — confirm with design pass).

**TDD**: write failing tests for the ICS generator first. Test cases:
- Basic event renders all required fields
- Special characters (commas, semicolons, newlines in title/location/description) escaped correctly
- Timezone correctly tagged as `America/Chicago`
- DTEND calculated as DTSTART + 2h
- Generated string parses successfully by a standard ICS parser (use a tiny library in tests, not runtime)

## Acceptance criteria

- [ ] Failing unit tests written first for ICS generator (basic event, special characters, timezone, duration)
- [ ] Pure function `eventToICS(event) → string` implemented
- [ ] "Add to my calendar" button rendered on Featured Next Event card
- [ ] Button rendered on More Upcoming Events cards
- [ ] Click handler generates ICS string, creates Blob, triggers download with filename `<event-id>.ics`
- [ ] Verified manually on iOS (Apple Calendar) and at least one other platform (Google Calendar mobile, Outlook desktop, or Mac Calendar)
- [ ] Special characters in event data don't break the ICS file
- [ ] Tests pass

## Blocked by

- Issue 006 (button placement integrates with the card template)
