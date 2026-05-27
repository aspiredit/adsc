# Issue 005 — Draft events hidden by default; `?preview=true` reveals them

**Type**: AFK
**Status**: Open

## What to build

Implement the draft/preview workflow described in [CONTEXT.md](../CONTEXT.md). Admins should be able to save events as drafts and review them on the live site before publishing.

Rules:
- Events with `draft: true` are filtered out of ALL public views (Featured, More Upcoming, Calendar, Archive) by default.
- When the URL contains `?preview=true`, drafts ARE included in all views — letting admins share a preview link with each other.
- The `?preview=true` filter is purely client-side; there is no separate environment, no separate URL, no separate build.
- The preview link is shareable among admins but provides no special access — anyone with the link sees drafts. That's intentional and acceptable at this scale; drafts are not secret content, just unfinished.

**TDD**: write failing tests for the filter (default behavior excludes drafts; preview mode includes them) before wiring the URL param check.

## Acceptance criteria

- [ ] Failing unit tests written first: filter excludes drafts by default; filter includes drafts when preview flag is true
- [ ] Filter applied uniformly to Featured selector, More Upcoming selector, Calendar event lookup, and Archive page (when Archive lands in issue 009)
- [ ] URL param parsing helper (small pure function: returns true if `?preview=true` in `location.search`)
- [ ] Visible indicator in preview mode (e.g., a "PREVIEW MODE — drafts visible" banner pinned at top of page) so admins don't confuse preview with live
- [ ] Saving a draft event via Pages CMS (after issue 002 lands) and visiting the homepage with `?preview=true` shows the draft in the appropriate view
- [ ] All existing tests pass; new tests pass

## Blocked by

- Issue 001 (filter applies to existing selectors)
