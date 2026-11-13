// Schlanker iCalendar-Parser (RFC 5545) mit Expansion wiederkehrender Termine.
// Unterstützt: DTSTART/DTEND/DURATION, ganztägige Termine, TZID (über Intl),
// RRULE (DAILY/WEEKLY/MONTHLY/YEARLY, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY,
// BYMONTH, BYSETPOS, WKST), RDATE, EXDATE, RECURRENCE-ID-Ausnahmen, STATUS:CANCELLED.

export const DEFAULT_TZ = process.env.TZ_DEFAULT || 'Europe/Berlin';
const DAY = 86400000;
const WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

const WINDOWS_TZ = {
  'W. Europe Standard Time': 'Europe/Berlin',
  'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London',
  'UTC': 'UTC',
};

// ---------- Text & Zeilen ----------

export function unfold(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
}

export function unescapeText(v = '') {
  return v.replace(/\\([nN])/g, '\n').replace(/\\([,;\\])/g, '$1');
}

function splitOutsideQuotes(str, sep) {
  const out = [];
  let cur = '', q = false;
  for (const c of str) {
    if (c === '"') q = !q;
    if (c === sep && !q) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseLine(line) {
  let q = false, idx = -1;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ':' && !q) { idx = i; break; }
  }
  if (idx < 0) return null;
  const parts = splitOutsideQuotes(line.slice(0, idx), ';');
  const params = {};
  for (const p of parts.slice(1)) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: parts[0].toUpperCase(), params, value: line.slice(idx + 1) };
}

export function parseICS(text) {
  const cal = { name: null, color: null, tz: null, events: [] };
  const stack = [];
  let cur = null;
  for (const raw of unfold(text).split('\n')) {
    if (!raw.trim()) continue;
    const p = parseLine(raw);
    if (!p) continue;
    if (p.name === 'BEGIN') {
      const t = p.value.trim().toUpperCase();
      stack.push(t);
      if (t === 'VEVENT') cur = { props: {}, multi: { EXDATE: [], RDATE: [] } };
      continue;
    }
    if (p.name === 'END') {
      const t = stack.pop();
      if (t === 'VEVENT' && cur) { cal.events.push(cur); cur = null; }
      continue;
    }
    const top = stack[stack.length - 1];
    if (top === 'VCALENDAR') {
      if (p.name === 'X-WR-CALNAME') cal.name = unescapeText(p.value);
      else if (p.name === 'X-APPLE-CALENDAR-COLOR') cal.color = p.value.slice(0, 7);
      else if (p.name === 'X-WR-TIMEZONE') cal.tz = normalizeTz(p.value);
    } else if (top === 'VEVENT' && cur) {
      if (p.name === 'EXDATE' || p.name === 'RDATE') cur.multi[p.name].push(p);
      else cur.props[p.name] = p;
    }
  }
  return cal;
}

// ---------- Zeitzonen ----------

const tzValid = new Map();
export function normalizeTz(tz) {
  if (!tz) return null;
  tz = tz.trim();
  if (WINDOWS_TZ[tz]) return WINDOWS_TZ[tz];
  const m = /([A-Za-z]+\/[A-Za-z_+\-]+(?:\/[A-Za-z_+\-]+)?)$/.exec(tz);
  const cand = m ? m[1] : tz;
  if (!tzValid.has(cand)) {
    try { new Intl.DateTimeFormat('en-US', { timeZone: cand }); tzValid.set(cand, true); }
    catch { tzValid.set(cand, false); }
  }
  return tzValid.get(cand) ? cand : null;
}

