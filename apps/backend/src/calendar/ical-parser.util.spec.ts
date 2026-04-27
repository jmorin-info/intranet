import { parseICal } from "./ical-parser.util";

describe("parseICal", () => {
  it("parses a minimal VEVENT block with UTC times", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Test//EN",
      "BEGIN:VEVENT",
      "UID:abc-123@example.com",
      "DTSTART:20260501T090000Z",
      "DTEND:20260501T100000Z",
      "SUMMARY:Test event",
      "DESCRIPTION:Hello\\, world!",
      "LOCATION:Office",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const parsed = parseICal(ics);
    expect(parsed.events).toHaveLength(1);
    const e = parsed.events[0]!;
    expect(e.uid).toBe("abc-123@example.com");
    expect(e.summary).toBe("Test event");
    expect(e.description).toBe("Hello, world!");
    expect(e.location).toBe("Office");
    expect(e.allDay).toBe(false);
    expect(e.startDate.toISOString()).toBe("2026-05-01T09:00:00.000Z");
    expect(e.endDate?.toISOString()).toBe("2026-05-01T10:00:00.000Z");
  });

  it("parses an allDay event (DTSTART;VALUE=DATE)", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:allday-1",
      "DTSTART;VALUE=DATE:20260615",
      "SUMMARY:Conférence",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseICal(ics);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]!.allDay).toBe(true);
    expect(parsed.events[0]!.startDate.toISOString()).toBe(
      "2026-06-15T00:00:00.000Z",
    );
  });

  it("unfolds multi-line continuations", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:fold-1",
      "DTSTART:20260501T090000Z",
      "SUMMARY:Réunion mensuelle de coordination ",
      " RSSI / DSI / Direction",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseICal(ics);
    expect(parsed.events[0]!.summary).toContain("Réunion mensuelle");
    expect(parsed.events[0]!.summary).toContain("RSSI / DSI");
  });

  it("captures RRULE as raw string", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:weekly-1",
      "DTSTART:20260501T090000Z",
      "SUMMARY:Stand-up",
      "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseICal(ics);
    expect(parsed.events[0]!.recurrence).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    );
  });

  it("parses ORGANIZER mailto:", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:org-1",
      "DTSTART:20260501T090000Z",
      "SUMMARY:With organizer",
      "ORGANIZER;CN=Alice Martin:mailto:alice@example.com",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseICal(ics);
    expect(parsed.events[0]!.organizer).toBe("alice@example.com");
  });

  it("ignores malformed events but processes the rest", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:bad-1",
      "DTSTART:not-a-date",
      "SUMMARY:Bad",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:good-1",
      "DTSTART:20260501T090000Z",
      "SUMMARY:Good",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseICal(ics);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]!.uid).toBe("good-1");
  });

  it("handles X-WR-CALNAME at calendar level", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "X-WR-CALNAME:Mes événements",
      "BEGIN:VEVENT",
      "UID:cal-1",
      "DTSTART:20260501T090000Z",
      "SUMMARY:E",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const parsed = parseICal(ics);
    expect(parsed.calendarName).toBe("Mes événements");
  });
});
