// Hintergrund: prozedural gezeichnete Pfälzerwald-Landschaft mit Burg Trifels
// in vier Tageszeit-Stimmungen – oder ein eigenes Foto. Wird unscharf dargestellt.
import { lsGet, lsSet } from './util.js';

const W = 1600, H = 1000;

const PALETTES = {
  dawn: {
    sky: ['#1b2350', '#6b3f7a', '#e0727a', '#ffb27a'], glow: { x: .7, y: .6, c: '#ffd29a', r: 380 },
    hills: ['#9a6590', '#734a80', '#4d3366', '#2a1f45'], mist: '#ffc6a5', blobs: ['#ff8fa3', '#ffb36b', '#8f7cff', '#ff6fb5'],
  },
  day: {
    sky: ['#1f5fc4', '#4a8fe0', '#8cc2f2', '#d7ecff'], glow: { x: .78, y: .18, c: '#fff6d8', r: 420 },
    hills: ['#88b8b0', '#559382', '#2f6b5a', '#1b4639'], mist: '#e9f6ff', blobs: ['#5ac8fa', '#6ee7b7', '#9ab8ff', '#ffe08a'],
  },
  dusk: {
    sky: ['#1a1240', '#4a1f5e', '#b2406a', '#ff9a5c'], glow: { x: .28, y: .66, c: '#ffb36b', r: 400 },
    hills: ['#86426f', '#5c2b5e', '#3b1c4a', '#201134'], mist: '#ff9f8a', blobs: ['#ff6b8b', '#ff9f5a', '#b18cff', '#ff5fa2'],
  },
  night: {
    sky: ['#03050f', '#0a1230', '#18265a', '#2b3d78'], glow: { x: .76, y: .2, c: '#dfe6ff', r: 260 }, moon: true,
    hills: ['#24345f', '#18244a', '#0f1835', '#080e22'], mist: '#3b4f8f', blobs: ['#5b6cff', '#3fb6ff', '#9a6bff', '#2dd4bf'],
  },
};

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function ridge(baseY, amp, seed, wl) {
  const r = rng(seed);
  const waves = Array.from({ length: 4 }, (_, i) => ({ f: (Math.PI * 2) / (wl / (i + 1) * (0.7 + r() * 0.6)), p: r() * 10, a: amp / (i + 1.2) }));
  let d = `M0 ${H} L0 `;
  const pts = [];
  for (let x = 0; x <= W; x += 16) {
    const y = baseY + waves.reduce((s, w) => s + Math.sin(x * w.f + w.p) * w.a, 0);
    pts.push(`${x} ${y.toFixed(1)}`);
  }
  d += pts.join(' L') + ` L${W} ${H} Z`;
  return { d, yAt: x => baseY + waves.reduce((s, w) => s + Math.sin(x * w.f + w.p) * w.a, 0) };
}

function castle(x, y, fill) {
  // Felsen + Bergfried + Palas (stilisiert)
  return `<g fill="${fill}">
    <path d="M${x - 120} ${y + 40} C${x - 90} ${y - 10} ${x - 70} ${y - 30} ${x - 40} ${y - 38} L${x + 50} ${y - 40} C${x + 80} ${y - 25} ${x + 100} ${y + 5} ${x + 130} ${y + 40} Z"/>
    <rect x="${x - 34}" y="${y - 70}" width="64" height="34"/>
    <path d="M${x - 38} ${y - 70} L${x - 2} ${y - 92} L${x + 34} ${y - 70} Z"/>
    <rect x="${x + 22}" y="${y - 118}" width="34" height="80"/>
    ${[0, 1, 2, 3].map(i => `<rect x="${x + 22 + i * 9}" y="${y - 126}" width="6" height="9"/>`).join('')}
  </g>`;
}

