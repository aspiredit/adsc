# Issue 001 — Frontend renders Featured Next Event from events.json

**Type**: AFK
**Status**: Done

## What to build

Replace the hardcoded "Slick Willie's" content inside the existing `.rsvp-featured` card slot with content rendered dynamically from `docs/_data/events.json`.

This is the tracer-bullet foundation: it proves the static-JSON → fetch → DOM-render pipeline works end-to-end. All subsequent capability issues (drafts, past-event filtering, calendar, archive) build on this.

The renderer must handle three input cases from day one:
- **Zero upcoming events** → render a graceful fallback in the slot ("New events coming soon — join the mailing list to be the first to know"). Never render an empty card.
- **One upcoming event** → render it.
- **Many upcoming events** → render the chronologically nearest one (smallest `starts_at` that is still in the future, no grace logic yet — that's issue 004).

Seed `events.json` with one realistic event (e.g., the Slick Willie's meetup currently hardcoded) so the page isn't empty on first deploy.

Schema reference (per [CONTEXT.md](../CONTEXT.md)): `id`, `title`, `type`, `starts_at` (ISO 8601 in America/Chicago), `location`, `description`, `flyer`, `rsvp_url`, `cta_label`, `status`, `draft`. Renderer uses `title`, `starts_at`, `location`, `rsvp_url`, `cta_label` for v1. Other fields are tolerated but not yet rendered (covered in subsequent issues).

**TDD**: write failing tests for the renderer's pure functions first (pick-nearest-upcoming, format-date-CT, fallback selection), then implement.

## Acceptance criteria

- [ ] `docs/_data/events.json` exists with at least one seed event matching the schema
- [ ] Failing unit tests written first for: pick-nearest-upcoming, format-date-CT, empty-fallback selection
- [ ] JS module fetches `events.json` on page load and populates the `.rsvp-featured` slot
- [ ] Renders the chronologically nearest upcoming event (`starts_at > now`)
- [ ] Renders the fallback message when no upcoming events exist
- [ ] Displays `starts_at` formatted in CT with "(CT)" suffix
- [ ] CTA button uses `cta_label` if present, defaults to "RSVP"
- [ ] CTA button links to `rsvp_url` if present, defaults to master JotForm with `?event=<id>`
- [ ] Hardcoded event content in `docs/index.html` removed (slot now empty markup, populated by JS)
- [ ] Tests pass

## Blocked by

None — can start immediately.
