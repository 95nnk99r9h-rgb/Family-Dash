// Eigene Strich-Icons (24×24, currentColor) und animierte Wetter-Symbole.

const P = {
  home: '<path d="M3.5 10.5 12 3.8l8.5 6.7"/><path d="M5.5 9v10.2c0 .7.6 1.3 1.3 1.3h3.7v-5.7h3v5.7h3.7c.7 0 1.3-.6 1.3-1.3V9"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="8.3" cy="14.2" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="14.2" r=".9" fill="currentColor" stroke="none"/><circle cx="15.7" cy="14.2" r=".9" fill="currentColor" stroke="none"/>',
  weather: '<circle cx="9" cy="9" r="3.2"/><path d="M9 2.5v1.3M3.8 4.4l.9.9M2.5 9h1.3M14.2 4.4l-.9.9"/><path d="M8.5 20.5h8.8a3.7 3.7 0 0 0 .5-7.4 5 5 0 0 0-9.6 1.5 3 3 0 0 0 .3 5.9z"/>',
  todo: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="m8 12.3 2.7 2.7L16.3 9.3"/>',
  meals: '<path d="M7 3v7.5M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 10.5V21"/><path d="M17.5 21V3c-2.4 1.3-3.6 4-3.6 7.3 0 1.8.9 3 3.6 3.2"/>',
  cart: '<path d="M3 4h2.2l2.3 11.2c.1.7.8 1.3 1.5 1.3h8.5c.7 0 1.3-.5 1.5-1.2L21 8H6.1"/><circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  trash: '<path d="M4 7h16M9.5 7V4.8c0-.4.4-.8.8-.8h3.4c.4 0 .8.4.8.8V7M6.5 7l.8 12.2c.1.9.8 1.6 1.7 1.6h6c.9 0 1.6-.7 1.7-1.6L17.5 7"/><path d="M10 11v6M14 11v6"/>',
  chevronLeft: '<path d="m14.5 5-7 7 7 7"/>',
  chevronRight: '<path d="m9.5 5 7 7-7 7"/>',
  chevronDown: '<path d="m5 9.5 7 7 7-7"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  wind: '<path d="M3 8.5h10.5a2.5 2.5 0 1 0-2.5-2.5M3 12.5h15a2.5 2.5 0 1 1-2.5 2.5M3 16.5h7.5"/>',
  droplet: '<path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.5a2 2 0 0 1-4 0M12 3v-.5"/>',
  sunrise: '<path d="M4 18h16M7 14.5a5 5 0 0 1 10 0M12 4v4.5M9.5 6.5 12 4l2.5 2.5M4.5 10.5l1.2 1.2M19.5 10.5l-1.2 1.2M3 21h18"/>',
  sunset: '<path d="M4 18h16M7 14.5a5 5 0 0 1 10 0M12 8.5V4M9.5 6 12 8.5 14.5 6M4.5 10.5l1.2 1.2M19.5 10.5l-1.2 1.2M3 21h18"/>',
  thermo: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v8"/>',
  uv: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8.5M4 4v4.5h4.5M4 13a8 8 0 0 0 14.6 4.5L20 15.5M20 20v-4.5h-4.5"/>',
  edit: '<path d="M4 20h4L19.3 8.7a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5c0 .8-.7 1.5-1.5 1.5h-11c-.8 0-1.5-.7-1.5-1.5v-11C4 6.7 4.7 6 5.5 6H10"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  sparkle: '<path d="M12 3.5c.6 4.4 2.4 6.3 6.8 6.8-4.4.6-6.2 2.4-6.8 6.9-.6-4.5-2.4-6.3-6.8-6.9 4.4-.5 6.2-2.4 6.8-6.8z"/><path d="M19 16.5c.2 1.4.8 2 2.2 2.2-1.4.2-2 .8-2.2 2.2-.2-1.4-.8-2-2.2-2.2 1.4-.2 2-.8 2.2-2.2z"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="9.5" r="1.8"/><path d="m4 17.5 4.8-4.8a1.5 1.5 0 0 1 2.1 0l5.6 5.6M14 14.5l1.8-1.8a1.5 1.5 0 0 1 2.1 0l2.6 2.6"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  share: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8 11H6.5c-.8 0-1.5.7-1.5 1.5v6.5c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5v-6.5c0-.8-.7-1.5-1.5-1.5H16"/>',
  sparkles: '<path d="M12 3.5c.6 4.4 2.4 6.3 6.8 6.8-4.4.6-6.2 2.4-6.8 6.9-.6-4.5-2.4-6.3-6.8-6.9 4.4-.5 6.2-2.4 6.8-6.8z"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}

// ---------- Wetter-Symbole (bunt & animiert) ----------

const cloud = (fill = 'url(#g-cloud)', cls = '') =>
  `<path class="w-cloud ${cls}" fill="${fill}" d="M19 50h28a11 11 0 0 0 1.6-21.9A15 15 0 0 0 20 31.5 9.3 9.3 0 0 0 19 50z"/>`;
const sun = (cx = 32, cy = 32, r = 11, cls = '') => `
  <g class="w-sun ${cls}" style="transform-origin:${cx}px ${cy}px">
    <g class="w-rays" stroke="url(#g-sun)" stroke-width="3.2" stroke-linecap="round" style="transform-origin:${cx}px ${cy}px">
      ${Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4, r1 = r + 5, r2 = r + 9.5;
        return `<line x1="${(cx + Math.cos(a) * r1).toFixed(1)}" y1="${(cy + Math.sin(a) * r1).toFixed(1)}" x2="${(cx + Math.cos(a) * r2).toFixed(1)}" y2="${(cy + Math.sin(a) * r2).toFixed(1)}"/>`;
      }).join('')}
    </g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g-sun)"/>
  </g>`;
const moon = (cx = 30, cy = 28, s = 1) =>
  `<path class="w-moon" fill="url(#g-moon)" transform="translate(${cx - 30 * s} ${cy - 28 * s}) scale(${s})" d="M43.36 34.18A14 14 0 1 1 29.24 16.02A12 12 0 0 0 43.36 34.18Z"/>`;
const drops = (n = 3, cls = 'w-drop') => Array.from({ length: n }, (_, i) =>
  `<line class="${cls}" style="animation-delay:${(i * 0.33).toFixed(2)}s" x1="${24 + i * 8}" y1="53" x2="${21 + i * 8}" y2="60" stroke="url(#g-drop)" stroke-width="3" stroke-linecap="round"/>`).join('');
const flakes = (n = 3) => Array.from({ length: n }, (_, i) =>
  `<circle class="w-flake" style="animation-delay:${(i * 0.5).toFixed(2)}s" cx="${24 + i * 8}" cy="56" r="2.4" fill="#fff"/>`).join('');

const SHAPES = {
  'clear-day': () => sun(32, 32, 12),
  'clear-night': () => `${moon(32, 30, 1.05)}<circle class="w-star" cx="48" cy="14" r="1.6" fill="#fff"/><circle class="w-star s2" cx="14" cy="18" r="1.2" fill="#fff"/>`,
  'partly-day': () => `${sun(24, 24, 9, 'small')}${cloud()}`,
  'partly-night': () => `${moon(26, 22, 0.8)}${cloud()}`,
  cloudy: () => `<g transform="translate(8 -8) scale(.75)" opacity=".8">${cloud('url(#g-cloud-dark)', 'back')}</g>${cloud()}`,
  fog: () => `${cloud('url(#g-cloud-dark)')}<g class="w-fog" stroke="#dfe7f3" stroke-width="3" stroke-linecap="round"><line x1="14" y1="55" x2="44" y2="55"/><line x1="22" y1="60" x2="52" y2="60"/></g>`,
  drizzle: () => `${cloud()}${drops(2)}`,
  rain: () => `${cloud('url(#g-cloud-dark)')}${drops(3)}`,
  sleet: () => `${cloud('url(#g-cloud-dark)')}${drops(1)}${flakes(2).replace('cx="24"', 'cx="40"')}`,
  snow: () => `${cloud()}${flakes(3)}`,
  thunder: () => `${cloud('url(#g-cloud-dark)')}<path class="w-bolt" fill="url(#g-bolt)" d="M35 44h-7l-3 10h6l-3 9 11-13h-6l3-6z"/>`,
};

export function weatherIcon(type, cls = '') {
  const f = SHAPES[type] || SHAPES.cloudy;
  return `<svg class="wi ${cls}" viewBox="0 0 64 64" aria-hidden="true">${f()}</svg>`;
}
