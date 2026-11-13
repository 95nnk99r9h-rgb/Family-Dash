// Essensplan: Wochenansicht mit Mittag & Abend, Vorschlägen und „Zutaten → Bring!“.
import { icon } from '../icons.js';
import { api, cachedGet } from '../api.js';
import { esc, ymd, addDays, startOfWeek, fmt, sameDay, startOfDay } from '../util.js';
import { pageHead, busy } from '../ui.js';
import { errorBox } from './shared.js';

const SLOTS = [['lunch', 'Mittag', 'sun'], ['dinner', 'Abend', 'moon']];

export default {
  async mount(root, ctx) {
    let week = startOfWeek(new Date());
    let meals = {}, suggestions = [];

    root.innerHTML = `
      ${pageHead({
        title: 'Essensplan', sub: '<span data-range></span>', icon: 'meals', tone: 't-meals',
        actions: `<button class="btn icon-btn glass shine" data-prev aria-label="Vorherige Woche">${icon('chevronLeft')}</button>
          <button class="btn glass shine" data-today aria-label="Diese Woche">${icon('calendar')}<span>Diese Woche</span></button>
          <button class="btn icon-btn glass shine" data-next aria-label="Nächste Woche">${icon('chevronRight')}</button>`,
      })}
      <section class="card glass" data-hero><div class="week" data-week></div>
        <p class="hint" style="margin-top:14px">Tippe auf eine Mahlzeit zum Eintragen. Über ${icon('cart', 'inline')} kommen die Zutaten direkt auf die Bring!-Liste.</p>
      </section>
      <datalist id="meal-suggestions"></datalist>`;
    root.querySelectorAll('.ic.inline').forEach(i => Object.assign(i.style, { width: '15px', height: '15px', verticalAlign: '-3px' }));
    const $ = s => root.querySelector(s);

    function render() {
      const today = startOfDay(new Date());
      const end = addDays(week, 6);
      $('[data-range]').textContent = `${fmt.dayMonth(week)} – ${fmt.dayMonth(end)} ${end.getFullYear()}`;
      $('#meal-suggestions').innerHTML = suggestions.map(s => `<option value="${esc(s)}">`).join('');
      $('[data-week]').innerHTML = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(week, i), key = ymd(d), m = meals[key] || {};
        const isToday = sameDay(d, today);
        return `<div class="mday ${isToday ? 'today' : ''} soft" style="--i:${i}" data-date="${key}">
          <div class="dname"><b>${fmt.weekday(d)}</b><span>${fmt.dayMonth(d)}</span>${isToday ? '<span class="tag">Heute</span>' : ''}</div>
          ${SLOTS.map(([k, lbl, ic]) => `
            <div class="slot" role="button" tabindex="0" data-slot="${k}" aria-label="${lbl} am ${fmt.weekday(d)} bearbeiten">
              ${icon(ic)}
              <div class="grow"><div class="s-lbl">${lbl}</div><div class="s-val ${m[k] ? '' : 'none'}">${m[k] ? esc(m[k]) : '+ Eintragen'}</div></div>
              ${m[k] ? `<button class="btn icon-btn sm ghost cart-btn" data-cart aria-label="Zutaten auf die Einkaufsliste">${icon('cart')}</button>` : ''}
            </div>`).join('')}
        </div>`;
      }).join('');
    }

    async function load() {
      try {
        const r = await cachedGet(`/meals?from=${ymd(week)}&to=${ymd(addDays(week, 6))}`);
        meals = r.meals; suggestions = r.suggestions || [];
        render();
      } catch (e) { $('[data-week]').innerHTML = errorBox(e.message); }
    }

    function edit(slotEl) {
      if (slotEl.querySelector('input')) return;
      const date = slotEl.closest('[data-date]').dataset.date, k = slotEl.dataset.slot;
      const val = slotEl.querySelector('.s-val');
      const inp = document.createElement('input');
      inp.value = meals[date]?.[k] || '';
      inp.setAttribute('list', 'meal-suggestions');
      inp.placeholder = 'Gericht eingeben …';
      inp.maxLength = 200;
      inp.enterKeyHint = 'done';
      val.replaceWith(inp);
      slotEl.querySelector('[data-cart]')?.remove();
      inp.focus();
      let done = false;
      const finish = async save => {
        if (done) return; done = true;
        const v = inp.value.trim();
        if (save && v !== (meals[date]?.[k] || '')) {
          meals[date] = { ...(meals[date] || {}), [k]: v };
          if (v && !suggestions.includes(v)) suggestions.push(v);
          try { await api('/meals/' + date, { method: 'PUT', body: { [k]: v } }); }
          catch (e) { ctx.toast(e.message, { error: true }); }
        }
        render();
      };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
      inp.addEventListener('blur', () => finish(true));
    }

    function ingredients(date, k) {
      const dish = meals[date]?.[k];
      const s = ctx.sheet(`
        <h2><span class="chip t-shop">${icon('cart')}</span>Zutaten einkaufen</h2>
        <p class="hint">Für <b>${esc(dish)}</b> – ein Artikel pro Zeile oder durch Komma getrennt. Optional mit Menge nach einem Doppelpunkt, z. B. „Tomaten: 500 g“.</p>
        <textarea class="field" style="margin-top:12px" rows="6" autofocus placeholder="Nudeln&#10;Tomaten: 500 g&#10;Parmesan"></textarea>
        <div class="foot"><button class="btn" data-close>Abbrechen</button><button class="btn primary t-shop" data-send>${icon('plus')}<span>Auf die Liste</span></button></div>`);
      s.el.querySelector('[data-send]').onclick = async ev => {
        const items = s.el.querySelector('textarea').value.split(/[\n,]/).map(x => x.trim()).filter(Boolean).map(x => {
          const [name, ...spec] = x.split(':');
          return { name: name.trim(), spec: spec.join(':').trim() };
        });
        if (!items.length) return;
        busy(ev.currentTarget, true);
        try {
          await api('/bring/add', { method: 'POST', body: { items } });
          ctx.toast(`${items.length} Artikel auf die Einkaufsliste gesetzt`);
          s.close();
        } catch (e) { ctx.toast(e.message, { error: true }); busy(ev.currentTarget, false); }
      };
    }

    root.addEventListener('click', e => {
      if (e.target.closest('[data-prev]')) { week = addDays(week, -7); load(); return; }
      if (e.target.closest('[data-next]')) { week = addDays(week, 7); load(); return; }
      if (e.target.closest('[data-today]')) { week = startOfWeek(new Date()); load(); return; }
      const cart = e.target.closest('[data-cart]');
      const slot = e.target.closest('.slot');
      if (cart && slot) { e.stopPropagation(); ingredients(slot.closest('[data-date]').dataset.date, slot.dataset.slot); return; }
      if (slot && !e.target.closest('input')) edit(slot);
    });
    root.addEventListener('keydown', e => {
      const slot = e.target.closest?.('.slot');
      if (slot && e.target === slot && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); edit(slot); }
    });

    await load();
    ctx.onRemote(() => { if (!root.querySelector('.slot input')) load(); });
  },
};
