const EVENTS_JSON_PATH = "_data/events.json";
const RSVP_FEATURED_SELECTOR = ".rsvp-featured";
const RSVP_UPCOMING_SECTION_SELECTOR = ".rsvp-upcoming";
const RSVP_UPCOMING_GRID_SELECTOR = ".rsvp-upcoming-grid";
const RSVP_SUBMIT_SELECTOR = "#rsvp-submit";
const UPCOMING_MAX = 3;
const GRACE_MS = 12 * 60 * 60 * 1000;

const TYPE_LABELS = {
  meetup: "Next Meetup",
  family_event: "Family Event",
  fundraiser: "Fundraiser",
  other: "Upcoming",
};

const TYPE_PILL_LABELS = {
  meetup: "Meetup",
  family_event: "Family Event",
  fundraiser: "Fundraiser",
  other: "Event",
};

export function isPreviewMode(searchString = "") {
  const params = new URLSearchParams(searchString);
  return params.get("preview") === "true";
}

// Pages CMS writes events.json as { "events": [...] } (a single file with a
// top-level list field). Older/hand-written data may be a bare array. Accept both.
export function extractEvents(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.events)) return data.events;
  return [];
}

// An event with an unparseable starts_at must never reach the renderer:
// Intl.DateTimeFormat.format() throws on Invalid Date and would crash the
// calendar. Filter such events out at load time (with a console warning) so a
// single bad CMS entry can't white-screen the whole page.
export function hasValidDate(event) {
  return !!event?.starts_at && !Number.isNaN(new Date(event.starts_at).getTime());
}

export function filterDrafts(events, previewMode = false) {
  if (!Array.isArray(events)) return [];
  if (previewMode) return events.slice();
  return events.filter((e) => e.draft !== true);
}

const PREVIEW_BANNER_ATTR = "data-preview-banner";

export function showPreviewBanner() {
  if (document.querySelector(`[${PREVIEW_BANNER_ATTR}]`)) return;
  const banner = document.createElement("div");
  banner.setAttribute(PREVIEW_BANNER_ATTR, "");
  banner.textContent = "PREVIEW MODE — drafts visible. Remove ?preview=true from the URL to see the live site.";
  banner.style.cssText =
    "background:#B8843D;color:#fff;padding:10px 16px;text-align:center;font-family:'Source Sans 3',system-ui,sans-serif;font-weight:600;font-size:0.9rem;letter-spacing:0.02em;position:sticky;top:0;z-index:9999;";
  document.body.prepend(banner);
}

export function isUpcoming(event, now = new Date()) {
  if (!event?.starts_at) return false;
  const startMs = new Date(event.starts_at).getTime();
  return startMs + GRACE_MS > now.getTime();
}

