// Family Dash – Server (ohne externe Abhängigkeiten)
// Liefert die PWA aus und stellt eine kleine API bereit:
//   /api/todos, /api/meals, /api/calendar, /api/bring, /api/settings, /api/rev
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as store from './lib/store.js';
import * as bring from './lib/bring.js';
import { parseICS, expandCalendar, ymdToDn, DEFAULT_TZ } from './lib/ics.js';
import { demoIcs, demoBring } from './lib/demo.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = +process.env.PORT || 8080;
const DEMO = process.env.DEMO === '1';
const ADMIN_PIN = process.env.ADMIN_PIN || '';
const CAL_TTL = 5 * 60 * 1000;
const PALETTE = ['#ff6b8b', '#5ac8fa', '#ffcc4d', '#6ee7b7', '#b18cff', '#ff9f5a'];

store.load();

// ---------- Hilfen ----------

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf || typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': isBuf ? 'application/octet-stream' : (typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(data);
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > 1e6) throw new HttpError(413, 'Anfrage zu groß');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Ungültiges JSON'); }
}

const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

function todayYmd() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function settings() {
  const s = store.get().settings;
  const env = {};
  if (process.env.ICS_URLS) {
    env.calendars = process.env.ICS_URLS.split(',').map(u => u.trim()).filter(Boolean).map(url => ({ url }));
  }
  const b = { ...s.bring };
  if (process.env.BRING_EMAIL) b.email = process.env.BRING_EMAIL;
  if (process.env.BRING_PASSWORD) b.password = process.env.BRING_PASSWORD;
  if (process.env.BRING_LIST_UUID) b.listUuid = process.env.BRING_LIST_UUID;
  return { ...s, calendars: env.calendars || s.calendars || [], bring: b, envCalendars: !!env.calendars, envBring: !!process.env.BRING_EMAIL };
}

function requirePin(req) {
  if (!ADMIN_PIN) return;
  const pin = req.headers['x-admin-pin'] || '';
  const ok = pin.length === ADMIN_PIN.length && crypto.timingSafeEqual(Buffer.from(pin), Buffer.from(ADMIN_PIN));
  if (!ok) throw new HttpError(403, 'Falsche PIN');
}

// ---------- Kalender ----------

const calCache = new Map(); // url -> { at, cal, error }

