// Wetter-Detailseite für Annweiler am Trifels.
import { icon, weatherIcon } from '../icons.js';
import { getWeather, describe, nextHours, daily, round, windDir, LOCATION } from '../weather.js';
import { fmt, relDayLabel, sameDay } from '../util.js';
import { pageHead, busy } from '../ui.js';
import { errorBox } from './shared.js';

function summary(w) {
  const hrs = nextHours(w, 13).slice(1);
  const wet = hrs.find(h => (h.pop || 0) >= 50);
  const max = Math.max(...hrs.map(h => h.temp)), min = Math.min(...hrs.map(h => h.temp));
  const rain = wet ? `Ab etwa ${String(wet.time.getHours()).padStart(2, '0')} Uhr wird Regen wahrscheinlich – Schirm einpacken!`
    : 'In den nächsten 12 Stunden bleibt es voraussichtlich trocken.';
  return `${rain} Temperaturen zwischen ${round(min)}° und ${round(max)}°.`;
}

export default {
  async mount(root, ctx) {
    root.innerHTML = `
      ${pageHead({
        title: 'Wetter', sub: `${LOCATION.plz} ${LOCATION.name}`, icon: 'weather', tone: 't-weather',
        actions: `<button class="btn icon-btn glass shine" data-refresh aria-label="Aktualisieren">${icon('refresh')}</button>`,
      })}
      <div class="grid">
        <section class="card glass s-7" data-hero data-now><div class="skel big"></div><div class="skel w60"></div></section>
        <section class="card glass s-5" data-details><div class="skel w80"></div><div class="skel w60"></div></section>
        <section class="card glass s-12"><div class="card-head"><span class="chip t-weather">${icon('clock')}</span><div class="grow"><h2>Nächste 24 Stunden</h2><div class="sub">Temperatur & Regenwahrscheinlichkeit</div></div></div><div class="hourly" data-hourly></div></section>
        <section class="card glass s-12"><div class="card-head"><span class="chip t-weather">${icon('calendar')}</span><div class="grow"><h2>7-Tage-Vorhersage</h2><div class="sub">Tiefst- und Höchstwerte</div></div></div><div class="days" data-days></div></section>
      </div>
      <p class="hint" style="text-align:center;margin-top:18px">Wetterdaten: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0)</p>`;
    const $ = s => root.querySelector(s);

    function render(w) {
      const c = w.current, d = describe(c.weather_code, c.is_day), days = daily(w), t = days[0];
      document.documentElement.dataset.weather = d.base;
      $('[data-now]').innerHTML = `
        <div class="wx-hero">${weatherIcon(d.type)}
          <div><div class="wx-temp">${round(c.temperature_2m)}<sup>°C</sup></div></div>
          <div><div class="wx-cond">${d.label}</div>
            <div class="wx-meta">Gefühlt ${round(c.apparent_temperature)}°</div>
            <div class="wx-meta">Höchstens ${round(t.max)}° · Tiefstens ${round(t.min)}°</div>
            ${w._offline ? '<div class="wx-meta">Offline – letzte bekannte Daten</div>' : ''}
          </div>
        </div>
        <p class="wx-summary">${summary(w)}</p>`;
      const tile = (ic, k, v) => `<div class="wx-d"><div class="k">${icon(ic)}${k}</div><div class="v">${v}</div></div>`;
      $('[data-details]').innerHTML = `<div class="wx-details">
        ${tile('wind', 'Wind', `${round(c.wind_speed_10m)} <small>km/h ${windDir(c.wind_direction_10m)}</small>`)}
        ${tile('wind', 'Böen', `${round(c.wind_gusts_10m)} <small>km/h</small>`)}
        ${tile('droplet', 'Feuchte', `${round(c.relative_humidity_2m)} <small>%</small>`)}
        ${tile('umbrella', 'Regen', `${round(t.pop)} <small>% · ${(t.sum ?? 0).toFixed(1)} mm</small>`)}
        ${tile('uv', 'UV-Index', `${round(t.uv)}`)}
        ${tile('thermo', 'Luftdruck', `${round(c.pressure_msl)} <small>hPa</small>`)}
        ${tile('sunrise', 'Aufgang', fmt.time(t.sunrise))}
        ${tile('sunset', 'Untergang', fmt.time(t.sunset))}
        ${tile('clock', 'Tageslicht', `${Math.floor((t.sunset - t.sunrise) / 3600000)} <small>h</small> ${Math.round(((t.sunset - t.sunrise) % 3600000) / 60000)} <small>min</small>`)}
      </div>`;

      const hrs = nextHours(w, 25);
      $('[data-hourly]').innerHTML = hrs.map((hh, i) => {
        const dd = describe(hh.code, hh.isDay);
        const label = i === 0 ? 'Jetzt' : `${String(hh.time.getHours()).padStart(2, '0')} Uhr`;
        return `<div class="hr ${i === 0 ? 'now' : ''}" data-tip="${dd.label}${hh.precip ? ` · ${hh.precip.toFixed(1)} mm` : ''}">
          <span class="t">${label}</span>${weatherIcon(dd.type)}<span class="v">${round(hh.temp)}°</span>
          <span class="pb" aria-hidden="true"><i style="height:${Math.max(0, hh.pop || 0)}%"></i></span>
          <span class="pp">${hh.pop ? hh.pop + '%' : ''}</span></div>`;
      }).join('');

      const week = days.slice(0, 7);
      const lo = Math.min(...week.map(x => x.min)), hi = Math.max(...week.map(x => x.max));
      const span = Math.max(1, hi - lo);
      $('[data-days]').innerHTML = week.map((x, i) => {
        const dd = describe(x.code, 1);
        const left = ((x.min - lo) / span) * 100, width = ((x.max - x.min) / span) * 100;
        const nowDot = i === 0 ? `<b style="left:${((c.temperature_2m - lo) / span) * 100}%" title="Jetzt ${round(c.temperature_2m)}°"></b>` : '';
        return `<div class="drow" title="${dd.label}">
          <span class="dn">${i === 0 ? 'Heute' : relDayLabel(x.date) === 'Morgen' ? 'Morgen' : fmt.wdShort(x.date) + ' ' + x.date.getDate() + '.'}</span>
          ${weatherIcon(dd.type)}
          <span class="pp">${x.pop >= 10 ? x.pop + '%' : ''}</span>
          <span class="lo">${round(x.min)}°</span>
          <span class="range"><i style="left:${left}%;width:${Math.max(width, 3)}%;--bgw:${(100 / Math.max(width, 3)) * 100}%;--bgx:${width < 100 ? (left / (100 - width)) * 100 : 0}%"></i>${nowDot}</span>
          <span class="hi">${round(x.max)}°</span>
        </div>`;
      }).join('');
    }

    async function load(force) {
      const btn = $('[data-refresh]');
      if (force) busy(btn, true);
      try { render(await getWeather({ force })); }
      catch (e) { $('[data-now]').innerHTML = errorBox('Wetter konnte nicht geladen werden. Bitte später erneut versuchen.'); }
      busy(btn, false);
    }
    root.addEventListener('click', e => { if (e.target.closest('[data-refresh]')) load(true); });
    await load();
    ctx.every(10 * 60 * 1000, () => load());
  },
};
