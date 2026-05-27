# ADR-0001: Use Pages CMS for event management

**Date**: 2026-05-27
**Status**: Accepted

## Context

The site needs admin-managed events (add/edit/delete) with MFA-protected access for 2-3 non-technical editors. The site is static HTML on GitHub Pages. Options considered:

1. **Decap CMS** (formerly Netlify CMS) — open source, GitHub-backed, but requires hosting a separate OAuth proxy because GitHub's OAuth endpoint doesn't support browser-direct calls (no CORS).
2. **Pages CMS** — purpose-built for GitHub-hosted sites; hosts its own OAuth bridge at `app.pagescms.org`.
3. **AWS Amplify + Cognito + DynamoDB + S3** — full backend with first-party MFA.
4. **Vercel/Netlify + serverless functions + database** — JAMstack with backend.

## Decision

Use Pages CMS.

## Consequences

**Positive:**
- Zero backend infrastructure to maintain. No OAuth proxy, no Lambda, no IAM policies.
- MFA inherited from GitHub itself; Admins log in with their GitHub accounts.
- Free at this scale.
- Admin UI is purpose-built for GitHub Pages sites; non-technical editors get a clean form-based interface.

**Negative:**
- Login flow routes through `app.pagescms.org` (a third-party service). The repo and data stay in our control; only auth brokering is external. Worth re-evaluating if Pages CMS goes paid-only or shuts down.
- Smaller community than Decap; fewer Stack Overflow answers when something breaks.
- Tied to GitHub as the identity provider; Admins must have GitHub accounts.

## Alternatives rejected

- **Decap CMS**: equivalent functionality but requires owning and maintaining an OAuth proxy (typically on Cloudflare Workers). Long-term maintenance burden for the same outcome.
- **AWS Amplify / Cognito**: drastically over-scoped for 2-3 admins editing one site. Cognito alone requires configuring hosted UI, MFA, password reset, user pool client settings. Not justifiable for nonprofit operating budget or volunteer maintenance capacity.
- **JAMstack with database**: only justified if we anticipate features beyond event CRUD (member portals, RSVP analytics, real-time updates). Not currently on roadmap.
