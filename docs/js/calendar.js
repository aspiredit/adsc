const TZ             = "America/Chicago";
const CALENDAR_SELECTOR = "#calendar";
const WEEKDAY_LABELS    = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES       = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const HOUR_START = 6;
const HOUR_END   = 22;
const HOUR_H     = 56;
const GOLD_TYPES = new Set(["family_event", "fundraiser"]);

// ─── Shared helpers ──────────────────────────────────────────────────────────

const _dateKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "numeric",
});

export function eventDateKey(isoString) {
  return _dateKeyFmt.format(new Date(isoString));
}

export function groupEventsByDate(events) {
  if (!Array.isArray(events)) return {};
  const map = {};
  for (const ev of events) {
    if (!ev?.starts_at) continue;
    const key = eventDateKey(ev.starts_at);
    (map[key] ??= []).push(ev);
  }
  return map;
}

export function dotColorForType(type) {
  return GOLD_TYPES.has(type) ? "gold" : "blue";
}

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Monthly grid (legacy + default view) ────────────────────────────────────

export function monthGrid(year, monthIndex, today = new Date()) {
  const firstOfMonth   = new Date(year, monthIndex, 1);
  const startDayOfWeek = firstOfMonth.getDay();
  const gridStart      = new Date(year, monthIndex, 1 - startDayOfWeek);
  const cells = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    cells.push({
      date,
      dayOfMonth: date.getDate(),
      inMonth:    date.getMonth() === monthIndex,
      isToday:    date.toDateString() === today.toDateString(),
    });
  }
  return cells;
}

function cellDateKey(date) {
  return _dateKeyFmt.format(date);
}

function buildMonthHtml(events, { year, monthIndex, today }) {
  const grid   = monthGrid(year, monthIndex, today);
  const byDate = groupEventsByDate(events);

  const cells = grid.map(cell => {
    const dateKey   = cellDateKey(cell.date);
    const dayEvents = byDate[dateKey];
    const classes   = ["calendar-day"];
    if (!cell.inMonth) classes.push("out-of-month");
    if (cell.isToday) classes.push("is-today");
    if (cell.inMonth && dayEvents?.length) classes.push("has-events");

    const dots = cell.inMonth
      ? (dayEvents ?? [])
          .map(e => `<span class="calendar-dot calendar-dot--${dotColorForType(e.type)}" aria-hidden="true"></span>`)
          .join("")
      : "";

    return `
      <button type="button" class="${classes.join(" ")}" data-date="${dateKey}"
        ${cell.inMonth ? "" : 'aria-hidden="true" tabindex="-1"'}>
        <span class="calendar-day-num">${cell.dayOfMonth}</span>
        ${dots ? `<span class="calendar-dots">${dots}</span>` : ""}
      </button>`;
  }).join("");

  const weekdayHeaders = WEEKDAY_LABELS.map(d => `<div>${d}</div>`).join("");

  return `
    <div class="calendar-header">
      <button type="button" class="calendar-nav" data-cal-nav="prev" aria-label="Previous month">&#8249;</button>
      <h2 class="calendar-title">${MONTH_NAMES[monthIndex]} ${year}</h2>
      <button type="button" class="calendar-nav" data-cal-nav="next" aria-label="Next month">&#8250;</button>
    </div>
    <div class="calendar-weekdays">${weekdayHeaders}</div>
    <div class="calendar-grid">${cells}</div>`;
}

// ─── Week-view helpers ───────────────────────────────────────────────────────

function getWeekSunday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function localDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function chicagoDateKey(isoStr) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(isoStr));
}

function chicagoHourMin(isoStr) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(isoStr));
  return {
    hour:   parseInt(parts.find(p => p.type === "hour").value, 10),
    minute: parseInt(parts.find(p => p.type === "minute").value, 10),
  };
}

function evTop(isoStr) {
  const { hour, minute } = chicagoHourMin(isoStr);
  return Math.max(0, (hour - HOUR_START + minute / 60) * HOUR_H);
}

function evHeight(startIso, endIso) {
  if (!endIso) return HOUR_H;
  return Math.max(22, Math.min((new Date(endIso) - new Date(startIso)) / 3_600_000, 24) * HOUR_H);
}

function fmtTime(isoStr) {
  return new Date(isoStr).toLocaleTimeString("en-US", {
    timeZone: TZ, hour: "numeric", minute: "2-digit",
  });
}

