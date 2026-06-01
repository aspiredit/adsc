/**
 * blogs.js — Autism Dads Social Club
 *
 * Reads docs/_data/blogs-manifest.json (built by GitHub Actions from
 * content/blogs/*.md) and renders the 3 most recent posts into #blog-grid.
 *
 * Site root: https://aspiredit.github.io/adsc/docs/
 * Manifest:  https://aspiredit.github.io/adsc/docs/_data/blogs-manifest.json
 *
 * PLACE THIS FILE AT: docs/js/blogs.js
 */

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun",
                      "Jul","Aug","Sep","Oct","Nov","Dec"];

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return isNaN(d) ? dateStr
    : `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/* ─── render ──────────────────────────────────────────────────────────────── */

function renderCards(posts) {
  const grid   = document.getElementById("blog-grid");
  const footer = document.getElementById("blog-footer");
  if (!grid) return;

  if (posts.length === 0) {
    grid.innerHTML = `<div class="blog-empty">No posts yet — check back soon.</div>`;
    return;
  }

  grid.innerHTML = posts.map(post => {
    const initials = (post.author_initials || post.author || "AD")
      .slice(0, 2).toUpperCase();

    const coverHtml = post.cover_image
      ? `<img class="blog-card-cover"
              src="${escHtml(post.cover_image)}"
              alt="${escHtml(post.title)}"
              loading="lazy">`
      : `<div class="blog-card-cover-placeholder">
           <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke="#fff" stroke-width="1.5" stroke-linecap="round"
                stroke-linejoin="round">
             <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
             <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
           </svg>
         </div>`;

    const excerpt = escHtml(
      post.excerpt || post.body_preview || ""
    );

    return `
      <a class="blog-card" href="#">
        ${coverHtml}
        <div class="blog-card-body">
          <div class="blog-card-meta">
            <div class="blog-author-init">${escHtml(initials)}</div>
            <span>${escHtml(post.author || "ADSC")}</span>
            ${post.date ? `<span>·</span><span>${fmtDate(post.date)}</span>` : ""}
          </div>
          <div class="blog-card-title">${escHtml(post.title || "Untitled")}</div>
          <div class="blog-card-excerpt">${excerpt}</div>
          <span class="blog-card-read">Read more</span>
        </div>
      </a>`;
  }).join("");

  if (footer) footer.style.display = "block";
}

/* ─── main ────────────────────────────────────────────────────────────────── */

export async function init() {
  // Path is relative to the site root (docs/)
  // GitHub Pages serves docs/ as the root for aspiredit.github.io/adsc/docs/
  const MANIFEST_URL = "_data/blogs-manifest.json";

  let posts;
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    posts = await res.json();
    if (!Array.isArray(posts)) throw new Error("Manifest is not an array");
  } catch (err) {
    console.warn("[blogs.js] Could not load blogs manifest:", err);
    const grid = document.getElementById("blog-grid");
    if (grid) grid.innerHTML = `<div class="blog-empty">No posts yet — check back soon.</div>`;
    return;
  }

  // Filter drafts, take 3 newest (already sorted by build script)
  const visible = posts
    .filter(p => p.draft !== true)
    .slice(0, 3);

  renderCards(visible);
}