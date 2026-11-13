// Einkaufsliste – live mit der Bring!-App synchronisiert.
import { icon } from '../icons.js';
import { api, cachedGet } from '../api.js';
import { esc } from '../util.js';
import { pageHead, itemEmoji, busy } from '../ui.js';
import { errorBox } from './shared.js';

export default {
  async mount(root, ctx) {
    root.innerHTML = `
      ${pageHead({
        title: 'Einkaufsliste', sub: '<span data-sub>Bring! wird geladen …</span>', icon: 'cart', tone: 't-shop',
        actions: `<button class="btn icon-btn glass shine" data-refresh aria-label="Aktualisieren">${icon('refresh')}</button>
          <a class="btn glass shine" href="https://web.getbring.com/" target="_blank" rel="noopener">${icon('external')}<span>Bring! öffnen</span></a>`,
      })}
      <section class="card glass" data-hero>
        <form class="row" data-add>
          <input class="field grow" name="name" placeholder="Artikel, z. B. Milch" autocomplete="off" enterkeyhint="next" aria-label="Artikel" maxlength="100">
          <input class="field" name="spec" placeholder="Menge / Info" autocomplete="off" enterkeyhint="done" aria-label="Menge oder Info" style="max-width:180px" maxlength="100">
          <button class="btn icon-btn primary t-shop" aria-label="Hinzufügen">${icon('plus')}</button>
        </form>
        <div data-list style="margin-top:18px"><div class="skel w80"></div><div class="skel w60"></div></div>
      </section>`;
    const $ = s => root.querySelector(s);
    let data = null;

    const tile = (it, i, recent) => `
      <button class="tile ${recent ? 'recent' : ''}" style="--i:${i}" data-name="${esc(it.name)}" data-uuid="${esc(it.uuid || '')}" data-spec="${esc(it.spec || '')}"
        aria-label="${esc(it.name)} ${recent ? 'wieder hinzufügen' : 'als gekauft markieren'}">
        ${recent ? '' : `<span class="x" data-remove aria-label="Entfernen">${icon('x')}</span>`}
        <span class="em">${itemEmoji(it.name)}</span><span class="nm">${esc(it.name)}</span>${it.spec ? `<span class="sp">${esc(it.spec)}</span>` : ''}
      </button>`;

    function render() {
      if (!data.configured) {
        $('[data-sub]').textContent = 'Nicht verbunden';
        $('[data-add]').hidden = true;
        $('[data-list]').innerHTML = `<div class="empty" style="flex-direction:column;align-items:flex-start;gap:12px">
          <span>Verbinde euer Bring!-Konto, dann erscheint hier eure gemeinsame Einkaufsliste – Änderungen landen sofort auch in der Bring!-App.</span>
          <a class="btn primary t-shop" href="#/einstellungen">${icon('link')}<span>Bring! verbinden</span></a></div>`;
        return;
      }
      $('[data-add]').hidden = false;
      $('[data-sub]').textContent = `${data.purchase.length} Artikel · synchronisiert mit Bring!${data._offline ? ' (offline)' : ''}`;
      $('[data-list]').innerHTML = `
        ${data.purchase.length ? `<div class="tiles">${data.purchase.map((it, i) => tile(it, i)).join('')}</div>`
          : `<div class="empty" style="justify-content:center;padding:30px 0">${icon('check')}<span>Alles eingekauft!</span></div>`}
        ${data.recently.length ? `<div class="tm-sec" style="margin-top:26px">Zuletzt verwendet – tippen zum Hinzufügen</div>
          <div class="tiles">${data.recently.slice(0, 18).map((it, i) => tile(it, i, true)).join('')}</div>` : ''}
        <p class="hint" style="margin-top:18px">Tippe auf einen Artikel, wenn er im Wagen liegt.</p>`;
    }

    async function load(force) {
      const btn = $('[data-refresh]');
      if (force) busy(btn, true);
      try { data = await cachedGet('/bring'); render(); }
      catch (e) { $('[data-list]').innerHTML = errorBox(e.message); $('[data-sub]').textContent = 'Fehler'; }
      busy(btn, false);
    }

    async function change(op, item, msg) {
      try {
        const r = await api('/bring/' + op, { method: 'POST', body: item });
        data = r; setTimeout(render, op === 'add' ? 0 : 380);
        if (msg) ctx.toast(msg);
      } catch (e) { ctx.toast(e.message, { error: true }); load(); }
    }

    $('[data-add]').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim(), spec = f.spec.value.trim();
      if (!name) return;
      f.name.value = ''; f.spec.value = ''; f.name.focus();
      change('add', { name, spec }, `${name} hinzugefügt`);
    });

    root.addEventListener('click', e => {
      if (e.target.closest('[data-refresh]')) { load(true); return; }
      const t = e.target.closest('.tile');
      if (!t) return;
      const item = { name: t.dataset.name, spec: t.dataset.spec, uuid: t.dataset.uuid || null };
      if (navigator.vibrate) navigator.vibrate(10);
      if (e.target.closest('[data-remove]')) { t.classList.add('bye'); change('remove', item); }
      else if (t.classList.contains('recent')) change('add', item, `${item.name} wieder auf der Liste`);
      else { t.classList.add('bye'); change('complete', item); }
    });

    await load();
    ctx.every(20 * 1000, () => { if (document.activeElement?.tagName !== 'INPUT') load(); });
    ctx.onRemote(e => { if (e?.visible) load(); });
  },
};
