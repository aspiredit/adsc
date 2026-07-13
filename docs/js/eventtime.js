/**
 * Shared event date/time helpers.
 *
 * Events now store date and time as SEPARATE fields (so the CMS never again
 * receives a time range in a single datetime box — the bug that hid the
 * Fatherhood Huddle from the calendar):
 *
 *   date:       "YYYY-MM-DD"   America/Chicago wall date
 *   start_time: "HH:mm"        24-hour, Central
 *   end_time:   "HH:mm"        24-hour, Central (optional)
 *
 * The rest of the site still speaks ISO 8601 (starts_at / ends_at). Rather than
 * touch every consumer, we NORMALIZE at load time: derive starts_at/ends_at from
 * the separate fields once, then calendar/ics/sort logic keeps working unchanged.
 * Legacy records that only carry starts_at/ends_at are passed through as-is.
 */

const TZ = "America/Chicago";

// Minutes that America/Chicago is offset from UTC for a given naive wall-clock
// time ("YYYY-MM-DDTHH:mm"). Negative (e.g. -300 = CDT summer, -360 = CST
// winter). Independent of the runtime's own timezone.
export function chicagoOffsetMinutes(naiveLocal) {
  const [datePart, timePart = "00:00"] = String(naiveLocal).split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const guess = new Date(Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0));
  const tzWall = new Date(guess.toLocaleString("en-US", { timeZone: TZ }));
  const utcWall = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return Math.round((tzWall - utcWall) / 60000);
}

export function formatOffset(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${sign}${hh}:${mm}`;
}

// ("2026-07-16", "18:30") -> "2026-07-16T18:30:00-05:00"
export function toChicagoIso(date, time) {
  if (!date || !time) return "";
  const naive = `${date}T${time}`;
  return `${naive}:00${formatOffset(chicagoOffsetMinutes(naive))}`;
}

// ISO start string for an event, whatever shape it's stored in ("" if none).
export function eventStartIso(event) {
  if (event?.date && event?.start_time) return toChicagoIso(event.date, event.start_time);
  if (event?.starts_at) return event.starts_at;
  return "";
}

export function eventEndIso(event) {
  if (event?.date && event?.end_time) return toChicagoIso(event.date, event.end_time);
  if (event?.ends_at) return event.ends_at;
  return "";
}

// Return a copy with starts_at/ends_at filled in from the separate fields, so
// downstream ISO-based logic (calendar, ics, sorting) works uniformly.
export function normalizeEvent(event) {
  const out = { ...event };
  const startsAt = eventStartIso(event);
  const endsAt = eventEndIso(event);
  if (startsAt) out.starts_at = startsAt;
  if (endsAt) out.ends_at = endsAt;
  return out;
}

export function normalizeEvents(events) {
  return Array.isArray(events) ? events.map(normalizeEvent) : [];
}

// "5:00 PM" style label for an "HH:mm" (or falls back to reading a Date/ISO).
export function formatTimeCT(isoOrDate) {
  if (!isoOrDate) return "";
  const date = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

// "6:30 – 7:30 PM" (or just "6:30 PM" when there's no end).
export function formatTimeRangeCT(event) {
  const start = event?.starts_at ? formatTimeCT(event.starts_at) : "";
  const end = event?.ends_at ? formatTimeCT(event.ends_at) : "";
  if (start && end) return `${start} – ${end}`;
  return start;
}
