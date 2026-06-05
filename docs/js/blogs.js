/**
 * Blog rendering. Fetches the manifest produced by scripts/build_manifests.py,
 * shows the latest N on the home page, the full list on /blog/, and a single
 * post on /blog/post.html?slug=...
 *
 * Architecture note: this is intentionally client-side (per ADR-0002) until
 * the Astro migration (ADR-0004) moves rendering into the build pipeline.
 */

const BLOGS_JSON_PATH_HOME = "_data/blogs.json";
const BLOGS_JSON_PATH_NESTED = "../_data/blogs.json"; // when called from /blog/

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

function detailHref(slug, basePath) {
  // Caller decides the base. From home it's "blog/post.html?slug=...",
  // from the list page it's "post.html?slug=..."
  return `${basePath}post.html?slug=${encodeURIComponent(slug)}`;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

function buildCard(post, basePath) {
  const card = document.createElement("article");
  card.className = "blog-card";

  const cover = post.cover_image
    ? `<a class="blog-card-cover" href="${detailHref(post.slug, basePath)}"><img src="${escapeHTML(post.cover_image)}" alt="" loading="lazy"></a>`
    : "";

  const dateText = formatBlogDate(post.date);
  const author = post.author ? `<span class="blog-card-author"> · ${escapeHTML(post.author)}</span>` : "";

  card.innerHTML = `
    ${cover}
    <div class="blog-card-body">
      <div class="blog-card-meta">${escapeHTML(dateText)}${author}</div>
      <h3 class="blog-card-title"><a href="${detailHref(post.slug, basePath)}">${escapeHTML(post.title)}</a></h3>
      <p class="blog-card-excerpt">${escapeHTML(post.excerpt || "")}</p>
      <a class="blog-card-readmore" href="${detailHref(post.slug, basePath)}">Read the post →</a>
    </div>
  `;
  return card;
}

export function renderBlogCards(container, posts, options = {}) {
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(posts) || posts.length === 0) return;
  const basePath = options.basePath ?? "blog/";
  const frag = document.createDocumentFragment();
  for (const post of posts) frag.appendChild(buildCard(post, basePath));
  container.appendChild(frag);
}

export function renderBlogList(container, posts) {
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(posts) || posts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "blog-empty";
    empty.textContent = "No posts yet. Check back soon.";
    container.appendChild(empty);
    return;
  }
  renderBlogCards(container, posts, { basePath: "" });
}

export function renderBlogDetail(container, post) {
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
  const cover = post.cover_image
    ? `<img class="blog-detail-cover" src="${escapeHTML(post.cover_image)}" alt="">`
    : "";
  const author = post.author ? `<span class="blog-detail-author"> · ${escapeHTML(post.author)}</span>` : "";
  // Note: post.html is already sanitized at build time by scripts/build_manifests.py
  container.innerHTML = `
    <article class="blog-detail">
      ${cover}
      <header class="blog-detail-header">
        <h1>${escapeHTML(post.title)}</h1>
        <div class="blog-detail-meta">${escapeHTML(formatBlogDate(post.date))}${author}</div>
      </header>
      <div class="blog-detail-body">${post.html || ""}</div>
      <footer class="blog-detail-footer">
        <a href="./">← All posts</a>
      </footer>
    </article>
  `;
}

// ---------- orchestrator ----------

async function loadManifest(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter((p) => p && p.draft !== true);
}

export async function init() {
  const home = document.querySelector(HOME_SECTION_SELECTOR);
  const list = document.querySelector(LIST_CONTAINER_SELECTOR);
  const detail = document.querySelector(DETAIL_CONTAINER_SELECTOR);

  if (!home && !list && !detail) return;

  // Decide which manifest path to use based on which container is on the page.
  // (home is on /index.html → "_data/...", list/detail are under /blog/ → "../_data/...")
  const path = home ? BLOGS_JSON_PATH_HOME : BLOGS_JSON_PATH_NESTED;

  let posts = [];
  try {
    posts = await loadManifest(path);
  } catch (err) {
    console.error("Could not load blog manifest:", err);
  }

  if (home) {
    const latest = pickLatest(posts, HOME_LATEST_COUNT);
    if (latest.length === 0) {
      home.style.display = "none"; // hide the whole section on home when empty
    } else {
      const grid = home.querySelector(".blog-latest-grid") || home;
      renderBlogCards(grid, latest, { basePath: "blog/" });
    }
  }

  if (list) {
    renderBlogList(list, posts);
  }

  if (detail) {
    const slug = new URLSearchParams(window.location.search).get("slug");
    const post = getPostBySlug(posts, slug);
    if (post) {
      document.title = `${post.title} — Autism Dads Social Club`;
    }
    renderBlogDetail(detail, post);
  }
}
