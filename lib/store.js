// Kleiner JSON-Dateispeicher für To-dos, Essensplan und Einstellungen.
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const FILE = path.join(DATA_DIR, 'db.json');

const defaults = () => ({
  rev: 1,
  todos: [],
  meals: {},
  settings: {
    familyName: 'Familie',
    calendars: [],          // [{ url, name, color }]
    bring: { email: '', password: '', listUuid: '' },
  },
});

let db = null;

export function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const d = defaults();
    db = { ...d, ...raw, settings: { ...d.settings, ...raw.settings, bring: { ...d.settings.bring, ...raw.settings?.bring } } };
  } catch {
    db = defaults();
    save();
  }
  return db;
}

function save() {
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, FILE);
}

export const get = () => db;

/** Änderung durchführen, Revision erhöhen und speichern. */
export function mutate(fn) {
  const r = fn(db);
  db.rev++;
  save();
  return r;
}
