// Family Dash – App-Shell: Router, Dock, Synchronisierung, Service Worker.
import { icon } from './icons.js';
import { api } from './api.js';
import { applyBackground } from './bg.js';
import { initPointerFx, toast, sheet } from './ui.js';
import { ymd } from './util.js';

import home from './views/home.js';
import calendar from './views/calendar.js';
import weather from './views/weather.js';
import todo from './views/todo.js';
import meals from './views/meals.js';
import shopping from './views/shopping.js';
import settings from './views/settings.js';

const ROUTES = [
  { path: '', label: 'Start', icon: 'home', view: home },
  { path: 'kalender', label: 'Kalender', icon: 'calendar', view: calendar },
  { path: 'wetter', label: 'Wetter', icon: 'weather', view: weather },
  { path: 'todo', label: 'To-dos', icon: 'todo', view: todo },
  { path: 'essen', label: 'Essen', icon: 'meals', view: meals },
  { path: 'einkauf', label: 'Einkauf', icon: 'cart', view: shopping },
  { path: 'einstellungen', label: 'Mehr', icon: 'settings', view: settings },
];

const viewEl = document.getElementById('view');
const dock = document.getElementById('dock');
const indicator = dock.querySelector('.dock-indicator');
let cleanup = [];
let remoteHandlers = [];
let currentPath = null;
let lastRev = null;
let lastDay = ymd(new Date());

// ---------- Dock ----------

dock.insertAdjacentHTML('beforeend', ROUTES.map(r =>
  `<a class="dock-item" href="#/${r.path}" data-path="${r.path}" aria-label="${r.label}">${icon(r.icon)}<span>${r.label}</span></a>`).join(''));
const dockItems = [...dock.querySelectorAll('.dock-item')];

function moveIndicator(path, animate = true) {
  const item = dockItems.find(i => i.dataset.path === path);
  dockItems.forEach(i => i.classList.toggle('on', i === item));
  dockItems.forEach(i => i.toggleAttribute('aria-current', i === item));
  if (!item) { indicator.style.opacity = '0'; return; }
  indicator.style.opacity = '1';
  if (!animate) indicator.style.transition = 'none';
  indicator.style.setProperty('--x', `${item.offsetLeft}px`);
  indicator.style.width = `${item.offsetWidth}px`;
  if (animate) {
    indicator.classList.remove('wobble'); void indicator.offsetWidth; indicator.classList.add('wobble');
  } else requestAnimationFrame(() => { indicator.style.transition = ''; });
}

// Dock-Vergrößerung (wie macOS) bei Maus / Trackpad
dock.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const it of dockItems) {
    const r = it.getBoundingClientRect();
    const d = Math.abs(e.clientX - (r.left + r.width / 2));
    it.style.setProperty('--s', (1 + 0.28 * Math.max(0, 1 - d / 110)).toFixed(3));
  }
});
dock.addEventListener('pointerleave', () => dockItems.forEach(it => it.style.removeProperty('--s')));
addEventListener('resize', () => moveIndicator(currentPath, false));

// ---------- Router ----------

const parse = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || '');

function ctxFor() {
  return {
    navigate,
    toast,
    sheet,
    onRemote(fn) { remoteHandlers.push(fn); },
    every(ms, fn) {
      const id = setInterval(() => { if (document.visibilityState === 'visible') fn(); }, ms);
      cleanup.push(() => clearInterval(id));
    },
    onCleanup(fn) { cleanup.push(fn); },
  };
}

async function render(path) {
  const route = ROUTES.find(r => r.path === path) || ROUTES[0];
  cleanup.forEach(fn => { try { fn(); } catch { /* egal */ } });
  cleanup = []; remoteHandlers = [];
  currentPath = route.path;
  document.title = route.path ? `${route.label} · Family Dash` : 'Family Dash';
  viewEl.className = 'view view-enter';
  viewEl.innerHTML = '';
  viewEl.dataset.route = route.path || 'home';
  moveIndicator(route.path);
  window.scrollTo({ top: 0 });
  try {
    const r = await route.view.mount(viewEl, ctxFor());
    if (typeof r === 'function') cleanup.push(r);
  } catch (e) {
    console.error(e);
    viewEl.innerHTML = `<div class="card glass"><div class="err">${icon('info')}<span>Diese Seite konnte nicht geladen werden: ${e.message}</span></div></div>`;
  }
  [...viewEl.children].forEach((c, i) => c.style.setProperty('--i', i));
}

let heroEl = null;
export function navigate(path, { from } = {}) {
  heroEl = from || null;
  const target = '#/' + path;
  if (location.hash === target || (!location.hash && !path)) route();
  else location.hash = target;
}

function route() {
  const path = parse();
  if (path === currentPath && !heroEl) return;
  const go = async () => {
    await render(path);
    const target = viewEl.querySelector('[data-hero]');
    if (heroEl && target) target.style.viewTransitionName = 'hero';
  };
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches && currentPath !== null) {
    if (heroEl) heroEl.style.viewTransitionName = 'hero';
    viewEl.classList.remove('view-enter');
    const vt = document.startViewTransition(go);
    vt.finished.finally(() => {
      viewEl.querySelectorAll('[data-hero]').forEach(el => { el.style.viewTransitionName = ''; });
      heroEl = null;
    });
  } else {
    go().then(() => { heroEl = null; });
  }
}
addEventListener('hashchange', route);

// Karten auf der Startseite sind Links mit „Morph“-Übergang
document.addEventListener('click', e => {
  const card = e.target.closest('[data-go]');
  if (!card || e.target.closest('button, input, a, label, select, textarea')) return;
  navigate(card.dataset.go, { from: card });
});
document.addEventListener('keydown', e => {
  const card = e.target.closest?.('[data-go]');
  if (card && (e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); navigate(card.dataset.go, { from: card }); }
});

// ---------- Synchronisierung zwischen Geräten ----------

async function checkRev() {
  try {
    const { rev } = await api('/rev');
    if (lastRev !== null && rev !== lastRev) remoteHandlers.forEach(fn => fn());
    lastRev = rev;
  } catch { /* offline */ }
  const today = ymd(new Date());
  if (today !== lastDay) { lastDay = today; render(currentPath); }
  applyBackground();
}
setInterval(() => { if (document.visibilityState === 'visible') checkRev(); }, 15000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { checkRev(); remoteHandlers.forEach(fn => fn({ visible: true })); }
});

// ---------- Start ----------

applyBackground();
initPointerFx();
render(parse());
checkRev();

if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

addEventListener('offline', () => toast('Offline – zeige zuletzt geladene Daten', { error: true }));
addEventListener('online', () => { toast('Wieder online'); remoteHandlers.forEach(fn => fn()); });
