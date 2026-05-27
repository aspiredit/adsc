import { isUpcoming, renderFlyer } from "./events.js";

const ARCHIVE_GRID_SELECTOR = "#archive-grid";

export function pickPastEvents(events, now = new Date()) {
  if (!Array.isArray(events)) return [];
  return events
    .filter((e) => !isUpcoming(e, now))
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
}

const archiveDateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export function formatArchiveDate(isoString) {
  return archiveDateFmt.format(new Date(isoString));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildCardHtml(event) {
  return `
    <article class="archive-card" data-event-id="${escapeHtml(event.id)}">
      <div class="archive-card-flyer">${renderFlyer(event)}</div>
      <div class="archive-card-body">
        <span class="archive-past-badge">Past</span>
        <h3 class="archive-card-title">${escapeHtml(event.title)}</h3>
        <div class="archive-card-date">${escapeHtml(formatArchiveDate(event.starts_at))}</div>
        <div class="archive-card-location">${escapeHtml(event.location ?? "")}</div>
      </div>
    </article>
  `;
}

export function renderArchive(events) {
  const grid = document.querySelector(ARCHIVE_GRID_SELECTOR);
  if (!grid) return;
  if (!Array.isArray(events) || events.length === 0) {
    grid.innerHTML = `<p class="archive-empty">No past events yet — we're just getting started.</p>`;
    return;
  }
  grid.innerHTML = events.map(buildCardHtml).join("");
}
