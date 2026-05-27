# ADR-0002: Render events client-side from events.json

**Date**: 2026-05-27
**Status**: Accepted

## Context

The existing homepage is a 2,443-line hand-crafted single-file HTML artifact with deliberate copy, palette (Carolina blue v5.1), typography (Fraunces + Source Sans 3), and rhythm. We need to add dynamic event content (upcoming-events list and embedded calendar) editable via [[pages-cms]]. Two rendering approaches:

1. **Client-side fetch**: keep the static HTML, add JS that fetches `events.json` and injects rendered cards into placeholder containers at runtime.
2. **Static site generator** (Astro, Eleventy, etc.): restructure the homepage into templates and partials; rebuild the entire site on every CMS commit.

## Decision

Render events client-side. The CMS edits `docs/_data/events.json`; vanilla JS in the page fetches and renders.

## Consequences

**Positive:**
- No SSG migration. The hand-crafted v5.1 HTML stays intact.
- No new build tooling for volunteers to maintain.
- Trivial to operate at expected publishing volume (handful of events at a time).
- `events.json` format ports cleanly into an SSG's data files if we ever migrate.

**Negative:**
- ~200ms loading flash before events hydrate into the page.
- No per-event URLs (e.g., `/events/2026-summer-bbq`). Events are cards on the homepage, not pages.
- Events are not SEO-indexed by search engines that don't render JS (Google does; most others don't). Acceptable because event listings are ephemeral and don't drive long-tail traffic anyway.

## When to revisit

Migrate to an SSG if any of:
- We want shareable, SEO-indexed per-event URLs.
- We add other dynamic content types (blog, member stories) that compound the JS rendering surface.
- Publishing volume grows to where rebuild-on-commit is a daily workflow rather than weekly.
