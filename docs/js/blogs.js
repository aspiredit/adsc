/**
 * Blog rendering. Fetches the manifest produced by scripts/build_manifests.py,
 * shows the latest N on the home page, the full list on /blog/, and a single
 * post on /blog/post.html?slug=...
 *
 * Architecture note: this is intentionally client-side (per ADR-0002) until
 * the Astro migration (ADR-0004) moves rendering into the build pipeline.
 *
 * Preview: the public manifest (blogs.json) has no drafts. With ?preview=true
 * on the /blog/ list or post page we load blogs-all.json instead, which the
 * build step also emits with drafts included, so authors can review a post
 * rendered in the real theme before publishing. Reuses the shared preview
 * helpers from events.js for a single site-wide convention.
 */

import { isPreviewMode, showPreviewBanner } from "./events.js";

const BLOGS_JSON_PATH_HOME = "_data/blogs.json";
const BLOGS_JSON_PATH_NESTED = "../_data/blogs.json";      // public, from /blog/
const BLOGS_ALL_PATH_NESTED = "../_data/blogs-all.json";   // preview (incl. drafts), from /blog/

const HOME_LATEST_COUNT = 3;

const HOME_SECTION_SELECTOR = "#blog-latest";
const LIST_CONTAINER_SELECTOR = "#blog-list";
const DETAIL_CONTAINER_SELECTOR = "#blog-detail";

// ---------- pure logic ----------

export function pickLatest(posts, n) {
  if (!Array.isArray(posts) || posts.length === 0) return [];
  const sorted = posts.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return sorted.slice(0, n);
}

export function formatBlogDate(value) {
  if (!value) return "";
  const d = new Date(`${value}T12:00:00Z`); // anchor at noon UTC so timezone never shifts the day
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

export function getPostBySlug(posts, slug) {
  if (!Array.isArray(posts) || !slug) return null;
  return posts.find((p) => p.slug === slug) || null;
}

// ---------- rendering ----------

function detailHref(slug, basePath, preview) {
  // Caller decides the base. From home it's "blog/post.html?slug=...",
  // from the list page it's "post.html?slug=..."
  // In preview mode, carry the flag through so draft links stay previewable.
  const q = preview ? "&preview=true" : "";
  return `${basePath}post.html?slug=${encodeURIComponent(slug)}${q}`;
}

// Small amber "DRAFT" pill shown on cards/detail in preview mode so the author
// always knows what's public vs. what's still hidden. Inline-styled so it needs
// no CSS in the host pages.
const DRAFT_BADGE = `<span style="display:inline-block;background:#B8843D;color:#fff;font-size:0.62rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:2px 8px;border-radius:999px;margin-right:8px;vertical-align:middle;">Draft · not public</span>`;

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

// Manifest stores asset paths relative to the docs/ root ("assets/images/x.png").
// Each page prepends the prefix that reaches that root: "" from home,
// "../" from /blog/. External URLs and absolute paths are returned untouched.
function resolveAsset(pathValue, assetBase) {
  if (!pathValue) return "";
  if (/^https?:\/\//.test(pathValue) || pathValue.startsWith("/")) return pathValue;
  return `${assetBase || ""}${pathValue}`;
}

function buildCard(post, basePath, assetBase, preview) {
  const card = document.createElement("article");
  card.className = "blog-card";

  const href = detailHref(post.slug, basePath, preview);
  const coverSrc = resolveAsset(post.cover_image, assetBase);
  const cover = coverSrc
    ? `<a class="blog-card-cover" href="${href}"><img src="${escapeHTML(coverSrc)}" alt="" loading="lazy"></a>`
    : "";

  const dateText = formatBlogDate(post.date);
  const author = post.author ? `<span class="blog-card-author"> · ${escapeHTML(post.author)}</span>` : "";
  const badge = preview && post.draft ? DRAFT_BADGE : "";

  card.innerHTML = `
    ${cover}
    <div class="blog-card-body">
      <div class="blog-card-meta">${badge}${escapeHTML(dateText)}${author}</div>
      <h3 class="blog-card-title"><a href="${href}">${escapeHTML(post.title)}</a></h3>
      <p class="blog-card-excerpt">${escapeHTML(post.excerpt || "")}</p>
      <a class="blog-card-readmore" href="${href}">Read the post →</a>
    </div>
  `;
  return card;
}

export function renderBlogCards(container, posts, options = {}) {
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(posts) || posts.length === 0) return;
  const basePath = options.basePath ?? "blog/";
  const assetBase = options.assetBase ?? "";
  const preview = options.preview ?? false;
  const frag = document.createDocumentFragment();
  for (const post of posts) frag.appendChild(buildCard(post, basePath, assetBase, preview));
  container.appendChild(frag);
}

export function renderBlogList(container, posts, assetBase = "", preview = false) {
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(posts) || posts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "blog-empty";
    empty.textContent = "No posts yet. Check back soon.";
    container.appendChild(empty);
    return;
  }
  renderBlogCards(container, posts, { basePath: "", assetBase, preview });
}

