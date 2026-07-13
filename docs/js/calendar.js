import { downloadEventICS } from "./ics.js";
import { formatTimeRangeCT, formatTimeCT } from "./eventtime.js";

const TZ = "America/Chicago";
const CALENDAR_SELECTOR = "#calendar";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const TYPE_LABELS = {
  meetup: "Meetup",
  family_event: "Family Event",
  fundraiser: "Fundraiser",
  other: "Event",
};

function isSameDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function monthGrid(year, monthIndex, today = new Date()) {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const startDayOfWeek = firstOfMonth.getDay();
  const gridStart = new Date(year, monthIndex, 1 - startDayOfWeek);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    cells.push({
      date,
      dayOfMonth: date.getDate(),
      inMonth: date.getMonth() === monthIndex,
      isToday: isSameDate(date, today),
    });
  }
  return cells;
}

// Seven Date objects (Sun→Sat) for the week containing `cursor`.
export function weekDays(cursor) {
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay(), 12);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const dateKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "numeric",
});

export function eventDateKey(isoString) {
  return dateKeyFmt.format(new Date(isoString));
}

function cellDateKey(date) {
  return dateKeyFmt.format(date);
}

// "YYYY-MM-DD" → a local Date at noon (safe against TZ edge shifting the day).
function parseDateKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function groupEventsByDate(events) {
  if (!Array.isArray(events)) return {};
  const map = {};
  for (const event of events) {
    if (!event?.starts_at) continue;
    const key = eventDateKey(event.starts_at);
    (map[key] ??= []).push(event);
  }
  return map;
}

