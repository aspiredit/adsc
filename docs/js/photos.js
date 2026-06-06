/**
 * Photo gallery rendering. Fetches the photos manifest, renders a tile grid
 * on home and gallery pages, and opens a lightbox on tile click. Pure-vanilla
 * JS — no lightbox library — because the surface is small and a dependency
 * would be more code than the implementation.
 *
 * See: issues/013-photo-gallery.md
 */

const PHOTOS_JSON_PATH_HOME = "_data/photos.json";
const PHOTOS_JSON_PATH_NESTED = "../_data/photos.json"; // for /photos/ pages

const HOME_LATEST_COUNT = 6;

const HOME_SECTION_SELECTOR = "#photo-strip";
const HOME_GRID_SELECTOR = "#photo-strip-grid";
const GALLERY_GRID_SELECTOR = "#photo-gallery-grid";

// ---------- pure logic ----------

export function pickLatestPhotos(photos, n) {
  if (!Array.isArray(photos) || photos.length === 0) return [];
  const sorted = photos.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return sorted.slice(0, n);
}

// Manifest stores image paths relative to the docs/ root ("assets/images/x.png").
// Each page prepends the prefix that reaches that root: "" from home,
// "../" from /photos/. External URLs and absolute paths are returned untouched.
export function resolveAsset(pathValue, assetBase) {
  if (!pathValue) return "";
  if (/^https?:\/\//.test(pathValue) || pathValue.startsWith("/")) return pathValue;
  return `${assetBase || ""}${pathValue}`;
}

export function encodePhotoUrl(url) {
  if (!url) return "";
  // Preserve path slashes; encode only the per-segment unsafe chars (e.g. spaces).
  // Don't double-encode if already encoded.
  try {
    const parts = String(url).split("/");
    return parts
      .map((seg) => (seg === "" ? "" : encodeURIComponent(decodeURIComponent(seg))))
      .join("/");
  } catch {
    return String(url).replace(/ /g, "%20");
  }
}

function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
  );
}

// ---------- tile rendering ----------

function buildTile(photo, index, allPhotos) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "photo-tile";
  btn.setAttribute("aria-label", photo.title ? `View photo: ${photo.title}` : "View photo");
  btn.innerHTML = `<img src="${escapeHTML(encodePhotoUrl(photo.image))}" alt="${escapeHTML(photo.title || "")}" loading="lazy">`;
  btn.addEventListener("click", () => openLightbox(photo, allPhotos, btn));
  return btn;
}

export function renderPhotoTiles(container, photos) {
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(photos) || photos.length === 0) return;
  const frag = document.createDocumentFragment();
  photos.forEach((photo, i) => frag.appendChild(buildTile(photo, i, photos)));
  container.appendChild(frag);
}

// ---------- lightbox ----------

let activeLightboxState = null; // { photos, index, returnFocusTo, keyHandler }

function buildLightbox(photo) {
  const lb = document.createElement("div");
  lb.className = "photo-lightbox";
  lb.setAttribute("role", "dialog");
  lb.setAttribute("aria-modal", "true");
  lb.setAttribute("aria-label", "Photo viewer");
  lb.innerHTML = `
    <button type="button" class="photo-lightbox-close" aria-label="Close (Esc)">&times;</button>
    <button type="button" class="photo-lightbox-prev" aria-label="Previous (←)">&larr;</button>
    <button type="button" class="photo-lightbox-next" aria-label="Next (→)">&rarr;</button>
    <figure class="photo-lightbox-figure">
      <img src="${escapeHTML(encodePhotoUrl(photo.image))}" alt="${escapeHTML(photo.title || "")}">
      <figcaption>
        ${photo.title ? `<div class="photo-lightbox-title">${escapeHTML(photo.title)}</div>` : ""}
        ${photo.caption ? `<div class="photo-lightbox-caption">${escapeHTML(photo.caption)}</div>` : ""}
      </figcaption>
    </figure>
  `;
  return lb;
}

