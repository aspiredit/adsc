# Issue 006 — Flyer image renders on event cards with typographic fallback

**Type**: AFK
**Status**: Done

## What to build

Add flyer image rendering to event cards. The full flyer specification is captured in the [Flyer term in CONTEXT.md](../CONTEXT.md): 1080×1080 square PNG, Canva-exported, max 2 MB, stored at `docs/assets/events/<event-id>.png`.

Behavior:
- If the event has a `flyer` field set → render the image in the card.
- If the event has no `flyer` field (or the field is empty) → render a typographic fallback: bold event title set in Fraunces, type label as a pill (e.g., "MEETUP", "FAMILY EVENT"), Carolina blue (`--blue-deep`) background. Never render a broken image.

Apply to both the Featured Next Event card (issue 001) and the More Upcoming cards (issue 003).

The typographic fallback should look intentional, not like a missing image. Use the same square 1:1 aspect ratio as the flyer slot would have, so the card layout doesn't shift based on whether a flyer is present.

**TDD**: write failing tests for the renderer's flyer-vs-fallback branching before implementing.

## Acceptance criteria

- [ ] Failing unit tests written first: card renders `<img>` when flyer set; card renders typographic block when flyer absent or empty string
- [ ] Featured card uses real flyer at full size; More Upcoming cards use flyer at compact size (or hide it — confirm with design pass)
- [ ] Typographic fallback uses Carolina blue background, Fraunces title, type label as pill
- [ ] Card layout dimensions stable regardless of flyer presence (no layout shift)
- [ ] Image `alt` attribute populated from event title for accessibility
- [ ] Images lazy-loaded (`loading="lazy"`) to keep page weight low
- [ ] Tests pass

## Blocked by

- Issue 001 (Featured card structure to attach the image into)
