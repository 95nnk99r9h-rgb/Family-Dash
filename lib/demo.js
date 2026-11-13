// Beispieldaten für den Demo-Modus (DEMO=1): Kalender & Bring!-Liste ohne echte Konten.
import { DEFAULT_TZ } from './ics.js';

function ymdIn(tz, offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(d).replaceAll('-', '');
}

export function demoIcs() {
  const t = o => ymdIn(DEFAULT_TZ, o);
  const ev = (uid, day, from, to, title, loc = '', extra = []) => [
    'BEGIN:VEVENT', `UID:demo-${uid}`,
    from ? `DTSTART;TZID=${DEFAULT_TZ}:${day}T${from}00` : `DTSTART;VALUE=DATE:${day}`,
    to ? `DTEND;TZID=${DEFAULT_TZ}:${day}T${to}00` : '',
    `SUMMARY:${title}`, loc ? `LOCATION:${loc}` : '', ...extra, 'END:VEVENT',
  ].filter(Boolean).join('\r\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'X-WR-CALNAME:Familie', 'X-APPLE-CALENDAR-COLOR:#FF6B8B',
    ev('1', t(0), '0730', '0800', 'Kinder zur Schule', 'Grundschule Annweiler'),
    ev('2', t(0), '1500', '1600', 'Schwimmkurs Mia', 'Hallenbad Annweiler'),
    ev('3', t(0), '1830', '2000', 'Elternabend', 'Trifels-Gymnasium'),
    ev('4', t(1), null, null, 'Papiermüll'),
    ev('5', t(1), '1000', '1130', 'Wanderung zur Burg Trifels', 'Burg Trifels'),
    ev('6', t(1), '1600', '1800', 'Kindergeburtstag bei Lena', 'Hauptstraße 12'),
    ev('7', t(2), '1100', '1200', 'Zahnarzt Ben', 'Praxis Dr. Weber'),
    ev('8', t(-1), '1700', '1800', 'Fußballtraining', 'Sportplatz', ['RRULE:FREQ=WEEKLY;COUNT=8']),
    ev('9', t(4), null, null, 'Oma & Opa zu Besuch'),
    ev('10', t(6), '0900', '1200', 'Wochenmarkt', 'Marktplatz Landau'),
    ev('11', t(9), '1930', '2200', 'Kino-Abend'),
    'END:VCALENDAR',
  ].join('\r\n');
}

let list = {
  purchase: [
    ['Milch', '2 Liter'], ['Brot', ''], ['Äpfel', '1 kg'], ['Eier', '10 Stück'], ['Butter', ''],
    ['Tomaten', ''], ['Nudeln', ''], ['Käse', 'Gouda'], ['Bananen', ''], ['Joghurt', ''],
  ].map(([name, spec], i) => ({ name, spec, uuid: 'd' + i })),
  recently: [['Kaffee', ''], ['Zwiebeln', ''], ['Karotten', ''], ['Reis', ''], ['Salat', '']]
    .map(([name, spec], i) => ({ name, spec, uuid: 'r' + i })),
};

export const demoBring = {
  getList: () => ({ uuid: 'demo', ...structuredClone(list) }),
  getLists: () => [{ uuid: 'demo', name: 'Zuhause' }, { uuid: 'demo2', name: 'Drogerie' }],
  changeItem(op, { name, spec = '' }) {
    const find = arr => arr.findIndex(i => i.name.toLowerCase() === name.toLowerCase());
    const pi = find(list.purchase), ri = find(list.recently);
    if (op === 'add') {
      if (ri >= 0) list.recently.splice(ri, 1);
      if (pi >= 0) list.purchase[pi].spec = spec;
      else list.purchase.push({ name, spec, uuid: 'n' + Date.now() });
    } else if (op === 'complete' && pi >= 0) {
      const [it] = list.purchase.splice(pi, 1);
      if (find(list.recently) < 0) list.recently.unshift({ ...it, spec: '' });
      list.recently = list.recently.slice(0, 12);
    } else if (op === 'remove') {
      if (pi >= 0) list.purchase.splice(pi, 1);
      if (ri >= 0) list.recently.splice(ri, 1);
    }
  },
};
