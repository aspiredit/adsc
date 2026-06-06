---
id: 011
title: Auto-generate blogs.json + photos.json manifests on push
type: AFK
status: Done
depends_on: 002
---

## Why

Pages CMS writes one `.md` file per blog post and per photo. The browser can't list a directory, so without a manifest the client has no way to discover what content exists. Today the only file the renderer can fetch is `events.json` (single file with a list field — CMS-managed). Blogs and photos use the *collection* shape (one file per record), which means we need a build step to assemble the index.

## What

1. A Python script at `scripts/build_manifests.py` that:
   - Walks `docs/_data/blogs/*.md` → parses frontmatter (YAML) + markdown body → renders body to sanitized HTML → writes `docs/_data/blogs.json` as a list sorted newest-first
   - Walks `docs/_data/photos/*.md` → parses frontmatter → writes `docs/_data/photos.json` as a list sorted newest-first (by filename date prefix)
   - Skips files where frontmatter `draft: true` (preview mode handles draft visibility separately, like events)
2. A GitHub Action `.github/workflows/build-manifests.yml` that:
   - Triggers on push to `main` when `docs/_data/blogs/**` or `docs/_data/photos/**` changes
   - Runs the script, commits the regenerated manifests back to `main` if they changed
   - Skips itself (no infinite loop) when the actor is `github-actions[bot]`

## Acceptance criteria

- Running `python scripts/build_manifests.py` locally produces non-empty `docs/_data/blogs.json` and `docs/_data/photos.json`
- Blog manifest entries include: `slug`, `title`, `date`, `author`, `cover_image`, `excerpt`, `html`, `draft`
- Photo manifest entries include: `slug`, `title`, `image`, `caption`, `date`
- Markdown rendering preserves headings, lists, tables, paragraphs; sanitization strips `<script>` and `on*` attributes
- A second push that adds a new blog post via Pages CMS triggers the action and updates `blogs.json` automatically — no manual step needed for admins

## Notes

- HTML sanitization: use `bleach` Python library — small, well-tested, conservative defaults
- The manifest pattern is temporary; Astro migration (ADR-0004) will move this work into the build pipeline natively. Keep the script simple and the action focused.
