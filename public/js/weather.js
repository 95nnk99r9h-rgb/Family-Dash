// Wetterdaten von Open-Meteo (kostenlos, ohne API-Schlüssel) für Annweiler am Trifels.
import { lsGet, lsSet } from './util.js';

export const LOCATION = { name: 'Annweiler am Trifels', plz: '76855', lat: 49.2036, lon: 7.9667 };
const TTL = 10 * 60 * 1000;
const KEY = 'fd-weather-v1';

const URL_ = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
  latitude: LOCATION.lat, longitude: LOCATION.lon, timezone: 'Europe/Berlin', forecast_days: '8',
  current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,pressure_msl',
  hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,is_day',
  daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max,wind_speed_10m_max',
});

let inflight = null;

export async function getWeather({ force = false } = {}) {
  const cached = lsGet(KEY);
  if (!force && cached && Date.now() - cached.at < TTL) return cached.data;
  if (!inflight) {
    inflight = fetch(URL_).then(r => { if (!r.ok) throw new Error('Wetterdienst nicht erreichbar'); return r.json(); })
      .then(data => { lsSet(KEY, { at: Date.now(), data }); return data; })
      .finally(() => { inflight = null; });
  }
  try { return await inflight; }
  catch (e) { if (cached) return { ...cached.data, _offline: true }; throw e; }
}

const CODES = {
  0: ['Klar', 'clear'], 1: ['Überwiegend klar', 'clear'], 2: ['Teilweise bewölkt', 'partly'], 3: ['Bedeckt', 'cloudy'],
  45: ['Nebel', 'fog'], 48: ['Reifnebel', 'fog'],
  51: ['Leichter Nieselregen', 'drizzle'], 53: ['Nieselregen', 'drizzle'], 55: ['Starker Nieselregen', 'drizzle'],
  56: ['Gefrierender Niesel', 'sleet'], 57: ['Gefrierender Niesel', 'sleet'],
  61: ['Leichter Regen', 'rain'], 63: ['Regen', 'rain'], 65: ['Starker Regen', 'rain'],
  66: ['Gefrierender Regen', 'sleet'], 67: ['Gefrierender Regen', 'sleet'],
  71: ['Leichter Schneefall', 'snow'], 73: ['Schneefall', 'snow'], 75: ['Starker Schneefall', 'snow'], 77: ['Schneegriesel', 'snow'],
  80: ['Regenschauer', 'rain'], 81: ['Regenschauer', 'rain'], 82: ['Heftige Schauer', 'rain'],
  85: ['Schneeschauer', 'snow'], 86: ['Schneeschauer', 'snow'],
  95: ['Gewitter', 'thunder'], 96: ['Gewitter mit Hagel', 'thunder'], 99: ['Gewitter mit Hagel', 'thunder'],
};

export function describe(code, isDay = 1) {
  const [label, base] = CODES[code] || ['Unbekannt', 'cloudy'];
  let type = base;
  if (base === 'clear') type = isDay ? 'clear-day' : 'clear-night';
  if (base === 'partly') type = isDay ? 'partly-day' : 'partly-night';
  return { label, type, base };
}

export function windDir(deg) {
  return ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round(((deg % 360) / 45)) % 8];
}

/** Nächste n Stunden ab jetzt */
export function nextHours(w, n = 24) {
  const now = Date.now() - 3600000;
  const out = [];
  w.hourly.time.forEach((t, i) => {
    const d = new Date(t);
    if (d.getTime() >= now && out.length < n) out.push({
      time: d, temp: w.hourly.temperature_2m[i], code: w.hourly.weather_code[i],
      pop: w.hourly.precipitation_probability[i], precip: w.hourly.precipitation[i], isDay: w.hourly.is_day[i],
    });
  });
  return out;
}

export function daily(w) {
  return w.daily.time.map((t, i) => ({
    date: new Date(t + 'T12:00'), code: w.daily.weather_code[i], max: w.daily.temperature_2m_max[i], min: w.daily.temperature_2m_min[i],
    pop: w.daily.precipitation_probability_max[i], sum: w.daily.precipitation_sum[i],
    sunrise: new Date(w.daily.sunrise[i]), sunset: new Date(w.daily.sunset[i]), uv: w.daily.uv_index_max[i], wind: w.daily.wind_speed_10m_max[i],
  }));
}

export const round = v => (v === null || v === undefined ? '–' : Math.round(v));
