// Kleine Helfer: Datum, Formatierung, HTML-Escaping, UI-Bausteine.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const startOfWeek = d => { const x = startOfDay(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); };
export const sameDay = (a, b) => ymd(a) === ymd(b);

const F = (o) => new Intl.DateTimeFormat('de-DE', o);
const fTime = F({ hour: '2-digit', minute: '2-digit' });
const fLong = F({ weekday: 'long', day: 'numeric', month: 'long' });
const fWeekday = F({ weekday: 'long' });
const fWdShort = F({ weekday: 'short' });
const fDayMonth = F({ day: 'numeric', month: 'short' });
const fMonthYear = F({ month: 'long', year: 'numeric' });

export const fmt = {
  time: d => fTime.format(d),
  long: d => fLong.format(d),
  weekday: d => fWeekday.format(d),
  wdShort: d => fWdShort.format(d).replace('.', ''),
  dayMonth: d => fDayMonth.format(d),
  monthYear: d => fMonthYear.format(d),
};

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 5) return 'Gute Nacht';
  if (h < 11) return 'Guten Morgen';
  if (h < 14) return 'Mahlzeit';
  if (h < 18) return 'Guten Tag';
  if (h < 22) return 'Guten Abend';
  return 'Gute Nacht';
}

export function relDayLabel(d) {
  const t = startOfDay(new Date());
  const diff = Math.round((startOfDay(d) - t) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff === 2) return 'Übermorgen';
  return fmt.weekday(d);
}

/** Termin-Hilfen: liefern Date-Objekte bzw. prüfen Überschneidung mit Tag */
export function eventBounds(ev) {
  if (ev.allDay) return { s: parseYmd(ev.start), e: parseYmd(ev.end) };
  return { s: new Date(ev.start), e: new Date(ev.end) };
}
export function eventOnDay(ev, day) {
  const ds = startOfDay(day), de = addDays(ds, 1);
  const { s, e } = eventBounds(ev);
  if (ev.allDay) return s < de && e > ds;
  return s < de && (e > ds || +s === +e && s >= ds);
}
export function eventTimeLabel(ev, day) {
  if (ev.allDay) return 'Ganztägig';
  const { s, e } = eventBounds(ev);
  const ds = startOfDay(day), de = addDays(ds, 1);
  const from = s < ds ? '…' : fmt.time(s);
  const to = e > de ? '…' : fmt.time(e);
  return +s === +e ? from : `${from} – ${to}`;
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const lsGet = (k, fb = null) => { try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch { return fb; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* voll/blockiert */ } };
