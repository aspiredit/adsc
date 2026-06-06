# Event Management System Setup

## Architecture Overview

- **Admin Interface**: Pages CMS (form-based, no coding required)
- **Data Store**: `docs/_data/events.json` (in your GitHub repo)
- **Access Control**: GitHub repository permissions
- **Visitor Display**: Static website reads from JSON

## How It Works

### Admin Workflow (GitHub Users)
1. Go to: `https://app.pagescms.org`
2. Log in with GitHub account
3. Click "Connect Repository" and select this repo
4. Navigate to **Events** collection
5. Click **Add new event** or **Edit existing**
6. Fill in form fields (auto-saved to `docs/_data/events.json`)
7. Toggle **Draft** checkbox:
   - ✓ Draft = visible only at `/?preview=true` (preview mode)
   - ✗ Published = visible to all visitors
8. Click **Publish** to commit to GitHub

### Visitor Workflow
1. Visit website homepage
2. See **Featured Event** (latest upcoming)
3. See **Upcoming Events** (next 3 events)
4. Can **Add to Calendar** (generates .ics file)
5. Can **Archive** to see past events
6. All read-only, no edit access

## Access Control

### Admin Access
Controlled via GitHub:
1. Go to your repo **Settings** → **Collaborators**
2. Add team members as collaborators with **Write** access
3. They log in via Pages CMS with their GitHub account
4. Only users with write access can edit events

### Visitor Access
- ✅ Can view all published events (draft = false)
- ✅ Can download event as .ics file
- ✅ Cannot edit, delete, or access draft events
- Security enforced by `filterDrafts()` in JavaScript

## Event Fields

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Event ID | String | Yes | Unique identifier (e.g., "meetup-2026-06") |
| Title | String | Yes | Event name |
| Type | Select | Yes | meetup / family_event / fundraiser / other |
| Start Date/Time | DateTime | Yes | Auto-converts to ISO format |
| Location | String | Yes | Physical or "Remote" |
| Description | Text | Yes | Event details |
| Flyer Image | Image | No | Auto-uploaded to `/assets/events/` |
| RSVP Link | URL | No | Eventbrite, Calendly, etc. |
| CTA Label | String | No | Button text (default: "RSVP") |
| Status | Select | No | scheduled / cancelled / completed |
| Draft | Checkbox | No | Hidden from visitors if checked |

## Setup Checklist

- [ ] Commit `pages-cms.config.json` to repo
- [ ] Add team members as GitHub collaborators (Settings → Collaborators)
- [ ] Have admin visit `https://app.pagescms.org` to connect repo
- [ ] Admin creates first event via form
- [ ] Test: visit homepage, see event displayed
- [ ] Test: toggle draft mode (`?preview=true`), verify draft only shows in preview
- [ ] Test: remove draft checkbox, verify event appears to all visitors

## Previewing Draft Events

Admin can preview drafts before publishing:
1. After editing, check **Draft** checkbox
2. Click **Publish** (saves but stays hidden)
3. Visit your site with `?preview=true` query param
4. See draft event on homepage
5. When ready, uncheck **Draft** and publish again

## Troubleshooting

**"Can't connect to repository"**
- GitHub account must have write access to the repo
- Ask repo owner to add you as a collaborator

**"Changes not showing on website"**
- Pages CMS commits to GitHub; GitHub Pages rebuilds (2-5 min)
- Check repo Actions tab to see build status
- Hard refresh browser (`Ctrl+Shift+R`)

**"Old events still showing"**
- Browser cache issue
- Clear cache or use incognito mode

**Adding custom fields**
- Edit `pages-cms.config.json` to add new fields
- Example: add `organizer`, `capacity`, `register_link`, etc.
- Restart Pages CMS and reconnect repository

## Security Model

| User Type | Can View | Can Edit | Can Delete |
|-----------|----------|----------|------------|
| Admin (with GitHub write access) | All | Yes | Yes |
| Visitor | Published only | No | No |
| Non-collaborators | Published only | No | No |

All edits are tracked in GitHub commit history.

## Next Steps

1. Commit this config to your repo
2. Push to GitHub
3. Invite admins to: `https://app.pagescms.org`
4. Have them connect the repository
5. Start adding events!