async function loadCalendar(url) {
  const hit = calCache.get(url);
  if (hit && Date.now() - hit.at < CAL_TTL) return hit;
  const httpsUrl = url.trim().replace(/^webcals?:\/\//i, 'https://');
  try {
    if (!/^https?:\/\//i.test(httpsUrl)) throw new Error('Ungültiger Link');
    const ctrl = AbortSignal.timeout(15000);
    const res = await fetch(httpsUrl, { signal: ctrl, headers: { 'User-Agent': 'FamilyDash/1.0', Accept: 'text/calendar,*/*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Kein gültiger Kalender');
    const entry = { at: Date.now(), cal: parseICS(text), error: null };
    calCache.set(url, entry);
    return entry;
  } catch (e) {
    const entry = { at: Date.now() - CAL_TTL + 30000, cal: hit?.cal || null, error: e.message }; // in 30 s erneut versuchen
    calCache.set(url, entry);
    return entry;
  }
}

async function calendarEvents(from, to) {
  if (!isYmd(from) || !isYmd(to)) throw new HttpError(400, 'from/to im Format JJJJ-MM-TT angeben');
  const span = ymdToDn(to) - ymdToDn(from);
  if (span <= 0 || span > 400) throw new HttpError(400, 'Zeitraum ungültig');

  let sources = settings().calendars;
  if (DEMO && !sources.length) sources = [{ url: 'demo', name: 'Familie (Demo)' }];
  const calendars = [], events = [], errors = [];
  await Promise.all(sources.map(async (src, i) => {
    const entry = src.url === 'demo' ? { cal: parseICS(demoIcs()), error: null } : await loadCalendar(src.url);
    const name = src.name || entry.cal?.name || `Kalender ${i + 1}`;
    const color = src.color || entry.cal?.color || PALETTE[i % PALETTE.length];
    calendars[i] = { id: i, name, color, error: entry.error };
    if (entry.error) errors.push(`${name}: ${entry.error}`);
    if (entry.cal) for (const e of expandCalendar(entry.cal, from, to)) events.push({ ...e, calendar: i, color });
  }));
  events.sort((a, b) => (a.allDay === b.allDay ? 0 : a.allDay ? -1 : 1) || a.start.localeCompare(b.start));
  return { configured: sources.length > 0, calendars, events, errors };
}

// ---------- Bring! ----------

function bringCreds() {
  const b = settings().bring;
  return { email: b.email, password: b.password, listUuid: b.listUuid };
}
const bringConfigured = () => DEMO || !!(bringCreds().email && bringCreds().password);

async function bringList() {
  const c = bringCreds();
  if (!c.email && DEMO) return demoBring.getList();
  return bring.getList(c, c.listUuid);
}

// ---------- API ----------

async function api(req, res, url) {
  const p = url.pathname.replace(/^\/api/, '');
  const m = req.method;
  const db = store.get();

  if (p === '/rev' && m === 'GET') return send(res, 200, { rev: db.rev, today: todayYmd() });

  if (p === '/health') return send(res, 200, { ok: true, demo: DEMO });

  // To-dos
  if (p === '/todos') {
    if (m === 'GET') return send(res, 200, { todos: db.todos, rev: db.rev });
    if (m === 'POST') {
      const b = await readBody(req);
      const textVal = str(b.text, 300);
      if (!textVal) throw new HttpError(400, 'Text fehlt');
      const todo = { id: crypto.randomUUID(), text: textVal, done: false, createdAt: Date.now(), doneAt: null };
      store.mutate(d => d.todos.unshift(todo));
      return send(res, 201, todo);
    }
  }
  if (p === '/todos/clear-done' && m === 'POST') {
    store.mutate(d => { d.todos = d.todos.filter(t => !t.done); });
    return send(res, 200, { todos: store.get().todos });
  }
  let mm = /^\/todos\/([\w-]+)$/.exec(p);
  if (mm) {
    const t = db.todos.find(x => x.id === mm[1]);
    if (!t) throw new HttpError(404, 'To-do nicht gefunden');
    if (m === 'PATCH') {
      const b = await readBody(req);
      store.mutate(() => {
        if (typeof b.done === 'boolean') { t.done = b.done; t.doneAt = b.done ? Date.now() : null; }
        if (b.text !== undefined && str(b.text, 300)) t.text = str(b.text, 300);
      });
      return send(res, 200, t);
    }
    if (m === 'DELETE') {
      store.mutate(d => { d.todos = d.todos.filter(x => x.id !== t.id); });
      return send(res, 200, { ok: true });
    }
  }

  // Essensplan
  if (p === '/meals' && m === 'GET') {
    const from = url.searchParams.get('from'), to = url.searchParams.get('to');
    const out = {};
    for (const [k, v] of Object.entries(db.meals)) if ((!from || k >= from) && (!to || k <= to)) out[k] = v;
    const suggestions = [...new Set(Object.values(db.meals).flatMap(v => [v.lunch, v.dinner]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));
    return send(res, 200, { meals: out, suggestions });
  }
  mm = /^\/meals\/(\d{4}-\d{2}-\d{2})$/.exec(p);
  if (mm && m === 'PUT') {
    const b = await readBody(req);
    store.mutate(d => {
      const cur = d.meals[mm[1]] || {};
      for (const k of ['lunch', 'dinner', 'note']) if (b[k] !== undefined) cur[k] = str(b[k], 200);
      if (!cur.lunch && !cur.dinner && !cur.note) delete d.meals[mm[1]];
      else d.meals[mm[1]] = cur;
    });
    return send(res, 200, { date: mm[1], meal: store.get().meals[mm[1]] || {} });
  }

  // Kalender
  if (p === '/calendar' && m === 'GET') {
    return send(res, 200, await calendarEvents(url.searchParams.get('from'), url.searchParams.get('to')));
  }

  // Bring!
  if (p === '/bring' && m === 'GET') {
    if (!bringConfigured()) return send(res, 200, { configured: false, purchase: [], recently: [] });
    const list = await bringList();
    return send(res, 200, { configured: true, ...list });
  }
  if (p === '/bring/lists' && m === 'GET') {
    if (DEMO && !bringCreds().email) return send(res, 200, { lists: demoBring.getLists() });
    return send(res, 200, { lists: await bring.getLists(bringCreds()) });
  }
  mm = /^\/bring\/(add|complete|remove)$/.exec(p);
  if (mm && m === 'POST') {
    const b = await readBody(req);
    const items = (Array.isArray(b.items) ? b.items : [b])
      .map(i => ({ name: str(i.name, 100), spec: str(i.spec, 100), uuid: i.uuid ? str(i.uuid, 64) : null }))
      .filter(i => i.name);
    if (!items.length) throw new HttpError(400, 'Artikel fehlt');
    const c = bringCreds();
    for (const it of items) {
      if (!c.email && DEMO) demoBring.changeItem(mm[1], it);
      else await bring.changeItem(c, c.listUuid, mm[1], it);
    }
    return send(res, 200, { configured: true, ...(await bringList()) });
  }

  // Einstellungen
  if (p === '/settings') {
    if (m === 'GET') {
      const s = settings();
      return send(res, 200, {
        familyName: s.familyName,
        calendars: s.calendars.map(c => ({ url: c.url, name: c.name || '', color: c.color || '' })),
        envCalendars: s.envCalendars,
        bring: { email: s.bring.email || '', hasPassword: !!s.bring.password, listUuid: s.bring.listUuid || '' },
        envBring: s.envBring,
        pinRequired: !!ADMIN_PIN,
        demo: DEMO,
      });
    }
    if (m === 'PUT') {
      requirePin(req);
      const b = await readBody(req);
      store.mutate(d => {
        if (b.familyName !== undefined) d.settings.familyName = str(b.familyName, 60) || 'Familie';
        if (Array.isArray(b.calendars)) {
          d.settings.calendars = b.calendars
            .map(c => ({ url: str(c.url, 1000), name: str(c.name, 60), color: /^#[0-9a-f]{6}$/i.test(c.color || '') ? c.color : '' }))
            .filter(c => /^(webcals?|https?):\/\//i.test(c.url));
          calCache.clear();
        }
        if (b.bring) {
          const nb = d.settings.bring;
          if (b.bring.email !== undefined) nb.email = str(b.bring.email, 200);
          if (b.bring.password) nb.password = String(b.bring.password).slice(0, 200);
          if (b.bring.clearPassword) nb.password = '';
          if (b.bring.listUuid !== undefined) nb.listUuid = str(b.bring.listUuid, 64);
          bring.resetSession();
        }
      });
      return send(res, 200, { ok: true });
    }
  }
  if (p === '/settings/test-calendar' && m === 'POST') {
    const b = await readBody(req);
    calCache.delete(b.url);
    const entry = await loadCalendar(str(b.url, 1000));
    if (entry.error) throw new HttpError(400, `Kalender konnte nicht geladen werden: ${entry.error}`);
    return send(res, 200, { name: entry.cal.name, events: entry.cal.events.length });
  }
  if (p === '/settings/test-bring' && m === 'POST') {
    requirePin(req);
    const b = await readBody(req);
    const cur = bringCreds();
    const creds = { email: str(b.email, 200) || cur.email, password: b.password || cur.password };
    const info = await bring.testLogin(creds);
    const lists = await bring.getLists(creds);
    return send(res, 200, { ...info, lists });
  }

  throw new HttpError(404, 'Unbekannter Endpunkt');
}

// ---------- Statische Dateien ----------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain',
};

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'Verboten');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      // SPA-Fallback
      if (!path.extname(rel)) return serveStatic(req, res, new URL('/', url));
      return send(res, 404, 'Nicht gefunden');
    }
    const ext = path.extname(file);
    const noCache = ext === '.html' || rel === '/sw.js' || ext === '.webmanifest';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Methode nicht erlaubt');
    serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error(e);
    send(res, status, { error: e.message || 'Serverfehler' });
  }
});

server.listen(PORT, () => {
  console.log(`Family Dash läuft auf http://localhost:${PORT}${DEMO ? '  (Demo-Modus)' : ''}`);
});
