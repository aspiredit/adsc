# ADR-0004: Migrate static HTML to Astro + TinaCMS for visual editing

**Date**: 2026-06-04
**Status**: Accepted (plan); implementation pending user trigger

## Context

After ~3 months on the current stack (vanilla HTML in `docs/index.html` + Pages CMS for event/blog/photo content), the constraint that surfaced is **admin editing autonomy beyond the predefined content slots**. Pages CMS gives admins form-based editing for the content shapes we predefined (events, blog posts, photos), but anything else — hero copy, board roster, sponsor list, program descriptions, the testimonial quote — requires a developer to edit `docs/index.html`.

User explicitly asked for "Squarespace-level edits using open source software." Three open-source options were evaluated:

1. **TinaCMS** — visual in-place editor; admins click on the live page and edit. Free for nonprofits. Layers on a framework-rendered site.
2. **WordPress + Gutenberg/Elementor** — true visual drag-drop; massive ecosystem; requires full rebuild + ongoing plugin maintenance.
3. **Webstudio** — newest, literal Squarespace clone, OSS; small community / platform risk.

TinaCMS was chosen because:
- Preserves the custom design we've built (no rebuild from templates)
- Admins click-to-edit on the live page, the closest UX to Squarespace
- Free for 501(c)(3) via Tina Cloud nonprofit plan
- Edits commit back to git, so we keep our existing GitHub-based content workflow

**Caveat surfaced during decision**: TinaCMS's in-place editing requires the site to be rendered by a framework (Astro / Next.js / Hugo / Jekyll), not vanilla HTML. So adopting Tina requires migrating off the single hand-written `index.html` to a framework with structured content.

Astro chosen over Jekyll because:
- Astro syntax is essentially vanilla HTML + JS components — porting the existing file is largely copy-paste, not re-learning Liquid
- First-class TinaCMS integration (Tina publishes Astro starter templates)
- Modern, actively developed, growing community
- Trade-off accepted: requires GitHub Actions to build (vs Jekyll which Pages builds natively). Adds one CI file; otherwise no operational overhead.

## Decision

Migrate `docs/index.html` to an Astro project. Extract page content (hero, board, programs, sponsors, etc.) into Astro content collections (markdown + frontmatter). Wire TinaCMS on top so admins can visually edit the content via Tina Cloud.

Pages CMS remains live until cutover; users are not interrupted during migration.

## Consequences

**Positive:**
- Admins edit hero copy, board roster, programs, sponsors, testimonials directly on the live site
- The custom design (Carolina blue palette, Fraunces + Source Sans 3, all the bespoke section layouts) is preserved verbatim
- No monthly cost: GitHub Pages + Tina Cloud nonprofit plan both free
- Content is still git-versioned — every edit is a commit, every change is reversible
- Future content additions (new section, new page) become editable by design

**Negative:**
- Build pipeline becomes more complex: GitHub Actions builds Astro → publishes `dist/` to `gh-pages` branch
- Admins need a second login (Tina Cloud) on top of GitHub
- ~3–5 working sessions of migration work
- The current `docs/index.html` becomes ~20 component/template files; cognitive overhead for any developer is higher than one big file
- TinaCMS itself is a dependency: if Tina Cloud sunsets the free nonprofit tier we'd self-host (manageable) or fall back to Decap/Pages CMS

## Migration plan

### Phase 1 — Framework port (work on `astro-migration` branch)

1. `npm create astro@latest` in a new sibling directory; copy into the repo on a feature branch
2. Port `docs/index.html` to Astro components, section by section:
   - `Nav.astro`, `Hero.astro`, `BoardStrip.astro`, `AdvisoryStrip.astro`, `OurStory.astro`, `Programs.astro`, `Calendar.astro`, `Membership.astro`, `Donate.astro`, `Sponsors.astro`, `Footer.astro`
   - Inline CSS stays inline (in the layout) initially; refactor later
3. Extract content to `src/content/` collections:
   - `board/*.md` (one file per executive member: name, role, photo, credentials, bio, "what they bring as a dad")
   - `advisors/*.md` (one file per advisory board member)
   - `programs/*.md` (mixers, family gatherings, virtual connections, pool hall — each with image, copy, offerings list)
   - `sponsors/*.md` (one file per sponsor: name, logo, URL)
   - `site-config.json` (hero text, EIN, social links, mailing address — single-instance content)
4. Migrate existing events/blogs/photos collections (already structured) into Astro content collections; events.json renderer logic moves to Astro components
5. Set up GitHub Actions workflow:
   - `npm run build` → outputs `dist/`
   - Deploy `dist/` to `gh-pages` branch
6. Update Pages source from `/docs` to `gh-pages` branch
7. Verify the live site is byte-equivalent to the current one (visual regression check)

### Phase 2 — TinaCMS wire-up

1. Sign up for Tina Cloud (apply for nonprofit free plan; submit 501(c)(3) EIN 99-2055011)
2. `npx @tinacms/cli init` in the Astro project
3. Define Tina schema mirroring the content collections from Phase 1
4. Configure GitHub OAuth so admins can log in with their GitHub accounts (same identity as current Pages CMS — no new accounts to manage)
5. Restrict editor access to the 2–3 admin GitHub accounts via Tina Cloud team settings
6. Test the visual editing flow on the live site

### Phase 3 — Cutover + admin training

1. Schedule a 1-week dry-run window where admins use Tina on staging
2. Cut over: Pages CMS read-only; Tina becomes the canonical editor
3. Write a one-page `EDITING-GUIDE.md` for admins: how to log in, how to edit, how to add a new board member, how to swap a sponsor logo, how to save (which auto-commits)
4. 30-min walkthrough with each admin
5. Keep Pages CMS configured but unused for 4 weeks as a fallback; remove after confidence is established

## Rollback plan

If anything goes wrong post-cutover:
- The `gh-pages` branch is rebuilt from main; revert `astro-migration` merge → Pages serves `docs/` again as it does today
- All content commits during the Tina era live in the repo as markdown — recoverable even if Tina Cloud disappears
- Worst case: lose ~1–2 weeks of admin-made content edits and revert to the last pre-migration state

## Open questions for trigger time

- Confirm Tina Cloud nonprofit application is approved before starting Phase 2 (the alternative is self-hosting Tina's git backend, more work)
- Confirm which 2–3 admins should have edit access; gather their GitHub usernames
- Decide what happens to the current `events.json` file structure — keep `{events: [...]}` wrapper for backward-compat or flatten in the migration

## References

- TinaCMS docs: https://tina.io/docs/
- Astro + Tina starter: https://tina.io/docs/frameworks/astro/
- Pages CMS (current solution being replaced): see [[ADR-0001]]
- Client-side rendering pattern being moved into Astro components: see [[ADR-0002]]
