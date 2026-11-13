import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Nachgebauter Bring!-Server
const calls = [];
const srv = http.createServer(async (req, res) => {
  let body = ''; for await (const c of req) body += c;
  calls.push({ method: req.method, url: req.url, body, auth: req.headers.authorization, key: req.headers['x-bring-api-key'] });
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/bringauth') {
    const p = new URLSearchParams(body);
    if (p.get('password') !== 'pw') { res.statusCode = 401; return res.end('{}'); }
    return res.end(JSON.stringify({ uuid: 'u1', publicUuid: 'p1', access_token: 'tok', expires_in: 3600, bringListUUID: 'L1', name: 'Familie' }));
  }
  if (req.headers.authorization !== 'Bearer tok') { res.statusCode = 401; return res.end('{}'); }
  if (req.url === '/bringusers/u1/lists') return res.end(JSON.stringify({ lists: [{ listUuid: 'L1', name: 'Zuhause' }] }));
  if (req.url === '/bringlists/L1' && req.method === 'GET') return res.end(JSON.stringify({ uuid: 'L1', purchase: [{ name: 'Milch', specification: '2 L' }], recently: [{ name: 'Brot', specification: '' }] }));
  if (req.url === '/bringlists/L1/items' && req.method === 'PUT') { res.statusCode = 204; return res.end(); }
  res.statusCode = 404; res.end('{}');
});
await new Promise(r => srv.listen(0, r));
process.env.BRING_API_BASE = `http://localhost:${srv.address().port}/`;
const bring = await import('../lib/bring.js');
const creds = { email: 'a@b.de', password: 'pw' };

test('Login, Listen, Artikel', async () => {
  const lists = await bring.getLists(creds);
  assert.deepEqual(lists.map(l => l.name), ['Zuhause']);
  const list = await bring.getList(creds);
  assert.deepEqual(list.purchase, [{ name: 'Milch', spec: '2 L', uuid: null }]);
  assert.equal(list.recently[0].name, 'Brot');
  await bring.changeItem(creds, null, 'complete', { name: 'Milch' });
  const put = calls.find(c => c.method === 'PUT');
  const j = JSON.parse(put.body);
  assert.equal(j.changes[0].operation, 'TO_RECENTLY');
  assert.equal(j.changes[0].itemId, 'Milch');
  assert.ok(calls.every(c => c.key));
});

test('Falsches Passwort ergibt verständlichen Fehler', async () => {
  bring.resetSession();
  await assert.rejects(bring.testLogin({ email: 'a@b.de', password: 'x' }), /E-Mail oder Passwort falsch/);
  srv.close();
});
