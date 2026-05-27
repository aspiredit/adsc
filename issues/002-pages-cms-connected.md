# Issue 002 — Pages CMS connected; admin can CRUD events

**Type**: HITL
**Status**: Open

## What to build

Wire Pages CMS to this repository and prove the full edit loop works end-to-end: admin logs into `app.pagescms.org` with their GitHub account (MFA enforced by GitHub), edits an event via the CMS form, saves, and the change appears on the live site within ~60 seconds.

This is the "ammo in both directions" half of the tracer bullet. Issue 001 proves the read path (JSON → site). This proves the write path (CMS → JSON → site) and lets us stop hand-editing `events.json` for everything that follows.

Two pieces of work:

1. **Author the schema** — create `.pages.yml` at repo root defining the event collection: all 11 fields with correct types (string, datetime locked to America/Chicago, select with the four type options, image, text, boolean for `draft`, select for `status`). Field labels and help text should match what a non-technical admin needs (e.g., "Start (CT)" not "starts_at"). Datetime field must be locked to America/Chicago so admins enter "7 PM" without thinking about UTC.

2. **Connect Pages CMS to the repo** — go through the one-time setup at `app.pagescms.org`: sign in with the `aspiredit` GitHub account, install the Pages CMS GitHub App on the `adsc` repo, confirm the schema is detected, verify the seed event from issue 001 appears in the form.

Then verify end-to-end:
- Change the seed event's title or start time via the CMS form
- Hit Save
- Commit appears in the repo history attributed to the admin
- GitHub Pages rebuild kicks off
- Live site reflects the change within ~60 seconds

## Acceptance criteria

- [ ] `.pages.yml` exists at repo root with the full event collection schema
- [ ] All 11 fields defined with appropriate types, labels, help text, and required/optional flags per [CONTEXT.md](../CONTEXT.md)
- [ ] `starts_at` field locked to America/Chicago timezone in the form
- [ ] `flyer` field configured as image upload, max 2 MB, target path `docs/assets/events/`
- [ ] Pages CMS GitHub App installed on `aspiredit/adsc`
- [ ] Admin successfully logs into `app.pagescms.org` with GitHub account (MFA required)
- [ ] Seed event from issue 001 visible in the CMS dashboard
- [ ] End-to-end edit verified: admin changes a field, saves, commit appears, site updates within 60s
- [ ] Onboarding notes captured for issue 010 (any gotchas during setup)

## Blocked by

- Issue 001 (need events.json existing with the renderer reading it, so CMS edits are observable on the site)