const fmtCache = new Map();
function offsetAt(ms, tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  const p = {};
  for (const x of f.formatToParts(new Date(ms))) p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Wanduhrzeit in Zeitzone tz -> UTC-Millisekunden */
export function wallToMs(w, tz) {
  const guess = Date.UTC(w.y, w.m - 1, w.d, w.h || 0, w.mi || 0, w.s || 0);
  if (!tz || tz === 'UTC') return guess;
  const off = offsetAt(guess, tz);
  let t = guess - off;
  const off2 = offsetAt(t, tz);
  if (off2 !== off) t = guess - off2;
  return t;
}

// ---------- Tagesnummern ----------

export const dayNum = (y, m, d) => Math.floor(Date.UTC(y, m - 1, d) / DAY);
export function fromDayNum(n) {
  const dt = new Date(n * DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
const weekday = n => (((n + 4) % 7) + 7) % 7; // 0 = Sonntag
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const dnToYmd = n => {
  const { y, m, d } = fromDayNum(n);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
export function ymdToDn(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  return m ? dayNum(+m[1], +m[2], +m[3]) : null;
}

// ---------- Werte ----------

export function parseDateValue(value, params = {}, fallbackTz = DEFAULT_TZ) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(value).trim());
  if (!m) return null;
  const allDay = params.VALUE === 'DATE' || !m[4];
  const wall = { y: +m[1], m: +m[2], d: +m[3], h: +(m[4] || 0), mi: +(m[5] || 0), s: +(m[6] || 0) };
  const tz = m[7] ? 'UTC' : (normalizeTz(params.TZID) || fallbackTz);
  return { allDay, wall, tz };
}

export function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || '').trim());
  if (!m) return null;
  const sign = m[1] === '-' ? -1 : 1;
  const days = (+(m[2] || 0)) * 7 + (+(m[3] || 0));
  const ms = ((+(m[4] || 0)) * 3600 + (+(m[5] || 0)) * 60 + (+(m[6] || 0))) * 1000;
  return { days: sign * days, ms: sign * (days * DAY + ms) };
}

export function parseRRule(v) {
  const r = {};
  for (const part of String(v).split(';')) {
    const [k, val] = part.split('=');
    if (k && val !== undefined) r[k.toUpperCase()] = val;
  }
  const ints = s => s ? s.split(',').map(Number).filter(n => !Number.isNaN(n) && n !== 0) : null;
  return {
    freq: r.FREQ,
    interval: Math.max(1, parseInt(r.INTERVAL || '1', 10) || 1),
    count: r.COUNT ? parseInt(r.COUNT, 10) : null,
    until: r.UNTIL || null,
    byday: r.BYDAY ? r.BYDAY.split(',').map(s => {
      const mm = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(s.trim().toUpperCase());
      return mm ? { n: mm[1] ? parseInt(mm[1], 10) : 0, wd: WD[mm[2]] } : null;
    }).filter(Boolean) : null,
    bymonthday: ints(r.BYMONTHDAY),
    bymonth: ints(r.BYMONTH),
    bysetpos: ints(r.BYSETPOS),
    wkst: WD[(r.WKST || 'MO').toUpperCase()] ?? 1,
  };
}

// ---------- Wiederholungen ----------

function monthDays(y, m, rule, defaultDay) {
  const dim = daysInMonth(y, m);
  const first = dayNum(y, m, 1);
  let set = null;
  if (rule.bymonthday) {
    set = rule.bymonthday.map(d => (d > 0 ? d : dim + d + 1)).filter(d => d >= 1 && d <= dim);
  }
  if (rule.byday) {
    const ds = [];
    for (const b of rule.byday) {
      const all = [];
      for (let d = 1; d <= dim; d++) if (weekday(first + d - 1) === b.wd) all.push(d);
      if (b.n) {
        const pick = b.n > 0 ? all[b.n - 1] : all[all.length + b.n];
        if (pick) ds.push(pick);
      } else ds.push(...all);
    }
    set = set ? set.filter(d => ds.includes(d)) : ds;
  }
  if (!set) set = defaultDay <= dim ? [defaultDay] : [];
  return [...new Set(set)].sort((a, b) => a - b).map(d => first + d - 1);
}

