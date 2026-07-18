import { describe, it, expect, beforeEach } from "vitest";
import {
  monthGrid,
  eventDateKey,
  groupEventsByDate,
  dotColorForType,
  renderCalendar,
} from "../js/calendar.js";

describe("monthGrid", () => {
  it("returns 42 cells (6 weeks x 7 days)", () => {
    const grid = monthGrid(2026, 5); // June 2026 (0-indexed month)
    expect(grid).toHaveLength(42);
  });

  it("flags in-month days correctly for June 2026", () => {
    const grid = monthGrid(2026, 5);
    const inMonth = grid.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(inMonth[0].dayOfMonth).toBe(1);
    expect(inMonth[29].dayOfMonth).toBe(30);
  });

  it("starts the grid on a Sunday", () => {
    const grid = monthGrid(2026, 5); // June 1 2026 is a Monday → first cell is Sunday May 31
    expect(grid[0].date.getDay()).toBe(0);
  });

  it("marks today when today is in the rendered month", () => {
    const today = new Date("2026-06-15T12:00:00-05:00");
    const grid = monthGrid(2026, 5, today);
    const todayCells = grid.filter((c) => c.isToday);
    expect(todayCells).toHaveLength(1);
    expect(todayCells[0].dayOfMonth).toBe(15);
  });

  it("does not mark today when rendered month differs", () => {
    const today = new Date("2026-06-15T12:00:00-05:00");
    const grid = monthGrid(2026, 6, today); // July
    expect(grid.find((c) => c.isToday)).toBeUndefined();
  });
});

describe("eventDateKey", () => {
  it("returns YYYY-MM-DD for the event's start in America/Chicago", () => {
    expect(eventDateKey("2026-06-13T18:30:00-05:00")).toBe("2026-06-13");
  });

  it("handles late-night events crossing midnight UTC (still CT date)", () => {
    expect(eventDateKey("2026-06-13T23:30:00-05:00")).toBe("2026-06-13");
  });
});

describe("groupEventsByDate", () => {
  it("buckets events by their CT date key", () => {
    const events = [
      { id: "a", starts_at: "2026-06-13T19:00:00-05:00", type: "meetup" },
      { id: "b", starts_at: "2026-06-13T22:00:00-05:00", type: "fundraiser" },
      { id: "c", starts_at: "2026-06-14T13:00:00-05:00", type: "family_event" },
    ];
    const map = groupEventsByDate(events);
    expect(map["2026-06-13"]).toHaveLength(2);
    expect(map["2026-06-14"]).toHaveLength(1);
  });

  it("returns an empty object for empty input", () => {
    expect(groupEventsByDate([])).toEqual({});
  });
});

describe("dotColorForType", () => {
  it("returns blue for meetup", () => {
    expect(dotColorForType("meetup")).toBe("blue");
  });
  it("returns gold for family_event", () => {
    expect(dotColorForType("family_event")).toBe("gold");
  });
  it("returns gold for fundraiser", () => {
    expect(dotColorForType("fundraiser")).toBe("gold");
  });
  it("returns blue for other and unknown types", () => {
    expect(dotColorForType("other")).toBe("blue");
    expect(dotColorForType("unknown_value")).toBe("blue");
  });
});

