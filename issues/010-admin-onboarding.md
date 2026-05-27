# Issue 010 — Admin onboarding: second admin added end-to-end

**Type**: HITL
**Status**: Open

## What to build

Operationalize the admin model. Issue 002 proved the CMS works for one admin (you). This issue confirms it works for a real second admin who has zero prior context — typically Donny or another leadership member.

Two pieces of work:

1. **Write `docs/admin-onboarding.md`** (internal doc, not deployed to the public site — actually, since `docs/` is the Pages source, place this at repo root as `ADMIN-ONBOARDING.md`). Document:
   - How to create a GitHub account (link to GitHub signup, recommended username convention)
   - How to enable MFA (TOTP via Authenticator app — Google Authenticator, Authy, or 1Password)
   - How they'll receive the collaborator invitation and how to accept it
   - How to sign in to Pages CMS at `app.pagescms.org`
   - How to add a new event (step-by-step, with what each field means)
   - How to upload a Canva flyer (export PNG at 1080×1080, drag into form)
   - How to save as draft and preview via `?preview=true`
   - How to publish
   - How to edit or cancel an existing event
   - Who to contact if something breaks (you, named)

2. **Add a real second admin end-to-end**:
   - Pick the admin (Donny or whoever the second-most-active leader is)
   - Confirm they have/create a GitHub account with MFA enabled
   - Add them as a collaborator on `aspiredit/adsc` with the **Write** role (NOT Admin)
   - Send them the onboarding doc
   - Sit with them (or screen-share) while they:
     - Accept the collaborator invitation
     - Sign in to `app.pagescms.org`
     - Authorize the Pages CMS GitHub App
     - Create a test draft event
     - Verify it shows on the site with `?preview=true`
     - Publish or delete the test event
   - Capture any friction points encountered and update the onboarding doc

## Acceptance criteria

- [ ] `ADMIN-ONBOARDING.md` written at repo root, covering all steps listed above
- [ ] Second real admin added as Write collaborator on `aspiredit/adsc`
- [ ] Second admin has MFA enabled on their GitHub account (verified by them)
- [ ] Second admin successfully signs into Pages CMS and creates a draft event
- [ ] Draft visible on live site via `?preview=true`
- [ ] Second admin successfully publishes or deletes the draft
- [ ] Onboarding doc updated with any gotchas encountered during this dry run
- [ ] Optional: third admin onboarded with the doc unattended (proves the doc stands alone)

## Blocked by

- Issue 002 (Pages CMS must already be working for one admin before we can verify it works for a second)
- Issue 005 recommended (preview mode needed for the draft → review → publish flow to be exercised end-to-end)
