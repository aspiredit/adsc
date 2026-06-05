---
id: 012
title: Blog rendering — home section + list page + detail page
type: AFK
status: Done
depends_on: 011
---

## Why

The site has its first published post but nowhere to read it. Visitors need a "Latest from the blog" surface on the home page (driver of repeat visits + SEO signal) and a way to read each post in full.

## What

1. `docs/js/blogs.js` ES module exporting:
   - `pickLatest(posts, n)` — newest-first sort + take first N
   - `formatBlogDate(dateStr)` — ISO to "May 28, 2026"
   - `renderBlogCards(container, posts)` — render summary cards (title, date, author, excerpt, cover image, "Read more")
   - `getPostBySlug(posts, slug)` — single lookup
   - `renderBlogDetail(container, post)` — render the full post with cover, title, byline, date, sanitized HTML body
   - `init()` — orchestrates based on which container element is present on the page (home vs list vs detail)
2. Home page: a "Stories from the brotherhood" section showing the 3 newest posts; placed between Programs and Calendar
3. `docs/blog/index.html` — full list of all posts
4. `docs/blog/post.html` — detail page reading `?slug=...` from query string

## Acceptance criteria

- 100% pass of `tests/blogs.test.js` (target ≥10 tests covering sort, format, render, lookup)
- Home shows up to 3 newest non-draft posts; if 0 posts, the section is hidden entirely (no empty state on home)
- Clicking a card on home → list page card → detail page works; back button returns to the previous list
- Detail page renders sanitized HTML safely (no `<script>` execution from CMS content)
- Visual style matches existing site: Carolina blue palette, Fraunces headings, card hover lift consistent with program cards
- A future second blog post added via Pages CMS appears on the home + list pages within ~30s of the manifest action completing (no code change needed)