function updateLightboxContent(lb, photo) {
  const img = lb.querySelector(".photo-lightbox-figure img");
  img.setAttribute("src", encodePhotoUrl(photo.image));
  img.setAttribute("alt", photo.title || "");
  const cap = lb.querySelector("figcaption");
  cap.innerHTML = `
    ${photo.title ? `<div class="photo-lightbox-title">${escapeHTML(photo.title)}</div>` : ""}
    ${photo.caption ? `<div class="photo-lightbox-caption">${escapeHTML(photo.caption)}</div>` : ""}
  `;
}

function showAt(index) {
  if (!activeLightboxState) return;
  const { photos } = activeLightboxState;
  const next = ((index % photos.length) + photos.length) % photos.length;
  activeLightboxState.index = next;
  const lb = document.querySelector(".photo-lightbox");
  if (lb) updateLightboxContent(lb, photos[next]);
}

export function openLightbox(photo, photos, returnFocusTo = null) {
  closeLightbox(); // ensure no stacking
  const list = Array.isArray(photos) && photos.length > 0 ? photos : [photo];
  const index = Math.max(0, list.findIndex((p) => p.slug === photo.slug));

  const lb = buildLightbox(photo);
  document.body.appendChild(lb);
  document.body.classList.add("lightbox-open");

  const keyHandler = (e) => {
    if (e.key === "Escape") { e.preventDefault(); closeLightbox(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); showAt(activeLightboxState.index - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); showAt(activeLightboxState.index + 1); }
  };
  document.addEventListener("keydown", keyHandler);

  lb.querySelector(".photo-lightbox-close").addEventListener("click", closeLightbox);
  lb.querySelector(".photo-lightbox-prev").addEventListener("click", () => showAt(activeLightboxState.index - 1));
  lb.querySelector(".photo-lightbox-next").addEventListener("click", () => showAt(activeLightboxState.index + 1));
  // Click-outside-the-image closes
  lb.addEventListener("click", (e) => {
    if (e.target === lb) closeLightbox();
  });

  activeLightboxState = { photos: list, index, returnFocusTo, keyHandler };
  // Focus the close button for keyboard users
  const closeBtn = lb.querySelector(".photo-lightbox-close");
  if (closeBtn && typeof closeBtn.focus === "function") closeBtn.focus();
}

export function closeLightbox() {
  const existing = document.querySelector(".photo-lightbox");
  if (existing) existing.remove();
  document.body.classList.remove("lightbox-open");
  if (activeLightboxState?.keyHandler) {
    document.removeEventListener("keydown", activeLightboxState.keyHandler);
  }
  const returnFocusTo = activeLightboxState?.returnFocusTo;
  activeLightboxState = null;
  if (returnFocusTo && typeof returnFocusTo.focus === "function") returnFocusTo.focus();
}

// ---------- orchestrator ----------

async function loadManifest(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function init() {
  const homeSection = document.querySelector(HOME_SECTION_SELECTOR);
  const homeGrid = document.querySelector(HOME_GRID_SELECTOR);
  const galleryGrid = document.querySelector(GALLERY_GRID_SELECTOR);

  if (!homeSection && !galleryGrid) return;

  const path = homeSection ? PHOTOS_JSON_PATH_HOME : PHOTOS_JSON_PATH_NESTED;
  // assetBase mirrors the manifest path: "" reaches the docs root from home,
  // "../" from /photos/. Resolve image paths once so tiles and lightbox agree.
  const assetBase = homeSection ? "" : "../";

  let photos = [];
  try {
    photos = await loadManifest(path);
    photos = photos.map((p) => ({ ...p, image: resolveAsset(p.image, assetBase) }));
  } catch (err) {
    console.error("Could not load photo manifest:", err);
  }

  if (homeSection) {
    const latest = pickLatestPhotos(photos, HOME_LATEST_COUNT);
    if (latest.length === 0) {
      homeSection.style.display = "none";
    } else if (homeGrid) {
      renderPhotoTiles(homeGrid, latest);
    }
  }

  if (galleryGrid) {
    if (photos.length === 0) {
      galleryGrid.innerHTML = '<p class="photo-empty">No photos yet. Check back soon.</p>';
    } else {
      renderPhotoTiles(galleryGrid, photos);
    }
  }
}