export function renderBlogDetail(container, post, assetBase = "", preview = false) {
  if (!container) return;
  container.innerHTML = "";
  if (!post) {
    container.innerHTML = `
      <div class="blog-detail-empty">
        <h2>Post not found</h2>
        <p>The post you're looking for doesn't exist or was removed.</p>
        <p><a href="./">← All posts</a></p>
      </div>`;
    return;
  }
  // A draft badge by the meta line reinforces the site-wide preview banner.
  const badge = preview && post.draft ? DRAFT_BADGE : "";
  const coverSrc = resolveAsset(post.cover_image, assetBase);
  const cover = coverSrc
    ? `<img class="blog-detail-cover" src="${escapeHTML(coverSrc)}" alt="">`
    : "";
  const author = post.author ? `<span class="blog-detail-author"> · ${escapeHTML(post.author)}</span>` : "";
  // Note: post.html is already sanitized at build time by scripts/build_manifests.py
  container.innerHTML = `
    <article class="blog-detail">
      ${cover}
      <header class="blog-detail-header">
        <h1>${escapeHTML(post.title)}</h1>
        <div class="blog-detail-meta">${badge}${escapeHTML(formatBlogDate(post.date))}${author}</div>
      </header>
      <div class="blog-detail-body">${post.html || ""}</div>
      <footer class="blog-detail-footer">
        <a href="./">← All posts</a>
      </footer>
    </article>
  `;
}

// ---------- orchestrator ----------

async function loadManifest(path, includeDrafts = false) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  // Public views drop drafts. Preview mode (includeDrafts) keeps them so the
  // author can see unpublished posts rendered with the real site theme.
  return includeDrafts ? data.filter(Boolean) : data.filter((p) => p && p.draft !== true);
}

export async function init() {
  const home = document.querySelector(HOME_SECTION_SELECTOR);
  const list = document.querySelector(LIST_CONTAINER_SELECTOR);
  const detail = document.querySelector(DETAIL_CONTAINER_SELECTOR);

  if (!home && !list && !detail) return;

  // Preview mode: ?preview=true on the /blog/ list or post page loads the
  // drafts-included manifest so the author can review unpublished posts with
  // the real theme. Never on home (keeps the public landing page clean).
  const preview = !home && isPreviewMode(window.location.search);
  if (preview) showPreviewBanner();

  // assetBase mirrors page depth: "" reaches the docs root from home, "../" from /blog/.
  const assetBase = home ? "" : "../";
  const path = home
    ? BLOGS_JSON_PATH_HOME
    : preview
      ? BLOGS_ALL_PATH_NESTED
      : BLOGS_JSON_PATH_NESTED;

  let posts = [];
  try {
    posts = await loadManifest(path, preview);
  } catch (err) {
    console.error("Could not load blog manifest:", err);
  }

  if (home) {
    const latest = pickLatest(posts, HOME_LATEST_COUNT);
    if (latest.length === 0) {
      home.style.display = "none"; // hide the whole section on home when empty
    } else {
      const grid = home.querySelector(".blog-latest-grid") || home;
      renderBlogCards(grid, latest, { basePath: "blog/", assetBase });
    }
  }

  if (list) {
    renderBlogList(list, posts, assetBase, preview);
  }

  if (detail) {
    const slug = new URLSearchParams(window.location.search).get("slug");
    const post = getPostBySlug(posts, slug);
    if (post) {
      document.title = `${post.title} — Autism Dads Social Club`;
    }
    renderBlogDetail(detail, post, assetBase, preview);
  }
}
