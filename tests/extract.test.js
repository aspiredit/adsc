import { describe, it, expect } from "vitest";
import { extractEvents, hasValidDate } from "../docs/js/events.js";

describe("extractEvents", () => {
  it("returns the array when given a bare array", () => {
    const arr = [{ id: "a" }, { id: "b" }];
    expect(extractEvents(arr)).toBe(arr);
  });

  it("unwraps the { events: [...] } shape that Pages CMS writes", () => {
    const wrapped = { events: [{ id: "a" }] };
    expect(extractEvents(wrapped)).toEqual([{ id: "a" }]);
  });

  it("returns empty array for null / undefined", () => {
    expect(extractEvents(null)).toEqual([]);
    expect(extractEvents(undefined)).toEqual([]);
  });

  it("returns empty array for an object without an events array", () => {
    expect(extractEvents({ foo: "bar" })).toEqual([]);
  });
});

describe("hasValidDate", () => {
  it("accepts ISO 8601 with offset", () => {
    expect(hasValidDate({ starts_at: "2026-05-30T17:00:00-05:00" })).toBe(true);
  });

  it("rejects the unparseable CMS human format", () => {
    expect(hasValidDate({ starts_at: "May 30 2026 5 PM CST" })).toBe(false);
  });

  it("rejects missing starts_at", () => {
    expect(hasValidDate({ title: "no date" })).toBe(false);
    expect(hasValidDate({})).toBe(false);
    expect(hasValidDate(null)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(hasValidDate({ starts_at: "" })).toBe(false);
  });
});
