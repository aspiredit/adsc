# Context

Glossary for the ADSC (Autism Dads Social Club) homepage and its event management system. This file is a glossary, not a spec — define what terms mean in this domain, not how they're implemented.

## Terms

### Event
A scheduled gathering — meetup, family event, fundraiser, etc. — that Admins publish to the homepage. Each Event has a single canonical time, location, RSVP destination, and optional Flyer. Events render as cards in the "Upcoming Events" section and as entries in the embedded calendar. Past events (those with `starts_at` in the past) are automatically excluded from these views; they are not deleted, just hidden.

### Event Type
A categorical label on an Event that drives visual treatment and audience signaling. Current values: `meetup` (dads-only), `family_event` (bring kids), `fundraiser`, `other`. Not the same as Event Status — Type is about audience and purpose; Status is about whether the event will happen at all.

### Event Status
Whether an Event is `scheduled`, `cancelled`, or `postponed`. "Past" is NOT a status — it's derived from `starts_at`. Cancelled events stay visible (with a banner) until their start time passes, so prior RSVPers see the cancellation. Status is independent of [[draft]] — an event can be a cancelled draft (not yet visible publicly) or a cancelled published event (visible with cancellation banner).

### Draft
An Event the Admin has saved but not yet published. Drafts are stored in `events.json` like any other Event but carry `draft: true`. The site renderer filters them out by default. Admins can review the live site with drafts visible by visiting the homepage with `?preview=true` appended to the URL — this is a client-side filter, not a separate environment, so the URL is shareable among Admins for review. Pages CMS additionally provides a live-render preview pane in the form editor, so Admins can see what the card will look like as they fill in fields.

### Admin / Editor
A person authorized to add, edit, or delete Events via the [[pages-cms]] interface. Identified by their GitHub account having **Write access on the `aspiredit/adsc` repo** (added as a collaborator with the "Write" role — NOT "Admin"). The role currently maps to 2-3 leadership members. Authentication and MFA are inherited from GitHub itself — the site has no separate user store.

The blast radius of an Admin account is "anything you can do with repo write access" — not just events. That includes pushing changes to any file in the repo. We accept this because (a) Pages CMS uses GitHub OAuth tokens scoped to the admin's account, which inherits GitHub's permission model, and (b) at 2-3 trusted admins, MFA + git history attribution is a sufficient security posture for nonprofit content. If we ever needed truly path-scoped access (write to `docs/_data/events.json` and `docs/assets/events/*` only), we would have to move events to a separate repo or switch off Pages CMS — neither is justified at current scale.

### Flyer
A Canva-designed promotional image attached to an Event. Optional. Locked aspect ratio: 1080×1080 square PNG, exported from Canva's "Instagram Post" template size. Max file size 2 MB enforced by the CMS. When absent, the event card renders a typographic fallback (bold event title, type label as a pill, Carolina blue background) — never a broken image. Stored in `docs/assets/events/<event-id>.png`.

### RSVP
The mechanism by which a member signals attendance. The site uses a single master JotForm (id `231637325042146`) across all Events. Per-event distinction comes from the `?event=<id>` query parameter passed to the form, which JotForm tags onto each submission. An Event can override its `rsvp_url` (e.g., for a paid fundraiser handled via Eventbrite), but the default is the master form. We deliberately do NOT spin up a new JotForm per event — that would force Admins to maintain forms in two places.

### CTA Label
The text on an Event's RSVP button. Defaults to "RSVP" but is typically overridden per event for specificity (e.g., "Save my seat at Slick Willie's") — the event-specific copy convention established in v5.1.

### Time Zone
All Event `starts_at` values are stored and entered in `America/Chicago` (Houston Central Time, with DST handled by the IANA database). The Pages CMS datetime field is locked to this timezone — Admins enter "7 PM" without thinking about UTC offsets. The site displays times with a "(CT)" suffix so out-of-town members aren't confused. If ADSC ever runs an Event outside Houston (e.g., a sponsored trip in a different state), the schema will need a per-event timezone field; until then, single-TZ keeps the admin form simple.

### Pages CMS
The third-party hosted admin interface at `app.pagescms.org` that Admins use to manage Events. Reads and writes files in this repo via a GitHub OAuth bridge that Pages CMS hosts. Distinct from GitHub Pages, which is the static-site hosting on which adsc lives.

### Upcoming Events
The forward-looking event list rendered on the homepage. Includes the [[featured-next-event]] (top spot, large card) plus any additional scheduled Events occurring within the visible horizon. An Event is considered "upcoming" while `starts_at + 12 hours > now` — giving a grace window so day-of attendees doing a last-minute lookup still see the event details. After the grace window passes, the Event drops off the upcoming list and lives on in the [[calendar]] grid and the [[archive]] page.

### Featured Next Event
The single chronologically-nearest upcoming Event, rendered as a large card in the RSVP section of the homepage. The card slot already exists in the v5.1 markup as hardcoded HTML; in the dynamic system this slot is populated from `events.json` at runtime. If no upcoming Events exist, the slot renders a fallback ("New events coming soon — join the mailing list to be the first to know") rather than being empty.

### Archive
A separate page at `/past-events/` listing all Events with `starts_at + 12 hours <= now`, sorted reverse chronologically. Same card design as the upcoming list but with a "Past" badge and subtle visual de-emphasis. Reads from the same `events.json`. Linked from the footer, not the main nav, since this is a "look back" exploration rather than a primary action. Past Events are never auto-deleted from `events.json` — the archive shows the full historical record.

### Calendar
The embedded month-grid view on the homepage that displays Events visually. Reads directly from `events.json` — the same source as the upcoming-events list. We deliberately do NOT embed Google Calendar; doing so would force Admins to maintain Events in two places (CMS + Google), creating drift. The Calendar is decorative-functional: month view only, current month highlighted, clicking a date with Events scrolls to those event cards.

### Add to My Calendar
A per-event action that generates an `.ics` file in the browser when clicked. The user's device (phone, Mac, Outlook) opens its native "Add to Calendar" dialog. This gives members calendar-integration value without requiring a second source of truth on our side. Distinct from a Calendar subscription feed, which we do not currently offer.

### Schema vs Data
Two distinct files with different lifecycles:
- **Schema** (`.pages.yml` at repo root): defines what fields an Event has. Hand-edited by developers only. Changes when adding or removing a field from the admin form.
- **Data** (`docs/_data/events.json`): contains the actual Events. Generated and updated by the CMS on every Admin Save. Never hand-edited.
