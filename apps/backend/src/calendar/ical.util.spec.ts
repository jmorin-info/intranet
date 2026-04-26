import { buildICal, ICalEvent } from './ical.util';

describe('buildICal — RFC 5545 conformity', () => {
  const baseEvent: ICalEvent = {
    uid: 'ev1@omnitech-intranet',
    summary: 'Réunion, équipe ; "chars"',
    description: 'Description avec, virgule;\n2nd line\\backslash',
    location: 'Salle A1, RDC',
    startDate: new Date('2026-05-15T09:00:00Z'),
    endDate: new Date('2026-05-15T10:30:00Z'),
    allDay: false,
    category: 'REUNION',
    color: '#2563EB',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,TU',
    lastModified: new Date('2026-04-20T10:00:00Z'),
  };

  function build(events: ICalEvent[]): string {
    return buildICal({
      prodId: '-//OMNITECH Security//Intranet//FR',
      calendarName: 'OMNITECH — Test',
      events,
    });
  }

  it('uses CRLF line endings (RFC 5545 §3.1)', () => {
    const ics = build([baseEvent]);
    expect(ics).toContain('\r\n');
    // No bare LF outside of CRLF
    const bareLf = ics.replace(/\r\n/g, '');
    expect(bareLf).not.toContain('\n');
  });

  it('starts with BEGIN:VCALENDAR and ends with END:VCALENDAR', () => {
    const ics = build([baseEvent]);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.includes('END:VCALENDAR\r\n')).toBe(true);
  });

  it('includes VTIMEZONE Europe/Paris block', () => {
    const ics = build([baseEvent]);
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Paris');
    expect(ics).toContain('TZNAME:CEST');
    expect(ics).toContain('TZNAME:CET');
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU');
    expect(ics).toContain('RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU');
  });

  it('emits X-WR-CALNAME and X-WR-TIMEZONE headers', () => {
    const ics = build([baseEvent]);
    expect(ics).toContain('X-WR-CALNAME:OMNITECH — Test');
    expect(ics).toContain('X-WR-TIMEZONE:Europe/Paris');
  });

  it('escapes special characters in TEXT fields (§3.3.11)', () => {
    const ics = build([baseEvent]);
    // SUMMARY: comma + semicolon escaped
    expect(ics).toContain('SUMMARY:Réunion\\, équipe \\; "chars"');
    // DESCRIPTION: newline + backslash escaped
    expect(ics).toContain('DESCRIPTION:Description avec\\, virgule\\;\\n2nd line\\\\backslash');
    // LOCATION
    expect(ics).toContain('LOCATION:Salle A1\\, RDC');
  });

  it('keeps every line ≤ 75 octets via line folding (§3.1)', () => {
    const longSummary = 'Réunion stratégique avec une description très longue '.repeat(5);
    const ics = build([{ ...baseEvent, summary: longSummary }]);
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
    // Continuation lines start with a single space
    const continuationLine = ics.split('\r\n').find((l) => l.startsWith(' '));
    expect(continuationLine).toBeDefined();
  });

  it('emits DTSTART/DTEND in UTC (Z suffix) for timed events', () => {
    const ics = build([baseEvent]);
    expect(ics).toContain('DTSTART:20260515T090000Z');
    expect(ics).toContain('DTEND:20260515T103000Z');
  });

  it('emits DTSTART;VALUE=DATE for allDay events with exclusive DTEND (+1 day)', () => {
    const ics = build([
      {
        uid: 'allday@omnitech-intranet',
        summary: 'Audit',
        startDate: new Date('2026-06-01T00:00:00Z'),
        allDay: true,
      },
    ]);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260601');
    expect(ics).toContain('DTEND;VALUE=DATE:20260602');
  });

  it('includes a stable UID per event', () => {
    const ics = build([baseEvent]);
    expect(ics).toContain('UID:ev1@omnitech-intranet');
  });

  it('emits DTSTAMP (now) and LAST-MODIFIED when provided', () => {
    const ics = build([baseEvent]);
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    expect(ics).toContain('LAST-MODIFIED:20260420T100000Z');
  });

  it('emits RRULE without escaping (structured value)', () => {
    const ics = build([baseEvent]);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TU');
  });

  it('emits COLOR + X-APPLE-CALENDAR-COLOR when color provided', () => {
    const ics = build([baseEvent]);
    expect(ics).toContain('COLOR:#2563EB');
    expect(ics).toContain('X-APPLE-CALENDAR-COLOR:#2563EB');
  });

  it('emits CATEGORIES line when category provided', () => {
    const ics = build([baseEvent]);
    expect(ics).toContain('CATEGORIES:REUNION');
  });

  it('handles multiple events independently', () => {
    const ics = build([
      baseEvent,
      { ...baseEvent, uid: 'ev2@omnitech-intranet', summary: 'Other' },
    ]);
    const veventCount = (ics.match(/BEGIN:VEVENT/g) || []).length;
    expect(veventCount).toBe(2);
  });

  it('omits OPTIONAL fields when not provided', () => {
    const minimalEvent: ICalEvent = {
      uid: 'minimal@omnitech-intranet',
      summary: 'Minimal',
      startDate: new Date('2026-05-15T09:00:00Z'),
    };
    const ics = build([minimalEvent]);
    // Lines per VEVENT (between BEGIN:VEVENT and END:VEVENT)
    const vevent = ics.split('BEGIN:VEVENT')[1]?.split('END:VEVENT')[0] ?? '';
    expect(vevent).not.toContain('DESCRIPTION:');
    expect(vevent).not.toContain('LOCATION:');
    expect(vevent).not.toContain('CATEGORIES:');
    expect(vevent).not.toContain('COLOR:');
    // VEVENT must not carry an RRULE (the VTIMEZONE block above does — that's separate)
    expect(vevent).not.toContain('RRULE:');
    expect(vevent).not.toContain('LAST-MODIFIED:');
    expect(vevent).toContain('UID:minimal@omnitech-intranet');
    expect(vevent).toContain('SUMMARY:Minimal');
  });
});