function eventsForDate(byDate, date) {
  const list = byDate[cellDateKey(date)] ?? [];
  return list
    .slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

const GOLD_TYPES = new Set(["family_event", "fundraiser"]);

export function dotColorForType(type) {
  return GOLD_TYPES.has(type) ? "gold" : "blue";
}

// ---------- view toolbar (shared) ----------

function viewToolbarHtml(view) {
  const btn = (v, label) =>
    `<button type="button" class="cal-view-btn${v === view ? " is-active" : ""}" data-cal-view="${v}" aria-pressed="${v === view}">${label}</button>`;
  return `
    <div class="calendar-toolbar">
      <div class="calendar-views" role="group" aria-label="Calendar view">
        ${btn("month", "Month")}${btn("week", "Week")}${btn("day", "Day")}
      </div>
      <button type="button" class="cal-today-btn" data-cal-today>Today</button>
    </div>
  `;
}

function headerHtml(title, navLabel) {
  return `
    <div class="calendar-header">
      <button type="button" class="calendar-nav" data-cal-nav="prev" aria-label="Previous ${navLabel}">‹</button>
      <h2 class="calendar-title">${escapeHtml(title)}</h2>
      <button type="button" class="calendar-nav" data-cal-nav="next" aria-label="Next ${navLabel}">›</button>
    </div>
  `;
}

// ---------- MONTH ----------

function renderMonthCellHtml(cell, forDate) {
  const dateKey = cellDateKey(cell.date);
  const classes = ["calendar-day"];
  if (!cell.inMonth) classes.push("out-of-month");
  if (cell.isToday) classes.push("is-today");
  if (cell.inMonth && forDate?.length) classes.push("has-events");
  const dots = cell.inMonth
    ? (forDate ?? [])
        .map((e) => `<span class="calendar-dot calendar-dot--${dotColorForType(e.type)}" aria-hidden="true"></span>`)
        .join("")
    : "";
  return `
    <button type="button" class="${classes.join(" ")}" data-date="${dateKey}" ${cell.inMonth ? "" : "aria-hidden=\"true\" tabindex=\"-1\""}>
      <span class="calendar-day-num">${cell.dayOfMonth}</span>
      ${dots ? `<span class="calendar-dots">${dots}</span>` : ""}
    </button>
  `;
}

function buildMonthHtml(events, { year, monthIndex, today, view }) {
  const grid = monthGrid(year, monthIndex, today);
  const byDate = groupEventsByDate(events);
  const cells = grid.map((c) => renderMonthCellHtml(c, byDate[cellDateKey(c.date)])).join("");
  const weekdayHeaders = WEEKDAY_LABELS.map((d) => `<div>${d}</div>`).join("");
  return `
    ${viewToolbarHtml(view)}
    ${headerHtml(`${MONTH_NAMES[monthIndex]} ${year}`, "month")}
    <div class="calendar-weekdays">${weekdayHeaders}</div>
    <div class="calendar-grid">${cells}</div>
    <p class="calendar-hint">Tap a highlighted day to see event details.</p>
  `;
}

// ---------- WEEK ----------

function chipHtml(event, dateKey) {
  const time = event.starts_at ? formatTimeCT(event.starts_at) : "";
  return `
    <button type="button" class="cal-chip cal-chip--${dotColorForType(event.type)}" data-cal-day="${dateKey}" data-event-id="${escapeHtml(event.id)}">
      ${time ? `<span class="cal-chip-time">${escapeHtml(time)}</span>` : ""}
      <span class="cal-chip-title">${escapeHtml(event.title ?? "")}</span>
    </button>
  `;
}

function buildWeekHtml(events, { cursor, today, view }) {
  const days = weekDays(cursor);
  const byDate = groupEventsByDate(events);
  const first = days[0];
  const last = days[6];
  const sameMonth = first.getMonth() === last.getMonth();
  const title = sameMonth
    ? `${MONTH_ABBR[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${last.getFullYear()}`
    : `${MONTH_ABBR[first.getMonth()]} ${first.getDate()} – ${MONTH_ABBR[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
  const cols = days
    .map((d, i) => {
      const dayEvents = eventsForDate(byDate, d);
      const dateKey = cellDateKey(d);
      const isToday = isSameDate(d, today);
      return `
        <div class="cal-week-col${isToday ? " is-today" : ""}">
          <button type="button" class="cal-week-daynum" data-cal-day="${dateKey}">
            <span class="cal-week-dow">${WEEKDAY_LABELS[i]}</span>
            <span class="cal-week-date">${d.getDate()}</span>
          </button>
          <div class="cal-week-events">
            ${dayEvents.length ? dayEvents.map((e) => chipHtml(e, dateKey)).join("") : `<span class="cal-week-empty" aria-hidden="true">·</span>`}
          </div>
        </div>
      `;
    })
    .join("");
  return `
    ${viewToolbarHtml(view)}
    ${headerHtml(title, "week")}
    <div class="cal-week">${cols}</div>
    <p class="calendar-hint">Tap an event to see full details.</p>
  `;
}

// ---------- DAY ----------

function detailCardHtml(event) {
  const range = formatTimeRangeCT(event) || "Time TBA";
  const typeLabel = TYPE_LABELS[event.type] ?? TYPE_LABELS.other;
  const rsvp = event.rsvp_url
    ? `<a class="cal-event-rsvp" href="${escapeHtml(event.rsvp_url)}" target="_blank" rel="noopener">${escapeHtml(event.cta_label || "RSVP")} →</a>`
    : "";
  const status =
    event.status && event.status !== "scheduled"
      ? `<div class="cal-event-status cal-event-status--${escapeHtml(event.status)}">${escapeHtml(event.status.toUpperCase())}</div>`
      : "";
  const flyer = event.flyer
    ? `<img class="cal-event-flyer" src="${escapeHtml(String(event.flyer).replace(/^\/+/, ""))}" alt="${escapeHtml(event.title ?? "")} flier" loading="lazy" onerror="this.remove()">`
    : "";
  return `
    <article class="cal-event" data-event-id="${escapeHtml(event.id)}">
      <div class="cal-event-time">${escapeHtml(range)}</div>
      <div class="cal-event-body">
        ${status}
        <span class="cal-event-type cal-event-type--${dotColorForType(event.type)}">${escapeHtml(typeLabel)}</span>
        <h3 class="cal-event-title">${escapeHtml(event.title ?? "")}</h3>
        ${event.location ? `<div class="cal-event-where">${escapeHtml(event.location)}</div>` : ""}
        ${event.description ? `<p class="cal-event-desc">${escapeHtml(event.description)}</p>` : ""}
        ${flyer}
        <div class="cal-event-actions">
          ${rsvp}
          <button type="button" class="event-cal-add" data-ics-event data-event-id="${escapeHtml(event.id)}">+ Add to my calendar</button>
        </div>
      </div>
    </article>
  `;
}

function buildDayHtml(events, { cursor, view }) {
  const byDate = groupEventsByDate(events);
  const dayEvents = eventsForDate(byDate, cursor);
  const title = `${WEEKDAY_LONG[cursor.getDay()]}, ${MONTH_NAMES[cursor.getMonth()]} ${cursor.getDate()}, ${cursor.getFullYear()}`;
  const body = dayEvents.length
    ? `<div class="cal-day-list">${dayEvents.map(detailCardHtml).join("")}</div>`
    : `<p class="cal-day-empty">No events this day. Use ‹ › to browse, or switch to Month view.</p>`;
  return `
    ${viewToolbarHtml(view)}
    ${headerHtml(title, "day")}
    ${body}
  `;
}

// ---------- controls ----------

function attachControls(root, events, state) {
  // View toggle
  root.querySelectorAll("[data-cal-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-cal-view");
      const next = { ...state, view };
      if (view === "month") {
        next.year = state.cursor.getFullYear();
        next.monthIndex = state.cursor.getMonth();
      } else {
        // Center week/day on today if the shown month contains it, else the 1st.
        const inShownMonth =
          state.today.getFullYear() === state.year && state.today.getMonth() === state.monthIndex;
        next.cursor =
          state.view === "month"
            ? new Date(state.year, state.monthIndex, inShownMonth ? state.today.getDate() : 1, 12)
            : state.cursor;
      }
      renderCalendar(events, next);
    });
  });

  // Today
  const todayBtn = root.querySelector("[data-cal-today]");
  if (todayBtn) {
    todayBtn.addEventListener("click", () => {
      renderCalendar(events, {
        ...state,
        year: state.today.getFullYear(),
        monthIndex: state.today.getMonth(),
        cursor: new Date(state.today),
      });
    });
  }

  // Prev / Next (step depends on the view)
  const step = (dir) => {
    if (state.view === "month") {
      const n = state.monthIndex + dir;
      const year = n < 0 ? state.year - 1 : n > 11 ? state.year + 1 : state.year;
      const monthIndex = (n + 12) % 12;
      renderCalendar(events, { ...state, year, monthIndex, cursor: new Date(year, monthIndex, 1, 12) });
    } else {
      const days = state.view === "week" ? 7 : 1;
      const cursor = new Date(state.cursor);
      cursor.setDate(cursor.getDate() + dir * days);
      renderCalendar(events, { ...state, cursor, year: cursor.getFullYear(), monthIndex: cursor.getMonth() });
    }
  };
  root.querySelector('[data-cal-nav="prev"]')?.addEventListener("click", () => step(-1));
  root.querySelector('[data-cal-nav="next"]')?.addEventListener("click", () => step(1));

  // Drill into a day (month cell or week chip/daynum) → Day view
  root.querySelectorAll("[data-cal-day]").forEach((node) => {
    node.addEventListener("click", () => {
      const cursor = parseDateKey(node.getAttribute("data-cal-day"));
      renderCalendar(events, {
        ...state,
        view: "day",
        cursor,
        year: cursor.getFullYear(),
        monthIndex: cursor.getMonth(),
      });
    });
  });
  // Month grid uses data-date on day cells; drill in when the day has events.
  root.querySelectorAll(".calendar-day.has-events").forEach((cell) => {
    cell.addEventListener("click", () => {
      const cursor = parseDateKey(cell.getAttribute("data-date"));
      renderCalendar(events, {
        ...state,
        view: "day",
        cursor,
        year: cursor.getFullYear(),
        monthIndex: cursor.getMonth(),
      });
    });
  });

  // Add-to-calendar buttons in Day view
  const byId = new Map((Array.isArray(events) ? events : []).map((e) => [e.id, e]));
  root.querySelectorAll("[data-ics-event]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const event = byId.get(btn.getAttribute("data-event-id"));
      if (event) downloadEventICS(event);
    });
  });
}

export function renderCalendar(events, options = {}) {
  const root = document.querySelector(CALENDAR_SELECTOR);
  if (!root) return;
  const today = options.today ?? new Date();
  const state = {
    view: options.view ?? "month",
    today,
    year: options.year ?? today.getFullYear(),
    monthIndex: options.monthIndex ?? today.getMonth(),
    cursor: options.cursor ?? new Date(today),
  };
  const builders = { month: buildMonthHtml, week: buildWeekHtml, day: buildDayHtml };
  root.innerHTML = (builders[state.view] ?? buildMonthHtml)(events, state);
  attachControls(root, events, state);
}
