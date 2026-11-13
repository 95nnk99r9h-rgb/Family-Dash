// Startseite: Wetter, heutige Termine, Vorschau morgen, To-dos, Essensplan, Einkaufsliste.
import { icon, weatherIcon } from '../icons.js';
import { api, cachedGet } from '../api.js';
import { getWeather, describe, nextHours, daily, round, LOCATION } from '../weather.js';
import { esc, ymd, addDays, fmt, greeting, lsGet, lsSet, startOfDay } from '../util.js';
import { itemEmoji } from '../ui.js';
import { eventRow, eventsFor, calendarHint, errorBox } from './shared.js';

const skel = '<div class="skel w80"></div><div class="skel w60"></div><div class="skel w40"></div>';

function card(go, tone, ic, title, sub, body, cls, extraHead = '') {
  return `<section class="card glass shine link ${cls}" data-go="${go}" tabindex="0" role="link" aria-label="${esc(title)} öffnen">
    <div class="card-head"><span class="chip ${tone}">${icon(ic)}</span>
      <div class="grow"><h2>${esc(title)}</h2><div class="sub" data-sub>${sub}</div></div>${extraHead}
      <span class="card-go">${icon('arrowRight')}</span></div>
    <div class="card-body">${body}</div>
  </section>`;
}

export default {
  async mount(root, ctx) {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const family = lsGet('fd-family', 'Familie');

    root.innerHTML = `
      <header class="hero-head">
        <div>
          <div class="greet"><span data-greet>${greeting()}</span>, <span data-family>${esc(family)}</span></div>
          <div class="date">${fmt.long(new Date())}</div>
          <div class="loc">${icon('pin')} ${LOCATION.name}</div>
        </div>
        <div class="clock" data-clock aria-label="Uhrzeit"></div>
      </header>
      <div class="grid">
        ${card('wetter', 't-weather', 'weather', 'Wetter', LOCATION.name, skel, 's-5 c-weather')}
        ${card('kalender', 't-cal', 'calendar', 'Heute', fmt.long(today), skel, 's-4 c-today')}
        ${card('kalender', 't-cal', 'sparkle', 'Morgen', fmt.long(tomorrow), skel, 's-3 c-tomorrow')}
        ${card('todo', 't-todo', 'todo', 'To-dos', '', skel, 's-4 c-todo', '<span class="badge" data-count hidden></span>')}
        ${card('essen', 't-meals', 'meals', 'Essensplan', 'Heute & morgen', skel, 's-4 c-meals')}
        ${card('einkauf', 't-shop', 'cart', 'Einkaufsliste', 'Bring!', skel, 's-4 c-shop', '<span class="badge" data-count hidden></span>')}
      </div>`;
    [...root.querySelectorAll('.grid > .card')].forEach((c, i) => c.style.setProperty('--i', i + 1));
    const $ = s => root.querySelector(s);
    const body = s => $(s + ' .card-body');

    // Uhr
    const clock = $('[data-clock]');
    const tick = () => {
      const d = new Date();
      clock.innerHTML = `${String(d.getHours()).padStart(2, '0')}<span class="colon">:</span>${String(d.getMinutes()).padStart(2, '0')}`;
      root.querySelector('[data-greet]').textContent = greeting(d);
    };
    tick();
    const clockId = setInterval(tick, 1000);
    ctx.onCleanup(() => clearInterval(clockId));

    // Name der Familie
    api('/settings').then(s => {
      lsSet('fd-family', s.familyName);
      root.querySelector('[data-family]').textContent = s.familyName;
    }).catch(() => {});

    // ---- Wetter ----
    let weatherData = null;
    async function loadWeather(force) {
      try {
        const w = await getWeather({ force });
        weatherData = w;
        const c = w.current, d = describe(c.weather_code, c.is_day), day = daily(w)[0];
        document.documentElement.dataset.weather = d.base;
        body('.c-weather').innerHTML = `
          <div class="wx-now">${weatherIcon(d.type)}
            <div><div class="wx-temp">${round(c.temperature_2m)}<sup>°C</sup></div></div>
            <div style="min-width:0"><div class="wx-cond">${d.label}</div>
              <div class="wx-meta">Gefühlt ${round(c.apparent_temperature)}° · H ${round(day.max)}° T ${round(day.min)}°</div>
              <div class="wx-meta">${icon('umbrella', 'inline')} ${round(day.pop)} % · ${icon('wind', 'inline')} ${round(c.wind_speed_10m)} km/h</div>
            </div>
          </div>
          <div class="wx-hours">${nextHours(w, 7).slice(1).map(hh => {
            const dd = describe(hh.code, hh.isDay);
            return `<div class="wx-h" title="${dd.label}"><div class="t">${String(hh.time.getHours()).padStart(2, '0')}</div>${weatherIcon(dd.type)}<div class="v">${round(hh.temp)}°</div><div class="p">${hh.pop >= 20 ? hh.pop + '%' : ''}</div></div>`;
          }).join('')}</div>
          <div class="wx-stats">
            <span class="wx-stat">${icon('sunrise')}<b>${fmt.time(day.sunrise)}</b></span>
            <span class="wx-stat">${icon('sunset')}<b>${fmt.time(day.sunset)}</b></span>
            <span class="wx-stat">${icon('droplet')}<b>${round(c.relative_humidity_2m)} %</b></span>
            <span class="wx-stat">${icon('uv')}UV <b>${round(day.uv)}</b></span>
          </div>`;
        root.querySelectorAll('.c-weather .ic.inline').forEach(i => Object.assign(i.style, { width: '14px', height: '14px', verticalAlign: '-2px' }));
        renderTomorrowWeather();
      } catch (e) {
        body('.c-weather').innerHTML = errorBox('Wetter konnte nicht geladen werden.');
      }
    }

    // ---- Termine ----
    let calData = null;
    async function loadCalendar() {
      try {
        calData = await cachedGet(`/calendar?from=${ymd(today)}&to=${ymd(addDays(today, 2))}`);
        const hint = calendarHint(calData);
        const list = eventsFor(calData.events, today);
        const max = 5;
        body('.c-today').innerHTML = hint || (list.length
          ? `<div class="events">${list.slice(0, max).map((e, i) => eventRow(e, today, i)).join('')}</div>${list.length > max ? `<div class="more">+ ${list.length - max} weitere</div>` : ''}`
          : `<div class="empty">${icon('sparkle')}<span>Heute stehen keine Termine an.</span></div>`);
        $('.c-today [data-sub]').textContent = list.length ? `${list.length} Termin${list.length === 1 ? '' : 'e'}` : fmt.long(today);
      } catch (e) {
        body('.c-today').innerHTML = errorBox(e.message);
      }
      renderTomorrow();
    }

    // ---- Morgen ----
    let mealsData = null;
    function renderTomorrowWeather() {
      const slot = root.querySelector('[data-tm-weather]');
      if (!slot || !weatherData) return;
      const d = daily(weatherData)[1];
      const dd = describe(d.code, 1);
      slot.innerHTML = `<div class="tm-pill">${weatherIcon(dd.type)}<span><b>${round(d.max)}°</b> / ${round(d.min)}° · ${dd.label}</span></div>`;
    }
    function renderTomorrow() {
      if (!calData) return;
      const list = eventsFor(calData.events, tomorrow);
      const m = mealsData?.[ymd(tomorrow)];
      body('.c-tomorrow').innerHTML = `
        <div class="tm-strip" data-tm-weather></div>
        ${calData.configured ? (list.length
          ? `<div class="events">${list.slice(0, 4).map((e, i) => eventRow(e, tomorrow, i)).join('')}</div>${list.length > 4 ? `<div class="more">+ ${list.length - 4} weitere</div>` : ''}`
          : `<div class="empty">${icon('sparkle')}<span>Keine Termine – ein freier Tag.</span></div>`) : calendarHint(calData)}
        ${m?.dinner || m?.lunch ? `<div class="tm-sec">Essen morgen</div><div class="note" style="color:var(--text-2)">${icon('meals', 'inline')} ${esc([m.lunch, m.dinner].filter(Boolean).join(' · '))}</div>` : ''}`;
      root.querySelectorAll('.c-tomorrow .ic.inline').forEach(i => Object.assign(i.style, { width: '15px', height: '15px', verticalAlign: '-2px' }));
      renderTomorrowWeather();
    }

    // ---- To-dos ----
    let todos = [];
    function renderTodos() {
      const open = todos.filter(t => !t.done);
      const done = todos.length - open.length;
      const cnt = $('.c-todo [data-count]');
      cnt.hidden = !open.length; cnt.textContent = open.length;
      $('.c-todo [data-sub]').textContent = todos.length ? `${done} von ${todos.length} erledigt` : 'Alles im Griff';
      body('.c-todo').innerHTML = `
        <form class="todo-add" data-add><input class="field" name="t" placeholder="Neue Aufgabe …" autocomplete="off" enterkeyhint="done" aria-label="Neue Aufgabe">
          <button class="btn icon-btn primary t-todo" aria-label="Hinzufügen">${icon('plus')}</button></form>
        <div class="mini-todo todo-list">${open.slice(0, 6).map((t, i) => `
          <div class="todo" data-id="${t.id}" style="--i:${i}">
            <button class="check sm" aria-label="Erledigt">${'<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>'}</button>
            <span class="txt">${esc(t.text)}</span></div>`).join('') || `<div class="empty">${icon('check')}<span>Nichts zu tun – genießt den Tag!</span></div>`}
          ${open.length > 6 ? `<div class="more">+ ${open.length - 6} weitere</div>` : ''}
        </div>
        ${todos.length ? `<div class="progress"><i style="width:${Math.round(done / todos.length * 100)}%"></i></div>` : ''}`;
    }
    async function loadTodos() {
      try { todos = (await cachedGet('/todos')).todos; renderTodos(); }
      catch (e) { body('.c-todo').innerHTML = errorBox(e.message); }
    }
    $('.c-todo').addEventListener('submit', async e => {
      e.preventDefault();
      const inp = e.target.querySelector('input');
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      try { const t = await api('/todos', { method: 'POST', body: { text } }); todos.unshift(t); renderTodos(); $('.c-todo input').focus(); }
      catch (err) { ctx.toast(err.message, { error: true }); }
    });
    $('.c-todo').addEventListener('click', async e => {
      const b = e.target.closest('.check');
      if (!b) return;
      const row = b.closest('.todo');
      const t = todos.find(x => x.id === row.dataset.id);
      row.classList.add('done');
      t.done = true;
      setTimeout(() => { row.classList.add('leaving'); }, 450);
      setTimeout(renderTodos, 800);
      try { await api('/todos/' + t.id, { method: 'PATCH', body: { done: true } }); }
      catch (err) { t.done = false; renderTodos(); ctx.toast(err.message, { error: true }); }
    });

    // ---- Essen ----
    async function loadMeals() {
      try {
        const r = await cachedGet(`/meals?from=${ymd(today)}&to=${ymd(tomorrow)}`);
        mealsData = r.meals;
        const t = mealsData[ymd(today)] || {}, m = mealsData[ymd(tomorrow)] || {};
        const row = (ic, lbl, val) => `<div class="meal-row"><span class="ico">${icon(ic)}</span><div><div class="lbl">${lbl}</div><div class="val ${val ? '' : 'none'}">${val ? esc(val) : 'Noch nichts geplant'}</div></div></div>`;
        body('.c-meals').innerHTML = `<div class="meal-mini">
          ${row('sun', 'Heute Mittag', t.lunch)}${row('moon', 'Heute Abend', t.dinner)}${row('sparkle', 'Morgen', [m.lunch, m.dinner].filter(Boolean).join(' · '))}</div>`;
        renderTomorrow();
      } catch (e) { body('.c-meals').innerHTML = errorBox(e.message); }
    }

    // ---- Einkauf ----
    async function loadShop() {
      try {
        const b = await cachedGet('/bring');
        const cnt = $('.c-shop [data-count]');
        if (!b.configured) {
          body('.c-shop').innerHTML = `<div class="empty">${icon('link')}<span>Bring! ist noch nicht verbunden – <a href="#/einstellungen">jetzt verknüpfen</a>.</span></div>`;
          return;
        }
        cnt.hidden = !b.purchase.length; cnt.textContent = b.purchase.length;
        const max = 14;
        body('.c-shop').innerHTML = `
          <form class="todo-add" data-shop-add style="margin-bottom:12px"><input class="field" placeholder="Artikel hinzufügen …" autocomplete="off" enterkeyhint="done" aria-label="Artikel hinzufügen">
            <button class="btn icon-btn primary t-shop" aria-label="Hinzufügen">${icon('plus')}</button></form>
          ${b.purchase.length ? `<div class="shop-chips">${b.purchase.slice(0, max).map((it, i) =>
            `<span class="shop-chip" style="--i:${i}"><span class="em">${itemEmoji(it.name)}</span>${esc(it.name)}</span>`).join('')}
            ${b.purchase.length > max ? `<span class="shop-chip" style="background:var(--fill-1);box-shadow:none">+${b.purchase.length - max}</span>` : ''}</div>`
          : `<div class="empty">${icon('check')}<span>Die Einkaufsliste ist leer.</span></div>`}`;
      } catch (e) { body('.c-shop').innerHTML = errorBox(e.message); }
    }
    $('.c-shop').addEventListener('submit', async e => {
      e.preventDefault();
      const inp = e.target.querySelector('input');
      const name = inp.value.trim();
      if (!name) return;
      inp.value = '';
      try { await api('/bring/add', { method: 'POST', body: { name } }); ctx.toast(`${name} hinzugefügt`); loadShop(); }
      catch (err) { ctx.toast(err.message, { error: true }); }
    });

    loadWeather(); loadCalendar(); loadTodos(); loadMeals(); loadShop();
    ctx.onRemote(() => { if (!root.querySelector('.c-todo input')?.matches(':focus')) loadTodos(); loadMeals(); });
    ctx.every(60 * 1000, () => { if (!root.querySelector('.c-shop input')?.matches(':focus')) loadShop(); });
    ctx.every(5 * 60 * 1000, () => { loadCalendar(); });
    ctx.every(10 * 60 * 1000, () => loadWeather());
  },
};
