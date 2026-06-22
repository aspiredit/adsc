---
id: 014
title: Mobile app (iOS + Android) via PWA + Capacitor — build-ready, publish-gated
type: Epic
status: Backlog (parked)
depends_on: —
---

## Why

Reach dads where they live — on their home screens — and enable push notifications for new meetups, family events, and posts. Wrap the *existing* site rather than rebuild it, so we keep one source of truth and near-zero cost. This is a parked "good-to-have" on the sidelines: it must **not change or risk current website behavior**, and it can be **built and staged without approval**, but **publishing to the production app stores requires explicit approval**.

## What

Package the current static site (HTML/CSS/JS on GitHub Pages, content via JSON manifests) as native apps for the **Apple App Store** and **Google Play**, using a **PWA core + Capacitor** wrapper. Bundle the app shell; fetch dynamic content (events/blog/photos JSON) live so content stays CMS-driven. Add native value (push, offline) so it passes Apple's "minimum functionality" review (Guideline 4.2). All web-affecting work is **additive** — the live site stays visually and behaviorally identical, and the full test suite stays green.

Tracer-bullet vertical slices (TDD on AFK slices; each is its own ticket when activated):

- [ ] **A. PWA shell** (AFK) — `manifest.webmanifest`, square/maskable app icons generated from the logo, service worker caching the shell → installable + offline shell. *Blocked by: —*
- [ ] **B. App-context data base-URL** (AFK, TDD) — data layer fetches live events/blog/photos JSON via absolute URL when running in the app, relative on web; unit-tested resolver. *Blocked by: —*
- [ ] **C. App-friendly web behaviors** (AFK, TDD) — external links (PayPal/JotForm/Join It/social) open in the system browser; safe-area insets for notches; standalone back/nav; unit-tested internal-vs-external link classifier. *Blocked by: A*
- [ ] **D. Offline content caching** (AFK, TDD) — service worker caches dynamic JSON + images for offline reads; cache-strategy unit tests. *Blocked by: A*
- [ ] **E. Capacitor scaffold** (HITL) — generate iOS + Android projects that load the shell; Android runs in emulator (iOS needs a Mac/Xcode). *Blocked by: A, B*
- [ ] **F. Push notifications (FCM, opt-in)** (HITL) — device registers a token; test push for new events/posts displays; needs Firebase + APNs key. *Blocked by: E*
- [ ] **G. Privacy policy page + data-collection inventory** (AFK) — publish `/privacy`; gather facts for App Privacy + Play Data Safety forms. *Blocked by: —*
- [ ] **H. Signing & secrets hygiene + internal build pipeline** (HITL) — `.gitignore` for keystore/`.p12`/`.p8`/service-account/`.env`; managed signing (Play App Signing, Apple-managed); builds to **TestFlight + Play internal**. *Blocked by: E*
- [ ] **I. Store listing assets, drafted & held** (HITL) — 1024² icon, screenshots per device, descriptions/keywords. *Blocked by: E, G*
- [ ] **J. Production publish to App Store + Play** (HITL — APPROVAL-GATED) — the single release gate. *Blocked by: F, H, I + explicit human approval*

## Constraints / guardrails

- **Do not change current site behavior.** Slices A–D, G are additive only; existing tests must stay green.
- **Build/stage is allowed without approval** (through TestFlight + Play internal testing).
- **Production publish (slice J) requires explicit approval.**
- Repo stays **public**; only signing secrets are kept out (gitignored + managed signing + CI secrets). Firebase *client* config is fine to commit; lock it down via API-key restrictions + Firestore rules.
- Prerequisites for HITL slices: Apple Developer ($99/yr), Google Play ($25 one-time), a **Mac/Xcode** (or cloud-Mac CI) for iOS.
- Payments note: Donate (PayPal) / Membership (Join It) must follow Apple's nonprofit external-donation rules — register as a nonprofit in App Store Connect.

## Acceptance criteria (epic-level)

- [ ] Site is an installable PWA with an offline shell (Lighthouse PWA check passes); **live site unchanged**.
- [ ] Android + iOS projects build and launch the shell; bundled shell loads **live** content.
- [ ] Push notifications and offline content reads work on a device.
- [ ] `/privacy` published; store privacy/Data-Safety forms answerable.
- [ ] Signed internal builds available on **TestFlight + Play internal testing**.
- [ ] **No production release without explicit approval** (slice J held).
- [ ] Full existing test suite remains green throughout.

## Blocked by

None — slices A, B, G can start immediately. Production publish (J) is gated on human approval.