export function landscapeSvg(name) {
  const p = PALETTES[name] || PALETTES.day;
  const r = rng(7);
  const stars = p.moon ? Array.from({ length: 140 }, () =>
    `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H * 0.55).toFixed(0)}" r="${(r() * 1.6 + 0.3).toFixed(1)}" fill="#fff" opacity="${(r() * 0.7 + 0.3).toFixed(2)}"/>`).join('') : '';
  const layers = [
    ridge(560, 60, 11, 900), ridge(640, 70, 23, 700), ridge(730, 80, 37, 620), ridge(850, 70, 51, 520),
  ];
  const cx = 1040, cy = layers[2].yAt(1040) - 18;
  const g = p.glow;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${p.sky.map((c, i) => `<stop offset="${(i / (p.sky.length - 1)) * 0.75}" stop-color="${c}"/>`).join('')}</linearGradient>
    <radialGradient id="glow" cx="${g.x}" cy="${g.y}" r="${g.r / W}" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="${g.c}" stop-opacity=".95"/><stop offset=".25" stop-color="${g.c}" stop-opacity=".55"/><stop offset="1" stop-color="${g.c}" stop-opacity="0"/></radialGradient>
    <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.mist}" stop-opacity="0"/><stop offset=".5" stop-color="${p.mist}" stop-opacity=".45"/><stop offset="1" stop-color="${p.mist}" stop-opacity="0"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars}
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${p.moon ? `<circle cx="${g.x * W}" cy="${g.y * H}" r="46" fill="${g.c}"/>` : `<circle cx="${g.x * W}" cy="${g.y * H}" r="70" fill="${g.c}" opacity=".9"/>`}
  <path d="${layers[0].d}" fill="${p.hills[0]}"/>
  <rect y="560" width="${W}" height="140" fill="url(#mist)"/>
  <path d="${layers[1].d}" fill="${p.hills[1]}"/>
  ${castle(cx, cy, p.hills[2])}
  <path d="${layers[2].d}" fill="${p.hills[2]}"/>
  <rect y="720" width="${W}" height="140" fill="url(#mist)" opacity=".6"/>
  <path d="${layers[3].d}" fill="${p.hills[3]}"/>
</svg>`;
}

export function autoPalette(d = new Date()) {
  const h = d.getHours() + d.getMinutes() / 60;
  if (h >= 5.5 && h < 9) return 'dawn';
  if (h >= 9 && h < 17) return 'day';
  if (h >= 17 && h < 20.5) return 'dusk';
  return 'night';
}

export const bgSettings = {
  get mode() { return lsGet('fd-bg-mode', 'auto'); },
  set mode(v) { lsSet('fd-bg-mode', v); },
  get blur() { return lsGet('fd-bg-blur', 22); },
  set blur(v) { lsSet('fd-bg-blur', v); },
  get custom() { try { return localStorage.getItem('fd-bg-custom'); } catch { return null; } },
  set custom(v) { try { v ? localStorage.setItem('fd-bg-custom', v) : localStorage.removeItem('fd-bg-custom'); } catch { /* Speicher voll */ } },
};

let current = null, front = 'a';
const urlCache = new Map();

export function applyBackground(force = false) {
  const mode = bgSettings.mode;
  const pal = mode === 'auto' || (mode === 'custom' && !bgSettings.custom) ? autoPalette() : mode;
  const key = mode === 'custom' && bgSettings.custom ? 'custom:' + bgSettings.custom.length : pal;
  document.documentElement.style.setProperty('--bg-blur', `${bgSettings.blur}px`);
  const blobPal = PALETTES[pal] || PALETTES[autoPalette()];
  blobPal.blobs.forEach((c, i) => document.documentElement.style.setProperty(`--blob${i + 1}`, c));
  document.documentElement.dataset.palette = pal;
  if (key === current && !force) return;
  current = key;

  let url;
  if (key.startsWith('custom:')) url = bgSettings.custom;
  else {
    if (!urlCache.has(pal)) urlCache.set(pal, URL.createObjectURL(new Blob([landscapeSvg(pal)], { type: 'image/svg+xml' })));
    url = urlCache.get(pal);
  }
  const next = front === 'a' ? 'b' : 'a';
  const nextEl = document.getElementById('bg-' + next), frontEl = document.getElementById('bg-' + front);
  const img = new Image();
  img.onload = img.onerror = () => {
    nextEl.style.backgroundImage = `url("${url}")`;
    nextEl.classList.add('on');
    frontEl.classList.remove('on');
    front = next;
  };
  img.src = url;
}

/** Foto verkleinern (max. 1800 px) und als JPEG-Data-URL speichern */
export async function setCustomImage(file) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const data = c.toDataURL('image/jpeg', 0.82);
  bgSettings.custom = data;
  bgSettings.mode = 'custom';
  applyBackground(true);
}

export const PALETTE_NAMES = { auto: 'Automatisch', dawn: 'Morgenrot', day: 'Tag', dusk: 'Abendrot', night: 'Nacht', custom: 'Eigenes Foto' };
export const previewUrl = pal => {
  if (!urlCache.has(pal)) urlCache.set(pal, URL.createObjectURL(new Blob([landscapeSvg(pal)], { type: 'image/svg+xml' })));
  return urlCache.get(pal);
};
