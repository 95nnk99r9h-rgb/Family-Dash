// API-Zugriff mit Offline-Cache (letzte Antwort wird in localStorage gehalten).
import { lsGet, lsSet } from './util.js';

export class ApiError extends Error {
  constructor(msg, status) { super(msg); this.status = status; }
}

export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const pin = sessionStorage.getItem('fd-pin');
  const opt = { method, headers: { ...headers } };
  if (pin) opt.headers['X-Admin-Pin'] = pin;
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, opt); }
  catch { throw new ApiError('Keine Verbindung zum Server', 0); }
  let data = null;
  try { data = await res.json(); } catch { /* leer */ }
  if (!res.ok) throw new ApiError(data?.error || `Fehler ${res.status}`, res.status);
  return data;
}

/** GET mit Fallback auf zuletzt bekannte Daten (für Offline-Betrieb). */
export async function cachedGet(path) {
  const key = 'fd-cache:' + path;
  try {
    const data = await api(path);
    lsSet(key, data);
    return data;
  } catch (e) {
    const old = lsGet(key);
    if (old && e.status === 0) return { ...old, _offline: true };
    throw e;
  }
}
