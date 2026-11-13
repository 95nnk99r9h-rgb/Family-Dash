// Anbindung an die (inoffizielle) Bring!-REST-API – dieselbe API, die die Bring!-Web-App nutzt.
// Zugangsdaten bleiben ausschließlich auf dem Server.

const API = process.env.BRING_API_BASE || 'https://api.getbring.com/rest/v2/';
const API_KEY = 'cof4Nc6D8saplXjE3h3HXqHH8m7VU2i1Gs0g85Sp'; // öffentlicher Schlüssel der Bring!-Web-App

export class BringError extends Error {
  constructor(msg, status = 502) { super(msg); this.status = status; }
}

let session = null; // { email, uuid, publicUuid, token, expiresAt, defaultList }

function headers(extra = {}) {
  const h = {
    'X-BRING-API-KEY': API_KEY,
    'X-BRING-CLIENT': 'webApp',
    'X-BRING-CLIENT-SOURCE': 'webApp',
    'X-BRING-APPLICATION': 'bring',
    'X-BRING-COUNTRY': 'DE',
    ...extra,
  };
  if (session) {
    h.Authorization = `Bearer ${session.token}`;
    h['X-BRING-USER-UUID'] = session.uuid;
    if (session.publicUuid) h['X-BRING-PUBLIC-USER-UUID'] = session.publicUuid;
  }
  return h;
}

async function login({ email, password }) {
  session = null;
  let res;
  try {
    res = await fetch(API + 'bringauth', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/x-www-form-urlencoded' }),
      body: new URLSearchParams({ email, password }),
    });
  } catch (e) {
    throw new BringError('Bring! ist gerade nicht erreichbar.');
  }
  if (res.status === 401 || res.status === 404) throw new BringError('Bring!-Login fehlgeschlagen: E-Mail oder Passwort falsch.', 401);
  if (!res.ok) throw new BringError(`Bring!-Login fehlgeschlagen (${res.status}).`);
  const j = await res.json();
  session = {
    email,
    uuid: j.uuid,
    publicUuid: j.publicUuid,
    token: j.access_token,
    expiresAt: Date.now() + ((j.expires_in || 3600) - 60) * 1000,
    defaultList: j.bringListUUID,
    name: j.name,
  };
  return session;
}

async function ensure(creds) {
  if (!creds?.email || !creds?.password) throw new BringError('Bring! ist noch nicht verbunden.', 412);
  if (!session || session.email !== creds.email || Date.now() > session.expiresAt) await login(creds);
  return session;
}

async function call(creds, method, path, { form, json } = {}, retry = true) {
  await ensure(creds);
  const opt = { method, headers: headers() };
  if (form) { opt.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; opt.body = new URLSearchParams(form); }
  if (json) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(json); }
  let res;
  try { res = await fetch(API + path, opt); }
  catch { throw new BringError('Bring! ist gerade nicht erreichbar.'); }
  if (res.status === 401 && retry) { session = null; return call(creds, method, path, { form, json }, false); }
  if (!res.ok) { const err = new BringError(`Bring!-Fehler (${res.status}).`); err.httpStatus = res.status; throw err; }
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

export function resetSession() { session = null; }

export async function testLogin(creds) {
  const s = await login(creds);
  return { name: s.name, defaultList: s.defaultList };
}

export async function getLists(creds) {
  const s = await ensure(creds);
  const j = await call(creds, 'GET', `bringusers/${s.uuid}/lists`);
  return (j?.lists || []).map(l => ({ uuid: l.listUuid, name: l.name, theme: l.theme }));
}

function normItems(arr) {
  return (arr || []).map(i => ({
    name: i.itemId ?? i.name ?? '',
    spec: i.specification ?? '',
    uuid: i.uuid || null,
  })).filter(i => i.name);
}

export async function resolveList(creds, listUuid) {
  const s = await ensure(creds);
  return listUuid || s.defaultList;
}

export async function getList(creds, listUuid) {
  const id = await resolveList(creds, listUuid);
  const j = await call(creds, 'GET', `bringlists/${id}`);
  const src = j?.items || j || {};
  return { uuid: id, purchase: normItems(src.purchase), recently: normItems(src.recently) };
}

const OPS = { add: 'TO_PURCHASE', complete: 'TO_RECENTLY', remove: 'REMOVE' };

/** op: 'add' | 'complete' | 'remove' */
export async function changeItem(creds, listUuid, op, { name, spec = '', uuid = null }) {
  if (!OPS[op]) throw new BringError('Unbekannte Aktion', 400);
  const id = await resolveList(creds, listUuid);
  const change = {
    accuracy: '0.0', altitude: '0.0', latitude: '0.0', longitude: '0.0',
    itemId: name, spec, operation: OPS[op],
  };
  if (uuid) change.uuid = uuid;
  try {
    await call(creds, 'PUT', `bringlists/${id}/items`, { json: { changes: [change], sender: '' } });
  } catch (e) {
    if (e.httpStatus !== 404 && e.httpStatus !== 405) throw e;
    // Fallback auf den älteren Endpunkt
    const form = { uuid: id };
    if (op === 'add') { form.purchase = name; form.specification = spec; }
    if (op === 'complete') form.recently = name;
    if (op === 'remove') form.remove = name;
    await call(creds, 'PUT', `bringlists/${id}`, { form });
  }
}