describe("renderCalendar (DOM)", () => {
  beforeEach(() => {
    document.body.innerHTML = `<section id="calendar"></section>`;
  });

  it("renders the month title", () => {
    renderCalendar(
      [],
      { year: 2026, monthIndex: 5, today: new Date("2026-06-15T12:00:00-05:00") }
    );
    const title = document.querySelector(".calendar-title");
    expect(title.textContent).toContain("June");
    expect(title.textContent).toContain("2026");
  });

  it("renders 7 weekday headers + 42 day cells", () => {
    renderCalendar(
      [],
      { year: 2026, monthIndex: 5, today: new Date("2026-06-15T12:00:00-05:00") }
    );
    expect(document.querySelectorAll(".calendar-weekdays > *")).toHaveLength(7);
    expect(document.querySelectorAll(".calendar-day")).toHaveLength(42);
  });

  it("adds a dot to dates with events", () => {
    const events = [
      { id: "a", starts_at: "2026-06-13T19:00:00-05:00", type: "meetup" },
    ];
    renderCalendar(events, { year: 2026, monthIndex: 5, today: new Date("2026-06-15T12:00:00-05:00") });
    const cellWithEvent = document.querySelector('.calendar-day[data-date="2026-06-13"]');
    expect(cellWithEvent.querySelector(".calendar-dot")).not.toBeNull();
  });

  it("marks today with a class", () => {
    renderCalendar(
      [],
      { year: 2026, monthIndex: 5, today: new Date("2026-06-15T12:00:00-05:00") }
    );
    const today = document.querySelector('.calendar-day[data-date="2026-06-15"]');
    expect(today.classList.contains("is-today")).toBe(true);
  });

  it("marks out-of-month days with a class", () => {
    renderCalendar(
      [],
      { year: 2026, monthIndex: 5, today: new Date("2026-06-15T12:00:00-05:00") }
    );
    const outOfMonth = document.querySelectorAll(".calendar-day.out-of-month");
    expect(outOfMonth.length).toBeGreaterThan(0);
  });

  it("renders prev and next navigation buttons", () => {
    renderCalendar([], { year: 2026, monthIndex: 5, today: new Date() });
    expect(document.querySelector('[data-cal-nav="prev"]')).not.toBeNull();
    expect(document.querySelector('[data-cal-nav="next"]')).not.toBeNull();
  });

  it("clicking next nav re-renders to the following month", () => {
    renderCalendar(
      [],
      { year: 2026, monthIndex: 5, today: new Date("2026-06-15T12:00:00-05:00") }
    );
    document.querySelector('[data-cal-nav="next"]').click();
    expect(document.querySelector(".calendar-title").textContent).toContain("July");
  });

  it("does not render dots for events outside the visible month", () => {
    const events = [
      { id: "a", starts_at: "2026-08-15T19:00:00-05:00", type: "meetup" },
    ];
    renderCalendar(events, { year: 2026, monthIndex: 5, today: new Date("2026-06-15T12:00:00-05:00") });
    expect(document.querySelectorAll(".calendar-dot")).toHaveLength(0);
  });
});

describe("renderCalendar view toggle (DOM)", () => {
  beforeEach(() => {
    document.body.innerHTML = `<section id="calendar"></section>`;
  });

  const events = [
    {
      id: "2026-06-13-slick",
      title: "Dads at Slick Willie's",
      type: "meetup",
      starts_at: "2026-06-13T19:00:00-05:00",
      ends_at: "2026-06-13T21:00:00-05:00",
      location: "Slick Willie's",
      description: "Pool and conversation.",
    },
  ];
  const today = new Date("2026-06-15T12:00:00-05:00");

  it("renders a Month/Week/Day toggle with Month active by default", () => {
    renderCalendar(events, { year: 2026, monthIndex: 5, today });
    const btns = document.querySelectorAll("[data-cal-view]");
    expect(btns).toHaveLength(3);
    const active = document.querySelector(".cal-view-btn.is-active");
    expect(active.getAttribute("data-cal-view")).toBe("month");
  });

  it("week view renders 7 day columns", () => {
    renderCalendar(events, { view: "week", cursor: new Date(2026, 5, 13, 12), today });
    expect(document.querySelectorAll(".cal-week-col")).toHaveLength(7);
  });

  it("week view shows an event chip on the event's day", () => {
    renderCalendar(events, { view: "week", cursor: new Date(2026, 5, 13, 12), today });
    const chip = document.querySelector(".cal-chip");
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain("Slick Willie");
  });

  it("day view shows full event details including the time range", () => {
    renderCalendar(events, { view: "day", cursor: new Date(2026, 5, 13, 12), today });
    const card = document.querySelector(".cal-event");
    expect(card).not.toBeNull();
    expect(card.querySelector(".cal-event-title").textContent).toContain("Dads at Slick Willie's");
    expect(card.querySelector(".cal-event-where").textContent).toContain("Slick Willie's");
    expect(card.querySelector(".cal-event-time").textContent).toMatch(/7:00/);
    expect(card.querySelector(".cal-event-time").textContent).toMatch(/9:00/);
  });

  it("day view shows an empty message when no events fall on the day", () => {
    renderCalendar(events, { view: "day", cursor: new Date(2026, 5, 20, 12), today });
    expect(document.querySelector(".cal-day-empty")).not.toBeNull();
    expect(document.querySelector(".cal-event")).toBeNull();
  });

  it("clicking a month day with events drills into Day view", () => {
    renderCalendar(events, { year: 2026, monthIndex: 5, today });
    document.querySelector('.calendar-day[data-date="2026-06-13"]').click();
    expect(document.querySelector(".cal-event")).not.toBeNull();
    const active = document.querySelector(".cal-view-btn.is-active");
    expect(active.getAttribute("data-cal-view")).toBe("day");
  });
});
