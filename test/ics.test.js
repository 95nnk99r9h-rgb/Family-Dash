import test from 'node:test';
import assert from 'node:assert/strict';
import { parseICS, expandCalendar, wallToMs } from '../lib/ics.js';

const ics = (body) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-WR-CALNAME:Familie\r\nX-APPLE-CALENDAR-COLOR:#FF2968FF\r\n${body}\r\nEND:VCALENDAR\r\n`;
const ev = (lines) => `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT`;

test('Kalender-Metadaten', () => {
  const cal = parseICS(ics(''));
  assert.equal(cal.name, 'Familie');
  assert.equal(cal.color, '#FF2968');
});

test('Einzeltermin mit TZID und Zeilenumbruch', () => {
  const cal = parseICS(ics(ev([
    'UID:a', 'DTSTART;TZID=Europe/Berlin:20261113T100000', 'DTEND;TZID=Europe/Berlin:20261113T113000',
    'SUMMARY:Zahnarzt\\, Kontrolle', 'LOCATION:Annweiler', 'DESCRIPTION:Erste Zeile\\nzweite',
    ' Zeile',
  ])));
  const out = expandCalendar(cal, '2026-11-13', '2026-11-14');
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Zahnarzt, Kontrolle');
  assert.equal(out[0].start, '2026-11-13T09:00:00.000Z');
  assert.equal(out[0].end, '2026-11-13T10:30:00.000Z');
  assert.equal(out[0].description, 'Erste Zeile\nzweiteZeile');
});

test('Wöchentlich über Zeitumstellung bleibt 10:00 Ortszeit', () => {
  const cal = parseICS(ics(ev([
    'UID:w', 'DTSTART;TZID=Europe/Berlin:20261020T100000', 'DTEND;TZID=Europe/Berlin:20261020T110000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU', 'SUMMARY:Turnen',
  ])));
  const out = expandCalendar(cal, '2026-10-19', '2026-11-02');
  assert.deepEqual(out.map(e => e.start), ['2026-10-20T08:00:00.000Z', '2026-10-27T09:00:00.000Z']);
});

test('Wöchentlich mehrere Tage, INTERVAL, COUNT', () => {
  const cal = parseICS(ics(ev([
    'UID:x', 'DTSTART:20261102T160000Z', 'DURATION:PT1H', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH;COUNT=5', 'SUMMARY:Musik',
  ])));
  const out = expandCalendar(cal, '2026-11-01', '2027-01-01');
  assert.deepEqual(out.map(e => e.start.slice(0, 10)), ['2026-11-02', '2026-11-05', '2026-11-16', '2026-11-19', '2026-11-30']);
});

test('Monatlich zweiter Dienstag und letzter Freitag', () => {
  const cal = parseICS(ics([
    ev(['UID:m1', 'DTSTART;TZID=Europe/Berlin:20260908T190000', 'RRULE:FREQ=MONTHLY;BYDAY=2TU', 'SUMMARY:Elternabend']),
    ev(['UID:m2', 'DTSTART;VALUE=DATE:20260925', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR', 'SUMMARY:Papiermüll']),
  ].join('\r\n')));
  const out = expandCalendar(cal, '2026-11-01', '2026-12-01');
  const t = out.map(e => `${e.title}@${e.allDay ? e.start : e.start.slice(0, 10)}`);
  assert.ok(t.includes('Elternabend@2026-11-10'));
  assert.ok(t.includes('Papiermüll@2026-11-27'));
});

test('Jährlicher ganztägiger Geburtstag', () => {
  const cal = parseICS(ics(ev(['UID:b', 'DTSTART;VALUE=DATE:20100314', 'DTEND;VALUE=DATE:20100315', 'RRULE:FREQ=YEARLY', 'SUMMARY:Geburtstag Oma'])));
  const out = expandCalendar(cal, '2027-03-01', '2027-04-01');
  assert.equal(out.length, 1);
  assert.equal(out[0].start, '2027-03-14');
  assert.equal(out[0].end, '2027-03-15');
  assert.equal(out[0].allDay, true);
});

test('EXDATE, UNTIL und RECURRENCE-ID-Ausnahme', () => {
  const cal = parseICS(ics([
    ev(['UID:d', 'DTSTART;TZID=Europe/Berlin:20261109T073000', 'DTEND;TZID=Europe/Berlin:20261109T080000',
      'RRULE:FREQ=DAILY;UNTIL=20261113T225959Z', 'EXDATE;TZID=Europe/Berlin:20261111T073000', 'SUMMARY:Bus']),
    ev(['UID:d', 'RECURRENCE-ID;TZID=Europe/Berlin:20261112T073000', 'DTSTART;TZID=Europe/Berlin:20261112T090000',
      'DTEND;TZID=Europe/Berlin:20261112T093000', 'SUMMARY:Bus (später)']),
  ].join('\r\n')));
  const out = expandCalendar(cal, '2026-11-01', '2026-12-01');
  assert.deepEqual(out.map(e => e.title + ' ' + e.start), [
    'Bus 2026-11-09T06:30:00.000Z',
    'Bus 2026-11-10T06:30:00.000Z',
    'Bus (später) 2026-11-12T08:00:00.000Z',
    'Bus 2026-11-13T06:30:00.000Z',
  ]);
});

test('Mehrtägige Termine überlappen den Bereich, abgesagte fehlen', () => {
  const cal = parseICS(ics([
    ev(['UID:u', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261116', 'SUMMARY:Urlaub']),
    ev(['UID:c', 'DTSTART:20261113T100000Z', 'DTEND:20261113T110000Z', 'STATUS:CANCELLED', 'SUMMARY:Weg']),
  ].join('\r\n')));
  const out = expandCalendar(cal, '2026-11-13', '2026-11-14');
  assert.deepEqual(out.map(e => e.title), ['Urlaub']);
});

test('wallToMs Sommer/Winter', () => {
  assert.equal(new Date(wallToMs({ y: 2026, m: 7, d: 1, h: 12 }, 'Europe/Berlin')).toISOString(), '2026-07-01T10:00:00.000Z');
  assert.equal(new Date(wallToMs({ y: 2026, m: 12, d: 1, h: 12 }, 'Europe/Berlin')).toISOString(), '2026-12-01T11:00:00.000Z');
});
