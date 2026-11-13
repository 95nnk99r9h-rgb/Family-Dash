// Vollständige Kalenderansicht (Monat + Tagesagenda) – nur Anzeige, Termine kommen aus dem iPhone-Kalender.
import { icon } from '../icons.js';
import { cachedGet } from '../api.js';
import { esc, ymd, addDays, startOfWeek, fmt, sameDay, startOfDay, relDayLabel } from '../util.js';
import { pageHead, busy } from '../ui.js';
import { eventRow, eventsFor, calendarHint, errorBox } from './shared.js';

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export default {
  async mount(root, ctx) {
    let month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    let selected = startOfDay(new Date());
    let data = null;

    root.innerHTML = `
      ${pageHead({
        title: 'Kalender', sub: '<span data-sub>Aus eurem Apple-Kalender</span>', icon: 'calendar', tone: 't-cal',
        actions: `<button class="btn icon-btn glass shine" data-refresh aria-label="Aktualisieren">${icon('refresh')}</button>`,
      })}
      <div class="cal-layout">
        <section class="card glass" data-hero>
          <div class="cal-head">
            <h2 data-month></h2>
            <button class="btn sm" data-today>Heute</button>
            <button class="btn icon-btn sm" data-prev aria-label="Vorheriger Monat">${icon('chevronLeft')}</button>
            <button class="btn icon-btn sm" data-next aria-label="Nächster Monat">${icon('chevronRight')}</button>
          </div>
          <div class="wdays">${WD.map(d => `<div>${d}</div>`).join('')}</div>
          <div class="month" data-grid></div>
          <div class="cal-legend" data-legend></div>
        </section>
        <section class="card glass agenda" data-agenda></section>
      </div>`;
    const $ = s => root.querySelector(s);

    const gridStart = () => startOfWeek(month);

    function renderGrid() {
      $('[data-month]').textContent = fmt.monthYear(month);
      const start = gridStart(), today = startOfDay(new Date());
      const cells = [];
      for (let i = 0; i < 42; i++) {
        const d = addDays(start, i);
        const evs = data ? eventsFor(data.events, d) : [];
        const other = d.getMonth() !== month.getMonth();
        const we = d.getDay() === 0 || d.getDay() === 6;
        cells.push(`<button class="dcell ${other ? 'other' : ''} ${we ? 'we' : ''} ${sameDay(d, today) ? 'today' : ''} ${sameDay(d, selected) ? 'sel' : ''}"
          data-day="${ymd(d)}" style="--i:${i}" aria-label="${fmt.long(d)}, ${evs.length} Termine">
          <span class="n">${d.getDate()}</span>
          ${evs.slice(0, 3).map(e => `<span class="pill" style="--ev:${esc(e.color)}">${e.allDay ? '' : `${fmt.time(new Date(e.start))} `}${esc(e.title)}</span>`).join('')}
          ${evs.length > 3 ? `<span class="pill more-p">+${evs.length - 3}</span>` : ''}
          <span class="dots">${evs.slice(0, 4).map(e => `<i style="--ev:${esc(e.color)}"></i>`).join('')}</span>
        </button>`);
      }
      $('[data-grid]').innerHTML = cells.join('');
      $('[data-legend]').innerHTML = data?.calendars?.length > 1
        ? data.calendars.map(c => `<span><i style="--ev:${esc(c.color)}"></i>${esc(c.name)}</span>`).join('') : '';
    }

    function renderAgenda() {
      const el = $('[data-agenda]');
      if (!data) { el.innerHTML = '<div class="skel w60"></div><div class="skel w80"></div><div class="skel w40"></div>'; return; }
      const hint = calendarHint(data);
      const evs = eventsFor(data.events, selected);
      // Ausblick: nächste Termine nach dem gewählten Tag
      const upcoming = [];
      for (let i = 1; i <= 14 && upcoming.length < 6; i++) {
        const d = addDays(selected, i);
        for (const e of eventsFor(data.events, d)) {
          if (!upcoming.some(u => u.e.id === e.id) && upcoming.length < 6) upcoming.push({ e, d });
        }
      }
      el.innerHTML = `
        <h3>${relDayLabel(selected)}</h3>
        <div class="sub">${fmt.long(selected)}</div>
        ${hint || (evs.length ? `<div class="events">${evs.map((e, i) => eventRow(e, selected, i, { detail: true })).join('')}</div>`
          : `<div class="empty">${icon('sparkle')}<span>Keine Termine an diesem Tag.</span></div>`)}
        ${upcoming.length ? `<div class="tm-sec" style="margin-top:22px">Danach</div>
          <div class="events">${upcoming.map(({ e, d }, i) => eventRow({ ...e, title: `${fmt.wdShort(d)} ${d.getDate()}.${d.getMonth() + 1}. · ${e.title}` }, d, i)).join('')}</div>` : ''}
        ${data.errors?.length && data.events.length ? `<div class="err" style="margin-top:14px">${icon('info')}<span>${esc(data.errors.join(' · '))}</span></div>` : ''}
        <p class="hint" style="margin-top:18px">${icon('info', 'inline')} Neue Termine tragt ihr wie gewohnt im iPhone-Kalender ein – sie erscheinen hier nach wenigen Minuten.</p>`;
      el.querySelectorAll('.ic.inline').forEach(i => Object.assign(i.style, { width: '14px', height: '14px', verticalAlign: '-2px' }));
    }

    async function load(force) {
      const btn = $('[data-refresh]');
      if (force) busy(btn, true);
      const from = gridStart();
      // Bereich: Monatsraster + 14 Tage für den Ausblick
      try {
        data = await cachedGet(`/calendar?from=${ymd(from)}&to=${ymd(addDays(from, 56))}`);
        $('[data-sub]').textContent = data.calendars.length
          ? data.calendars.map(c => c.name).join(' · ') + (data._offline ? ' (offline)' : '')
          : 'Aus eurem Apple-Kalender';
      } catch (e) {
        data = null;
        $('[data-agenda]').innerHTML = errorBox(e.message);
      }
      busy(btn, false);
      renderGrid();
      if (data) renderAgenda();
    }

    function setMonth(m) {
      month = new Date(m.getFullYear(), m.getMonth(), 1);
      data = null;
      renderGrid(); renderAgenda();
      load();
    }

    root.addEventListener('click', e => {
      if (e.target.closest('[data-prev]')) return setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1));
      if (e.target.closest('[data-next]')) return setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1));
      if (e.target.closest('[data-refresh]')) return load(true);
      if (e.target.closest('[data-today]')) { selected = startOfDay(new Date()); return setMonth(selected); }
      const cell = e.target.closest('[data-day]');
      if (cell) {
        const [y, m, d] = cell.dataset.day.split('-').map(Number);
        selected = new Date(y, m - 1, d);
        if (selected.getMonth() !== month.getMonth()) return setMonth(selected);
        root.querySelectorAll('.dcell.sel').forEach(c => c.classList.remove('sel'));
        cell.classList.add('sel');
        renderAgenda();
        if (matchMedia('(max-width: 1180px)').matches) $('[data-agenda]').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });

    // Wischen zwischen Monaten (Touch)
    let sx = null, sy = null;
    const grid = $('[data-grid]');
    grid.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    grid.addEventListener('touchend', e => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setMonth(new Date(month.getFullYear(), month.getMonth() + (dx < 0 ? 1 : -1), 1));
      sx = null;
    });

    renderGrid(); renderAgenda();
    await load();
    ctx.every(5 * 60 * 1000, () => load());
  },
};