function fmtFullDate(isoStr) {
  return new Date(isoStr).toLocaleDateString("en-US", {
    timeZone: TZ, weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function weekLabel(sunday) {
  const sat = addDays(sunday, 6);
  if (sunday.getMonth() === sat.getMonth()) {
    return `${MONTH_NAMES[sunday.getMonth()]} ${sunday.getDate()}–${sat.getDate()}, ${sunday.getFullYear()}`;
  }
  return `${MONTH_NAMES[sunday.getMonth()].slice(0, 3)} ${sunday.getDate()} – ${MONTH_NAMES[sat.getMonth()].slice(0, 3)} ${sat.getDate()}, ${sunday.getFullYear()}`;
}

// ─── Event popup ─────────────────────────────────────────────────────────────

let _popup = null;

function closePopup() {
  if (_popup) { _popup.remove(); _popup = null; }
}

function openPopup(ev, anchorEl) {
  closePopup();
  const popup = document.createElement("div");
  popup.className = "wk-popup";

  const color     = GOLD_TYPES.has(ev.type) ? "var(--gold)" : "var(--blue-deep)";
  const typeLabel = ev.type === "meetup" ? "Dads Meetup"
    : ev.type === "family_event" ? "Family Event"
    : ev.type === "fundraiser"   ? "Fundraiser"
    : "Event";
  const timeStr   = fmtTime(ev.starts_at) + (ev.ends_at ? " – " + fmtTime(ev.ends_at) : "");

  popup.innerHTML = `
    <button class="wk-popup-close" aria-label="Close">&#x2715;</button>
    <div class="wk-popup-type" style="background:${color}">${escHtml(typeLabel)}</div>
    <div class="wk-popup-title">${escHtml(ev.title)}</div>
    <div class="wk-popup-row">&#128197; ${escHtml(fmtFullDate(ev.starts_at))}</div>
    <div class="wk-popup-row">&#128336; ${escHtml(timeStr)}</div>
    ${ev.location    ? `<div class="wk-popup-row">&#128205; ${escHtml(ev.location)}</div>` : ""}
    ${ev.description ? `<div class="wk-popup-desc">${escHtml(ev.description)}</div>`      : ""}
    ${ev.rsvp_url    ? `<a class="wk-popup-rsvp" href="${escHtml(ev.rsvp_url)}" target="_blank" rel="noopener">${escHtml(ev.cta_label || "RSVP")}</a>` : ""}
  `;
  document.body.appendChild(popup);
  _popup = popup;

  const rect = anchorEl.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - 316);
  const top  = Math.min(rect.bottom + 6, window.innerHeight - 260);
  popup.style.left = `${Math.max(8, left)}px`;
  popup.style.top  = `${Math.max(8, top)}px`;

  popup.querySelector(".wk-popup-close").addEventListener("click", closePopup);
}

// ─── Week view HTML builder ───────────────────────────────────────────────────

function buildWeekHtml(events, sunday) {
  const todayKey  = localDateKey(new Date());
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));

  const byDate = {};
  for (const ev of events) {
    if (!ev.starts_at) continue;
    const key = chicagoDateKey(ev.starts_at);
    (byDate[key] ??= []).push(ev);
  }

  const dayHeadCells = weekDates.map(d => {
    const isToday = localDateKey(d) === todayKey;
    const numHtml = isToday
      ? `<span class="wk-day-num wk-today-circle">${d.getDate()}</span>`
      : `<span class="wk-day-num">${d.getDate()}</span>`;
    return `<div class="wk-head-cell${isToday ? " wk-today" : ""}">${WEEKDAY_LABELS[d.getDay()]}${numHtml}</div>`;
  }).join("");

  let timeLabels = "";
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    const ampm = h < 12 ? "AM" : "PM";
    const disp = h === 0 ? 12 : h > 12 ? h - 12 : h;
    timeLabels += `<div class="wk-time-label">${h < HOUR_END ? `${disp} ${ampm}` : ""}</div>`;
  }

  const dayCols = weekDates.map(d => {
    const dateKey = localDateKey(d);
    const isToday = dateKey === todayKey;
    const dayEvs  = byDate[dateKey] || [];

    let slots = "";
    for (let h = HOUR_START; h < HOUR_END; h++) slots += `<div class="wk-slot"></div>`;

    const blocks = dayEvs.map(ev => {
      const top    = evTop(ev.starts_at);
      const height = evHeight(ev.starts_at, ev.ends_at);
      const color  = GOLD_TYPES.has(ev.type) ? "gold" : "blue";
      const timeStr = fmtTime(ev.starts_at) + (ev.ends_at ? ` – ${fmtTime(ev.ends_at)}` : "");
      return `
        <div class="wk-ev wk-ev--${color}"
             style="top:${top}px;height:${height}px"
             data-ev-id="${escHtml(ev.id)}"
             role="button" tabindex="0"
             aria-label="${escHtml(ev.title)}, ${escHtml(timeStr)}">
          <div class="wk-ev-title">${escHtml(ev.title)}</div>
          ${height >= 36 ? `<div class="wk-ev-time">${escHtml(timeStr)}</div>` : ""}
        </div>`;
    }).join("");

    return `<div class="wk-day-col${isToday ? " wk-today-col" : ""}">${slots}${blocks}</div>`;
  }).join("");

  return `
    <div class="wk-toolbar">
      <div class="wk-toolbar-left">
        <button class="wk-nav-btn wk-back-btn" data-action="back">&#8592; Month</button>
        <button class="wk-nav-btn" data-action="today">Today</button>
        <button class="wk-nav-btn wk-nav-arrow" data-action="prev" aria-label="Previous week">&#8249;</button>
        <button class="wk-nav-btn wk-nav-arrow" data-action="next" aria-label="Next week">&#8250;</button>
      </div>
      <span class="wk-week-label">${escHtml(weekLabel(sunday))}</span>
    </div>
    <div class="wk-grid-wrap">
      <div class="wk-head">
        <div class="wk-head-gap"></div>
        ${dayHeadCells}
      </div>
      <div class="wk-body">
        <div class="wk-time-col">${timeLabels}</div>
        <div class="wk-days">${dayCols}</div>
      </div>
    </div>`;
}

// ─── renderCalendar — public entry point ─────────────────────────────────────

export function renderCalendar(events, options = {}) {
  const root = document.querySelector(CALENDAR_SELECTOR);
  if (!root) return;

  const today = options.today ?? new Date();

  function showMonth(year, monthIndex) {
    root.className = "cal-month-view";
    root.innerHTML = buildMonthHtml(events, { year, monthIndex, today });

    root.querySelector('[data-cal-nav="prev"]').addEventListener("click", () => {
      const prev = monthIndex - 1;
      showMonth(prev < 0 ? year - 1 : year, (prev + 12) % 12);
    });
    root.querySelector('[data-cal-nav="next"]').addEventListener("click", () => {
      const next = monthIndex + 1;
      showMonth(next > 11 ? year + 1 : year, next % 12);
    });

    // Click a date with events → switch to week view for that week
    const byDate = groupEventsByDate(events);
    root.querySelectorAll(".calendar-day.has-events").forEach(cell => {
      cell.addEventListener("click", () => {
        const dateStr = cell.getAttribute("data-date"); // "YYYY-MM-DD"
        const [y, m, d] = dateStr.split("-").map(Number);
        const clicked = new Date(y, m - 1, d);
        showWeek(getWeekSunday(clicked));
      });
    });
  }

  function showWeek(sunday) {
    root.className = "cal-week-view";
    root.innerHTML = buildWeekHtml(events, sunday);

    root.querySelector("[data-action='back']").addEventListener("click", () => {
      closePopup();
      showMonth(sunday.getFullYear(), sunday.getMonth());
    });
    root.querySelector("[data-action='today']").addEventListener("click", () => {
      showWeek(getWeekSunday(new Date()));
    });
    root.querySelector("[data-action='prev']").addEventListener("click", () => {
      showWeek(addDays(sunday, -7));
    });
    root.querySelector("[data-action='next']").addEventListener("click", () => {
      showWeek(addDays(sunday, 7));
    });

    root.querySelectorAll(".wk-ev").forEach(blk => {
      const handler = e => {
        e.stopPropagation();
        const ev = events.find(ev => ev.id === blk.dataset.evId);
        if (ev) openPopup(ev, blk);
      };
      blk.addEventListener("click", handler);
      blk.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") handler(e);
      });
    });

    document.addEventListener("click", e => {
      if (_popup && !_popup.contains(e.target)) closePopup();
    }, { once: true });
  }

  // Start with month view
  showMonth(today.getFullYear(), today.getMonth());
}