function upcomingSorted(events, now) {
  if (!Array.isArray(events)) return [];
  return events
    .filter((e) => isUpcoming(e, now))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

export function pickFeaturedEvent(events, now = new Date()) {
  return upcomingSorted(events, now)[0] ?? null;
}

export function pickUpcomingEvents(events, now = new Date(), excludeId = null) {
  return upcomingSorted(events, now)
    .filter((e) => e.id !== excludeId)
    .slice(0, UPCOMING_MAX);
}

export function formatStartCT(isoString) {
  const date = new Date(isoString);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${formatter.format(date)} (CT)`;
}

export function formatStartCompactCT(isoString) {
  const date = new Date(isoString);
  const dayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
  });
  const monthDayFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${dayFmt.format(date)} · ${monthDayFmt.format(date)} · ${timeFmt.format(date)}`;
}

export function buildCtaLabel(event) {
  return event?.cta_label || "RSVP";
}

function renderFallback(card) {
  card.innerHTML = `
    <div class="rsvp-featured-tag">Heads up</div>
    <p class="rsvp-featured-fallback">
      New events coming soon — join the mailing list to be the first to know.
    </p>
  `;
}

export function renderFlyer(event) {
  if (event?.flyer) {
    return `<img class="rsvp-featured-flyer-img" src="${escapeHtml(event.flyer)}" alt="${escapeHtml(event.title ?? "")}" loading="lazy">`;
  }
  const pill = TYPE_PILL_LABELS[event?.type] ?? TYPE_PILL_LABELS.other;
  return `
    <div class="flyer-fallback">
      <span class="flyer-type-pill">${escapeHtml(pill)}</span>
      <span class="flyer-fallback-title">${escapeHtml(event?.title ?? "")}</span>
    </div>
  `;
}

function renderCard(card, event) {
  const tag = TYPE_LABELS[event.type] ?? TYPE_LABELS.other;
  card.setAttribute("data-event-id", event.id);
  card.innerHTML = `
    <div class="rsvp-featured-flyer">${renderFlyer(event)}</div>
    <div class="rsvp-featured-tag">${escapeHtml(tag)}</div>
    <h3>${escapeHtml(event.title)}</h3>
    <div class="rsvp-featured-when">${escapeHtml(formatStartCT(event.starts_at))}</div>
    <div class="rsvp-featured-where">${escapeHtml(event.location ?? "")}</div>
    <button type="button" class="event-cal-add" data-ics-event>Add to my calendar</button>
  `;
}

function updateSubmitButton(event) {
  const submit = document.querySelector(RSVP_SUBMIT_SELECTOR);
  if (submit) submit.textContent = buildCtaLabel(event);
}

export function renderFeatured(event) {
  const card = document.querySelector(RSVP_FEATURED_SELECTOR);
  if (!card) return;
  if (event === null) {
    renderFallback(card);
    return;
  }
  renderCard(card, event);
  updateSubmitButton(event);
}

function buildUpcomingCardHtml(event) {
  return `
    <div class="upcoming-event" data-event-id="${escapeHtml(event.id)}">
      <div class="upcoming-event-info">
        <div class="upcoming-event-when">${escapeHtml(formatStartCompactCT(event.starts_at))}</div>
        <div class="upcoming-event-name">${escapeHtml(event.title)}</div>
        <div class="upcoming-event-where">${escapeHtml(event.location ?? "")}</div>
      </div>
      <div class="upcoming-event-actions">
        <a href="${escapeHtml(event.rsvp_url || "#rsvp")}">${escapeHtml(buildCtaLabel(event))} →</a>
        <button type="button" class="event-cal-add event-cal-add--compact" data-ics-event>+ calendar</button>
      </div>
    </div>
  `;
}

export function renderUpcoming(events) {
  const section = document.querySelector(RSVP_UPCOMING_SECTION_SELECTOR);
  const grid = document.querySelector(RSVP_UPCOMING_GRID_SELECTOR);
  if (!section || !grid) return;
  if (!Array.isArray(events) || events.length === 0) {
    section.hidden = true;
    grid.innerHTML = "";
    return;
  }
  section.hidden = false;
  grid.innerHTML = events.map(buildUpcomingCardHtml).join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

import { renderCalendar } from "./calendar.js";
import { downloadEventICS } from "./ics.js";

function attachIcsHandlers(events) {
  const byId = new Map(events.map((e) => [e.id, e]));
  document.querySelectorAll("[data-ics-event]").forEach((btn) => {
    const card = btn.closest("[data-event-id]");
    const id = card?.getAttribute("data-event-id");
    const event = byId.get(id);
    if (!event) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      downloadEventICS(event);
    });
  });
}

export async function init() {
  const previewMode = isPreviewMode(
    typeof window !== "undefined" ? window.location.search : ""
  );
  if (previewMode) showPreviewBanner();
  try {
    const res = await fetch(EVENTS_JSON_PATH);
    if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
    const all = extractEvents(await res.json());
    const dated = all.filter(hasValidDate);
    if (dated.length !== all.length) {
      console.warn(
        `Skipped ${all.length - dated.length} event(s) with an invalid start date.`
      );
    }
    const events = filterDrafts(dated, previewMode);
    const featured = pickFeaturedEvent(events);
    const upcoming = pickUpcomingEvents(events, new Date(), featured?.id ?? null);
    renderFeatured(featured);
    renderUpcoming(upcoming);
    renderCalendar(events);
    attachIcsHandlers([featured, ...upcoming].filter(Boolean));
  } catch (err) {
    console.error("Could not load events:", err);
    renderFeatured(null);
    renderUpcoming([]);
    renderCalendar([]);
  }
}
