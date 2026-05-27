const EVENTS_JSON_PATH = "_data/events.json";
const RSVP_FEATURED_SELECTOR = ".rsvp-featured";
const RSVP_UPCOMING_SECTION_SELECTOR = ".rsvp-upcoming";
const RSVP_UPCOMING_GRID_SELECTOR = ".rsvp-upcoming-grid";
const RSVP_SUBMIT_SELECTOR = "#rsvp-submit";
const UPCOMING_MAX = 3;

const TYPE_LABELS = {
  meetup: "Next Meetup",
  family_event: "Family Event",
  fundraiser: "Fundraiser",
  other: "Upcoming",
};

function upcomingSorted(events, now) {
  if (!Array.isArray(events)) return [];
  return events
    .filter((e) => new Date(e.starts_at).getTime() > now.getTime())
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

function renderCard(card, event) {
  const tag = TYPE_LABELS[event.type] ?? TYPE_LABELS.other;
  card.innerHTML = `
    <div class="rsvp-featured-tag">${escapeHtml(tag)}</div>
    <h3>${escapeHtml(event.title)}</h3>
    <div class="rsvp-featured-when">${escapeHtml(formatStartCT(event.starts_at))}</div>
    <div class="rsvp-featured-where">${escapeHtml(event.location ?? "")}</div>
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
    <div class="upcoming-event">
      <div class="upcoming-event-info">
        <div class="upcoming-event-when">${escapeHtml(formatStartCompactCT(event.starts_at))}</div>
        <div class="upcoming-event-name">${escapeHtml(event.title)}</div>
        <div class="upcoming-event-where">${escapeHtml(event.location ?? "")}</div>
      </div>
      <a href="${escapeHtml(event.rsvp_url || "#rsvp")}">${escapeHtml(buildCtaLabel(event))} →</a>
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

export async function init() {
  try {
    const res = await fetch(EVENTS_JSON_PATH);
    if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
    const events = await res.json();
    const featured = pickFeaturedEvent(events);
    renderFeatured(featured);
    renderUpcoming(pickUpcomingEvents(events, new Date(), featured?.id ?? null));
  } catch (err) {
    console.error("Could not load events:", err);
    renderFeatured(null);
    renderUpcoming([]);
  }
}
