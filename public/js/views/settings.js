// Einstellungen: Familienname, Apple-Kalender, Bring!, Hintergrund, Installation.
import { icon } from '../icons.js';
import { api } from '../api.js';
import { esc, lsSet } from '../util.js';
import { pageHead, busy } from '../ui.js';
import { bgSettings, applyBackground, setCustomImage, PALETTE_NAMES, previewUrl } from '../bg.js';

const COLORS = ['#ff6b8b', '#5ac8fa', '#ffcc4d', '#6ee7b7', '#b18cff', '#ff9f5a'];

export default {
  async mount(root, ctx) {
    let s;
    try { s = await api('/settings'); }
    catch (e) { root.innerHTML = `<div class="card glass"><div class="err">${icon('info')}<span>${esc(e.message)}</span></div></div>`; return; }
    let calendars = s.calendars.map(c => ({ ...c }));

    root.innerHTML = `
      ${pageHead({ title: 'Einstellungen', sub: s.demo ? 'Demo-Modus aktiv – Beispieldaten werden angezeigt' : 'Verbindungen & Aussehen', icon: 'settings', tone: 't-settings' })}
      <div class="settings">
        <div class="stack" style="gap:18px">
          ${s.pinRequired ? `<section class="card glass"><h2><span class="chip t-settings">${icon('lock')}</span>Admin-PIN</h2>
            <p class="hint">Zum Ändern der Einstellungen ist eine PIN nötig.</p>
            <div class="row" style="margin-top:10px"><input class="field grow" type="password" inputmode="numeric" data-pin placeholder="PIN" value="${esc(sessionStorage.getItem('fd-pin') || '')}"></div></section>` : ''}

          <section class="card glass" data-hero>
            <h2><span class="chip t-cal">${icon('calendar')}</span>Apple-Kalender</h2>
            <p class="hint">Die Termine werden aus eurem iCloud-Kalender gelesen. Neue Termine tragt ihr wie gewohnt im iPhone-Kalender ein.</p>
            <div data-cals></div>
            ${s.envCalendars ? `<p class="hint">${icon('info', 'inline')} Kalender sind per Server-Variable <b>ICS_URLS</b> festgelegt.</p>` : `
            <label class="lbl" for="cal-url">Kalender-Link hinzufügen</label>
            <input class="field" id="cal-url" placeholder="webcal://p00-caldav.icloud.com/published/2/…" autocomplete="off" autocapitalize="off" spellcheck="false">
            <div class="row" style="margin-top:10px"><input class="field grow" id="cal-name" placeholder="Name (optional), z. B. Familie">
              <button class="btn primary t-cal" data-cal-add>${icon('plus')}<span>Hinzufügen</span></button></div>
            <details style="margin-top:14px"><summary class="hint" style="cursor:pointer"><b>So bekommt ihr den Link vom iPhone</b></summary>
              <ol class="steps">
                <li>Kalender-App öffnen → unten auf <b>Kalender</b> tippen.</li>
                <li>Beim gewünschten Kalender auf <b>ⓘ</b> tippen.</li>
                <li><b>Öffentlicher Kalender</b> einschalten.</li>
                <li><b>Link teilen …</b> → <b>Kopieren</b> und hier einfügen.</li>
              </ol>
              <p class="hint">Tipp: Für jeden Kalender (z. B. Familie, Schule, Arbeit) einen eigenen Link hinzufügen. Änderungen erscheinen nach ein paar Minuten.</p>
            </details>`}
          </section>

          <section class="card glass">
            <h2><span class="chip t-shop">${icon('cart')}</span>Bring! Einkaufsliste <span class="grow"></span><span class="status" data-bring-status><i></i>…</span></h2>
            ${s.envBring ? `<p class="hint">${icon('info', 'inline')} Zugangsdaten sind per Server-Variablen festgelegt.</p>` : `
            <p class="hint">Mit eurem Bring!-Konto anmelden. Das Passwort bleibt auf eurem Server und wird nie im Browser angezeigt.</p>
            <label class="lbl" for="b-mail">E-Mail</label>
            <input class="field" id="b-mail" type="email" autocomplete="username" value="${esc(s.bring.email)}" placeholder="familie@example.de">
            <label class="lbl" for="b-pass">Passwort</label>
            <input class="field" id="b-pass" type="password" autocomplete="current-password" placeholder="${s.bring.hasPassword ? '•••••••• (gespeichert)' : 'Bring!-Passwort'}">
            <p class="hint">Mit Apple/Google bei Bring! angemeldet? Dann in der Bring!-App unter <b>Profil → Konto</b> ein Passwort festlegen.</p>`}
            <label class="lbl" for="b-list">Liste</label>
            <div class="row"><select class="field grow" id="b-list"><option value="">Standardliste</option></select>
              ${s.envBring ? '' : `<button class="btn primary t-shop" data-bring-connect>${icon('link')}<span>Verbinden</span></button>`}</div>
          </section>
        </div>

        <div class="stack" style="gap:18px">
          <section class="card glass">
            <h2><span class="chip t-home">${icon('home')}</span>Familie</h2>
            <label class="lbl" for="fam">Name für die Begrüßung</label>
            <div class="row"><input class="field grow" id="fam" value="${esc(s.familyName)}" maxlength="60" placeholder="Familie">
              <button class="btn" data-fam-save>${icon('check')}<span>Speichern</span></button></div>
          </section>

          <section class="card glass">
            <h2><span class="chip t-weather">${icon('image')}</span>Hintergrund</h2>
            <p class="hint">„Automatisch“ wechselt mit der Tageszeit. Eigene Fotos werden nur auf diesem Gerät gespeichert.</p>
            <div class="bg-choices" data-bgs></div>
            <input type="file" accept="image/*" data-file hidden>
            <label class="lbl" for="blur">Unschärfe</label>
            <input type="range" class="range-input" id="blur" min="0" max="48" step="1" value="${bgSettings.blur}">
          </section>

          <section class="card glass">
            <h2><span class="chip t-todo">${icon('share')}</span>Als App installieren</h2>
            <ol class="steps">
              <li>Diese Seite in <b>Safari</b> auf iPhone oder iPad öffnen.</li>
              <li>Auf <b>Teilen</b> ${icon('share', 'inline')} tippen.</li>
              <li><b>Zum Home-Bildschirm</b> wählen → <b>Hinzufügen</b>.</li>
            </ol>
            <p class="hint">Family Dash startet dann im Vollbild wie eine echte App – ideal auch als Wand-Display auf dem iPad.</p>
          </section>
        </div>
      </div>`;
    root.querySelectorAll('.ic.inline').forEach(i => Object.assign(i.style, { width: '15px', height: '15px', verticalAlign: '-3px' }));
    const $ = q => root.querySelector(q);

    $('[data-pin]')?.addEventListener('input', e => sessionStorage.setItem('fd-pin', e.target.value));

    // ---- Kalender ----
    function renderCals() {
      $('[data-cals]').innerHTML = calendars.map((c, i) => `
        <div class="cal-src" data-i="${i}">
          <input type="color" value="${esc(c.color || COLORS[i % COLORS.length])}" aria-label="Farbe" ${s.envCalendars ? 'disabled' : ''}>
          <div style="min-width:0"><input class="field" style="height:36px" value="${esc(c.name)}" placeholder="Kalender ${i + 1}" data-name aria-label="Name" ${s.envCalendars ? 'disabled' : ''}>
            <div class="u" title="${esc(c.url)}">${esc(c.url)}</div></div>
          ${s.envCalendars ? '' : `<button class="btn icon-btn sm ghost" data-del aria-label="Entfernen">${icon('trash')}</button>`}
        </div>`).join('') || '<div class="empty">' + icon('link') + '<span>Noch kein Kalender verbunden.</span></div>';
    }
    async function saveCals(msg) {
      try { await api('/settings', { method: 'PUT', body: { calendars } }); if (msg) ctx.toast(msg); }
      catch (e) { ctx.toast(e.message, { error: true }); }
    }
    renderCals();
    $('[data-cals]').addEventListener('change', e => {
      const row = e.target.closest('.cal-src'); if (!row) return;
      const c = calendars[+row.dataset.i];
      if (e.target.type === 'color') c.color = e.target.value;
      if (e.target.matches('[data-name]')) c.name = e.target.value.trim();
      saveCals('Gespeichert');
    });
    $('[data-cals]').addEventListener('click', e => {
      const b = e.target.closest('[data-del]'); if (!b) return;
      calendars.splice(+b.closest('.cal-src').dataset.i, 1);
      renderCals(); saveCals('Kalender entfernt');
    });
    $('[data-cal-add]')?.addEventListener('click', async e => {
      const url = $('#cal-url').value.trim(), name = $('#cal-name').value.trim();
      if (!/^(webcals?|https?):\/\//i.test(url)) { ctx.toast('Bitte einen webcal://- oder https://-Link einfügen', { error: true }); return; }
      busy(e.currentTarget, true);
      try {
        const r = await api('/settings/test-calendar', { method: 'POST', body: { url } });
        calendars.push({ url, name: name || r.name || '', color: COLORS[calendars.length % COLORS.length] });
        await saveCals(`„${name || r.name || 'Kalender'}“ verbunden – ${r.events} Einträge`);
        $('#cal-url').value = ''; $('#cal-name').value = '';
        renderCals();
      } catch (err) { ctx.toast(err.message, { error: true, ms: 5000 }); }
      busy(e.currentTarget, false);
    });

    // ---- Bring! ----
    const status = (ok, text) => { const el = $('[data-bring-status]'); el.className = `status ${ok === true ? 'ok' : ok === false ? 'bad' : ''}`; el.innerHTML = `<i></i>${esc(text)}`; };
    function fillLists(lists, sel) {
      $('#b-list').innerHTML = '<option value="">Standardliste</option>' + lists.map(l => `<option value="${esc(l.uuid)}" ${l.uuid === sel ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
    }
    async function bringStatus() {
      if (!s.bring.email && !s.envBring && !s.demo) { status(null, 'Nicht verbunden'); return; }
      try { const { lists } = await api('/bring/lists'); fillLists(lists, s.bring.listUuid); status(true, 'Verbunden'); }
      catch (e) { status(false, e.status === 412 ? 'Nicht verbunden' : 'Fehler'); }
    }
    bringStatus();
    $('[data-bring-connect]')?.addEventListener('click', async e => {
      const email = $('#b-mail').value.trim(), password = $('#b-pass').value;
      if (!email) { ctx.toast('Bitte E-Mail eintragen', { error: true }); return; }
      busy(e.currentTarget, true);
      try {
        const r = await api('/settings/test-bring', { method: 'POST', body: { email, password } });
        await api('/settings', { method: 'PUT', body: { bring: { email, ...(password ? { password } : {}) } } });
        s.bring.email = email;
        fillLists(r.lists, s.bring.listUuid);
        $('#b-pass').value = ''; $('#b-pass').placeholder = '•••••••• (gespeichert)';
        status(true, 'Verbunden');
        ctx.toast(`Bring! verbunden${r.name ? ' – hallo ' + r.name : ''}`);
      } catch (err) { status(false, 'Fehler'); ctx.toast(err.message, { error: true, ms: 5000 }); }
      busy(e.currentTarget, false);
    });
    $('#b-list').addEventListener('change', async e => {
      try { await api('/settings', { method: 'PUT', body: { bring: { listUuid: e.target.value } } }); ctx.toast('Liste gespeichert'); }
      catch (err) { ctx.toast(err.message, { error: true }); }
    });

    // ---- Familie ----
    $('[data-fam-save]').addEventListener('click', async () => {
      const familyName = $('#fam').value.trim() || 'Familie';
      try { await api('/settings', { method: 'PUT', body: { familyName } }); lsSet('fd-family', familyName); ctx.toast('Gespeichert'); }
      catch (e) { ctx.toast(e.message, { error: true }); }
    });

    // ---- Hintergrund ----
    function renderBgs() {
      const mode = bgSettings.mode;
      $('[data-bgs]').innerHTML = Object.entries(PALETTE_NAMES).map(([k, label]) => {
        const style = ['dawn', 'day', 'dusk', 'night'].includes(k) ? `background-image:url('${previewUrl(k)}')`
          : k === 'custom' && bgSettings.custom ? `background-image:url('${bgSettings.custom}')` : '';
        return `<button class="bg-choice ${k} ${mode === k ? 'on' : ''}" data-bg="${k}" style="${style}" aria-pressed="${mode === k}">
          ${k === 'custom' && !bgSettings.custom ? icon('plus') : ''}<span>${label}</span></button>`;
      }).join('');
    }
    renderBgs();
    $('[data-bgs]').addEventListener('click', e => {
      const b = e.target.closest('[data-bg]'); if (!b) return;
      if (b.dataset.bg === 'custom') { $('[data-file]').click(); return; }
      bgSettings.mode = b.dataset.bg; applyBackground(); renderBgs();
    });
    $('[data-file]').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { await setCustomImage(f); renderBgs(); ctx.toast('Hintergrund gesetzt'); }
      catch { ctx.toast('Bild konnte nicht geladen werden', { error: true }); }
    });
    $('#blur').addEventListener('input', e => { bgSettings.blur = +e.target.value; applyBackground(); });
  },
};
