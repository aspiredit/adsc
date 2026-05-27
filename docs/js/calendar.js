const TZ = "America/Chicago";
const CALENDAR_SELECTOR = "#calendar";
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isSameDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
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

const dateKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "numeric",
});

export function eventDateKey(isoString) {
  return dateKeyFmt.format(new Date(isoString));
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

const GOLD_TYPES = new Set(["family_event", "fundraiser"]);

export function dotColorForType(type) {
  return GOLD_TYPES.has(type) ? "gold" : "blue";
}

function cellDateKey(date) {
  return dateKeyFmt.format(date);
}

function renderCellHtml(cell, eventsForDate) {
  const dateKey = cellDateKey(cell.date);
  const classes = ["calendar-day"];
  if (!cell.inMonth) classes.push("out-of-month");
  if (cell.isToday) classes.push("is-today");
  if (cell.inMonth && eventsForDate?.length) classes.push("has-events");
  const dots = cell.inMonth
    ? (eventsForDate ?? [])
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

function buildCalendarHtml(events, { year, monthIndex, today }) {
  const grid = monthGrid(year, monthIndex, today);
  const byDate = groupEventsByDate(events);
  const cells = grid.map((c) => renderCellHtml(c, byDate[cellDateKey(c.date)])).join("");
  const weekdayHeaders = WEEKDAY_LABELS.map((d) => `<div>${d}</div>`).join("");
  return `
    <div class="calendar-header">
      <button type="button" class="calendar-nav" data-cal-nav="prev" aria-label="Previous month">‹</button>
      <h2 class="calendar-title">${MONTH_NAMES[monthIndex]} ${year}</h2>
      <button type="button" class="calendar-nav" data-cal-nav="next" aria-label="Next month">›</button>
    </div>
    <div class="calendar-weekdays">${weekdayHeaders}</div>
    <div class="calendar-grid">${cells}</div>
  `;
}

function attachNav(root, events, state) {
  root.querySelector('[data-cal-nav="prev"]').addEventListener("click", () => {
    const next = state.monthIndex - 1;
    const newYear = next < 0 ? state.year - 1 : state.year;
    const newMonth = (next + 12) % 12;
    renderCalendar(events, { ...state, year: newYear, monthIndex: newMonth });
  });
  root.querySelector('[data-cal-nav="next"]').addEventListener("click", () => {
    const next = state.monthIndex + 1;
    const newYear = next > 11 ? state.year + 1 : state.year;
    const newMonth = next % 12;
    renderCalendar(events, { ...state, year: newYear, monthIndex: newMonth });
  });
}

function attachDayClicks(root, events) {
  const byDate = groupEventsByDate(events);
  root.querySelectorAll(".calendar-day.has-events").forEach((cell) => {
    cell.addEventListener("click", () => {
      const dateKey = cell.getAttribute("data-date");
      const eventsForDate = byDate[dateKey] ?? [];
      if (eventsForDate.length === 0) return;
      const targetId = eventsForDate[0].id;
      const targetCard =
        document.querySelector(`[data-event-id="${targetId}"]`) ??
        document.querySelector(".rsvp-featured");
      targetCard?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

export function renderCalendar(events, options = {}) {
  const root = document.querySelector(CALENDAR_SELECTOR);
  if (!root) return;
  const today = options.today ?? new Date();
  const state = {
    year: options.year ?? today.getFullYear(),
    monthIndex: options.monthIndex ?? today.getMonth(),
    today,
  };
  root.innerHTML = buildCalendarHtml(events, state);
  attachNav(root, events, state);
  attachDayClicks(root, events);
}
