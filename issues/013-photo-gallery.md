---
id: 013
title: Photo gallery — home strip + gallery page + lightbox
type: AFK
status: Done
depends_on: 011
---

## Why

A nonprofit run on community trust needs visible proof of community. Photos of real meetups, family gatherings, dads-in-truck moments build that trust faster than any block of copy can. The site has zero way to show photos to visitors today.

## What

1. `docs/js/photos.js` ES module exporting:
   - `pickLatestPhotos(photos, n)` — newest-first by date, take n
   - `renderPhotoTiles(container, photos, options)` — grid of clickable tiles
   - `openLightbox(photo, photos)` — modal viewer with prev/next + close
   - `init()` — wires home strip OR gallery page based on present containers
2. Home: a photo strip showing the 6 newest photos, placed between Sponsors and Footer (visual closer for the page)
3. `docs/photos/index.html` — full gallery with all photos
4. Lightbox: full-screen modal opens on tile click; keyboard nav (esc to close, ←/→ to change); locks body scroll while open

## Acceptance criteria

- 100% pass of `tests/photos.test.js` (target ≥8 tests)
- Home strip shows up to 6 newest photos; section auto-hides when empty
- Gallery page shows all photos in a responsive grid (3-up desktop, 2-up tablet, 1-up mobile)
- Lightbox opens on tile click, traps focus, supports Esc + ←/→ keys, returns focus to triggering tile on close
- Image URLs from the manifest are URL-encoded only where necessary (handle filenames with spaces, e.g., "Screenshot 2026-05-28 192846-1.png")
- A new photo added via Pages CMS appears within ~30s of manifest action completion (no code change)