function applySetPos(days, setpos) {
  if (!setpos || !days.length) return days;
  const out = [];
  for (const p of setpos) {
    const v = p > 0 ? days[p - 1] : days[days.length + p];
    if (v !== undefined) out.push(v);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/** Liefert pro Periode die (sortierten) Kandidaten-Tagesnummern. */
function* periods(rule, startDn) {
  const s = fromDayNum(startDn);
  const monthOk = dn => !rule.bymonth || rule.bymonth.includes(fromDayNum(dn).m);
  switch (rule.freq) {
    case 'DAILY':
      for (let dn = startDn; ; dn += rule.interval) {
        let ok = monthOk(dn);
        if (ok && rule.bymonthday) {
          const { y, m, d } = fromDayNum(dn), dim = daysInMonth(y, m);
          ok = rule.bymonthday.some(x => (x > 0 ? x : dim + x + 1) === d);
        }
        if (ok && rule.byday) ok = rule.byday.some(b => b.wd === weekday(dn));
        yield { from: dn, days: ok ? [dn] : [] };
      }
    case 'WEEKLY': {
      const ws = startDn - ((weekday(startDn) - rule.wkst + 7) % 7);
      const offsets = (rule.byday ? rule.byday.map(b => b.wd) : [weekday(startDn)])
        .map(wd => (wd - rule.wkst + 7) % 7);
      for (let w = ws; ; w += 7 * rule.interval) {
        const days = [...new Set(offsets)].map(o => w + o).sort((a, b) => a - b).filter(monthOk);
        yield { from: w, days: applySetPos(days, rule.bysetpos) };
      }
    }
    case 'MONTHLY':
      for (let idx = s.y * 12 + (s.m - 1); ; idx += rule.interval) {
        const y = Math.floor(idx / 12), m = (idx % 12) + 1;
        const days = (!rule.bymonth || rule.bymonth.includes(m)) ? monthDays(y, m, rule, s.d) : [];
        yield { from: dayNum(y, m, 1), days: applySetPos(days, rule.bysetpos) };
      }
    case 'YEARLY':
      for (let y = s.y; ; y += rule.interval) {
        const months = rule.bymonth || [s.m];
        let days = [];
        for (const m of months) {
          if (rule.byday || rule.bymonthday) days.push(...monthDays(y, m, rule, s.d));
          else if (s.d <= daysInMonth(y, m)) days.push(dayNum(y, m, s.d));
        }
        days.sort((a, b) => a - b);
        yield { from: dayNum(y, 1, 1), days: applySetPos(days, rule.bysetpos) };
      }
    default:
      yield { from: startDn, days: [startDn] };
  }
}

// ---------- Normalisierung & Expansion ----------

function text(P, k) { return P[k] ? unescapeText(P[k].value).trim() : ''; }

function normalizeEvent(ve, calTz) {
  const P = ve.props;
  if (!P.DTSTART) return null;
  const ds = parseDateValue(P.DTSTART.value, P.DTSTART.params, calTz);
  if (!ds) return null;
  const de = P.DTEND ? parseDateValue(P.DTEND.value, P.DTEND.params, ds.tz) : null;
  const dur = P.DURATION ? parseDuration(P.DURATION.value) : null;
  const ev = {
    uid: text(P, 'UID') || Math.random().toString(36).slice(2),
    title: text(P, 'SUMMARY') || '(Ohne Titel)',
    location: text(P, 'LOCATION'),
    description: text(P, 'DESCRIPTION'),
    url: text(P, 'URL'),
    status: (P.STATUS?.value || '').toUpperCase(),
    allDay: ds.allDay,
    tz: ds.tz,
    wall: ds.wall,
  };
  if (ds.allDay) {
    ev.startKey = dayNum(ds.wall.y, ds.wall.m, ds.wall.d);
    let endDn = de ? dayNum(de.wall.y, de.wall.m, de.wall.d) : ev.startKey + (dur ? Math.max(1, dur.days) : 1);
    if (endDn <= ev.startKey) endDn = ev.startKey + 1;
    ev.dur = endDn - ev.startKey;
  } else {
    ev.startKey = wallToMs(ds.wall, ds.tz);
    const end = de ? wallToMs(de.wall, de.tz) : ev.startKey + (dur ? dur.ms : 0);
    ev.dur = Math.max(0, end - ev.startKey);
  }
  if (P.RRULE) ev.rrule = parseRRule(P.RRULE.value);
  if (P['RECURRENCE-ID']) {
    const r = parseDateValue(P['RECURRENCE-ID'].value, P['RECURRENCE-ID'].params, ds.tz);
    if (r) ev.recurrenceKey = r.allDay ? dayNum(r.wall.y, r.wall.m, r.wall.d) : wallToMs(r.wall, r.tz);
  }
  const keysOf = list => {
    const out = [];
    for (const p of list) for (const v of p.value.split(',')) {
      const d = parseDateValue(v, p.params, ds.tz);
      if (d) out.push(ev.allDay ? dayNum(d.wall.y, d.wall.m, d.wall.d)
        : (d.allDay ? wallToMs({ ...d.wall, h: ds.wall.h, mi: ds.wall.mi, s: ds.wall.s }, ds.tz) : wallToMs(d.wall, d.tz)));
    }
    return out;
  };
  ev.exdates = new Set(keysOf(ve.multi.EXDATE));
  ev.rdates = keysOf(ve.multi.RDATE);
  return ev;
}

function keyOfDay(ev, dn) {
  if (ev.allDay) return dn;
  const { y, m, d } = fromDayNum(dn);
  return wallToMs({ y, m, d, h: ev.wall.h, mi: ev.wall.mi, s: ev.wall.s }, ev.tz);
}

/** Alle Vorkommen eines (Master-)Termins im Bereich [rs, re) in Schlüssel-Einheiten. */
function occurrences(ev, rs, re, skip) {
  const out = [];
  const push = k => {
    if (ev.exdates.has(k) || skip?.has(k)) return;
    if (k < re && k + Math.max(ev.dur, ev.allDay ? 1 : 1) > rs) out.push(k);
  };
  if (!ev.rrule || !ev.rrule.freq) {
    push(ev.startKey);
  } else {
    const r = ev.rrule;
    let untilKey = null;
    if (r.until) {
      const u = parseDateValue(r.until, {}, ev.tz);
      if (u) untilKey = ev.allDay ? dayNum(u.wall.y, u.wall.m, u.wall.d)
        : (u.allDay ? wallToMs({ ...u.wall, h: 23, mi: 59, s: 59 }, ev.tz) : wallToMs(u.wall, u.tz));
    }
    const startDn = dayNum(ev.wall.y, ev.wall.m, ev.wall.d);
    const reDn = ev.allDay ? re : Math.floor(re / DAY) + 2;
    let n = 0, guard = 0;
    outer:
    for (const per of periods(r, startDn)) {
      if (++guard > 200000 || per.from > reDn) break;
      for (const dn of per.days) {
        if (dn < startDn) continue;
        const k = keyOfDay(ev, dn);
        if (untilKey !== null && k > untilKey) break outer;
        n++;
        if (r.count && n > r.count) break outer;
        if (k >= re) break outer;
        push(k);
      }
    }
  }
  for (const k of ev.rdates) push(k);
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * Expandiert alle Termine eines geparsten Kalenders für den Bereich
 * [fromYmd, toYmd) (lokale Daten in tz). Liefert sortierte Termine.
 */
export function expandCalendar(cal, fromYmd, toYmd, tz = DEFAULT_TZ) {
  const fromDn = ymdToDn(fromYmd), toDn = ymdToDn(toYmd);
  const rsMs = wallToMs({ ...fromDayNum(fromDn), h: 0 }, tz);
  const reMs = wallToMs({ ...fromDayNum(toDn), h: 0 }, tz);
  const calTz = cal.tz || tz;

  const events = cal.events.map(e => normalizeEvent(e, calTz)).filter(Boolean);
  const overrides = new Map();
  for (const e of events) {
    if (e.recurrenceKey !== undefined) {
      if (!overrides.has(e.uid)) overrides.set(e.uid, new Set());
      overrides.get(e.uid).add(e.recurrenceKey);
    }
  }
  const out = [];
  for (const e of events) {
    if (e.status === 'CANCELLED') continue;
    const isOverride = e.recurrenceKey !== undefined;
    const keys = isOverride
      ? occurrences({ ...e, rrule: null, rdates: [] }, e.allDay ? fromDn : rsMs, e.allDay ? toDn : reMs)
      : occurrences(e, e.allDay ? fromDn : rsMs, e.allDay ? toDn : reMs, overrides.get(e.uid));
    for (const k of keys) {
      out.push({
        id: `${e.uid}#${k}`,
        title: e.title,
        location: e.location,
        description: e.description,
        url: e.url,
        allDay: e.allDay,
        start: e.allDay ? dnToYmd(k) : new Date(k).toISOString(),
        end: e.allDay ? dnToYmd(k + e.dur) : new Date(k + e.dur).toISOString(),
        _sort: e.allDay ? wallToMs({ ...fromDayNum(k), h: 0 }, tz) - 1 : k,
      });
    }
  }
  out.sort((a, b) => a._sort - b._sort || a.title.localeCompare(b.title));
  for (const e of out) delete e._sort;
  return out;
}
