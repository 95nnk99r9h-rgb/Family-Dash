// UI-Bausteine: Toasts, Sheets (Dialoge), Seitenkopf, Zeiger-Effekte.
import { icon } from './icons.js';
import { esc, h } from './util.js';

export function toast(msg, { error = false, ms = 2600 } = {}) {
  const el = h(`<div class="toast glass ${error ? 'err' : ''}">${icon(error ? 'info' : 'check')}<span>${esc(msg)}</span></div>`);
  document.getElementById('toasts').append(el);
  setTimeout(() => { el.classList.add('out'); el.addEventListener('animationend', () => el.remove(), { once: true }); }, ms);
}

/** Öffnet einen Dialog. content: HTML-String. Gibt { el, close } zurück. */
export function sheet(content, { onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const bd = h(`<div class="sheet-backdrop"><div class="sheet glass" role="dialog" aria-modal="true">${content}</div></div>`);
  root.append(bd);
  const close = () => {
    if (bd.classList.contains('out')) return;
    bd.classList.add('out');
    setTimeout(() => bd.remove(), 260);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bd.addEventListener('click', e => { if (e.target === bd || e.target.closest('[data-close]')) close(); });
  setTimeout(() => bd.querySelector('[autofocus]')?.focus(), 60);
  return { el: bd.querySelector('.sheet'), close };
}

export function confirmSheet(title, text, okLabel = 'OK') {
  return new Promise(resolve => {
    let ok = false;
    const s = sheet(`<h2>${esc(title)}</h2><p class="hint" style="font-size:15px">${esc(text)}</p>
      <div class="foot"><button class="btn" data-close>Abbrechen</button><button class="btn primary t-shop" data-ok>${esc(okLabel)}</button></div>`,
    { onClose: () => resolve(ok) });
    s.el.querySelector('[data-ok]').onclick = () => { ok = true; s.close(); };
  });
}

export function pageHead({ title, sub = '', icon: ic, tone, actions = '' }) {
  return `<header class="page-head">
    <a class="btn icon-btn glass shine" href="#/" aria-label="Zur Startseite">${icon('chevronLeft')}</a>
    <span class="chip lg ${tone}">${icon(ic)}</span>
    <div class="grow"><h1>${esc(title)}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    <div class="actions">${actions}</div>
  </header>`;
}

export function busy(btn, on) {
  if (!btn) return;
  btn.disabled = on;
  btn.classList.toggle('spin', on);
}

/** Lichtreflex & leichte 3D-Neigung, die dem Mauszeiger / Apple Pencil folgen. */
export function initPointerFx() {
  let active = null;
  const reset = el => { el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); };
  document.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const el = e.target.closest?.('.shine');
    if (active && active !== el) { reset(active); active = null; }
    if (!el) return;
    active = el;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
    if (el.classList.contains('link') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.setProperty('--rx', `${((0.5 - y) * 4).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${((x - 0.5) * 5).toFixed(2)}deg`);
    }
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (active) reset(active); active = null; });
}

const EMOJI = [
  [/milch|sahne|kakao/, '🥛'], [/brot|brötchen|toast|baguette|semmel/, '🍞'], [/brezel/, '🥨'], [/apfel|äpfel/, '🍎'], [/birne/, '🍐'],
  [/banane/, '🍌'], [/orange|mandarine|clementine/, '🍊'], [/zitrone|limette/, '🍋'], [/traube/, '🍇'], [/erdbeer/, '🍓'], [/kirsch/, '🍒'],
  [/melone/, '🍉'], [/ananas/, '🍍'], [/kiwi/, '🥝'], [/pfirsich|nektarine/, '🍑'], [/beere/, '🫐'],
  [/tomate/, '🍅'], [/gurke/, '🥒'], [/karotte|möhre/, '🥕'], [/kartoffel/, '🥔'], [/zwiebel/, '🧅'], [/knoblauch/, '🧄'],
  [/paprika|chili/, '🫑'], [/salat|rucola|spinat/, '🥬'], [/brokkoli/, '🥦'], [/mais/, '🌽'], [/pilz|champignon/, '🍄'], [/avocado/, '🥑'], [/aubergine/, '🍆'],
  [/ei(er)?$|^eier/, '🥚'], [/käse|gouda|mozzarella|parmesan|feta/, '🧀'], [/butter/, '🧈'], [/joghurt|quark|skyr/, '🥣'],
  [/fleisch|steak|hack|rind|schwein/, '🥩'], [/hähnchen|huhn|geflügel|pute/, '🍗'], [/wurst|würstchen|schinken|salami/, '🥓'], [/fisch|lachs|thunfisch/, '🐟'], [/garnele|shrimp/, '🦐'],
  [/nudel|spaghetti|pasta|penne|lasagne/, '🍝'], [/reis/, '🍚'], [/pizza/, '🍕'], [/mehl|backpulver|hefe/, '🌾'], [/zucker|honig/, '🍯'], [/salz|pfeffer|gewürz/, '🧂'],
  [/öl|essig/, '🫒'], [/müsli|cornflakes|haferflocken/, '🥣'], [/kaffee/, '☕'], [/tee/, '🍵'], [/saft/, '🧃'], [/wasser|sprudel/, '💧'], [/bier/, '🍺'], [/wein|sekt/, '🍷'],
  [/limo|cola|fanta|sprite/, '🥤'], [/schoko|nutella/, '🍫'], [/keks|kekse|plätzchen/, '🍪'], [/kuchen|torte/, '🍰'], [/eis$|^eis/, '🍦'], [/chips|snack/, '🥨'], [/bonbon|gummi/, '🍬'],
  [/nuss|nüsse|mandel/, '🥜'], [/dose|konserve|bohnen|linsen|erbsen/, '🥫'], [/tiefkühl|pommes/, '🍟'],
  [/klopapier|toilettenpapier|küchenrolle|taschentuch/, '🧻'], [/spül|reiniger|putz|waschmittel/, '🧴'], [/seife|duschgel|shampoo/, '🧼'], [/zahnpasta|zahnbürste/, '🪥'],
  [/windel/, '👶'], [/batterie/, '🔋'], [/müllbeutel|müllsack/, '🗑️'], [/blume/, '💐'], [/hund|katze|tierfutter/, '🐾'], [/kerze/, '🕯️'],
];
export function itemEmoji(name = '') {
  const n = name.toLowerCase().trim();
  for (const [re, em] of EMOJI) if (re.test(n)) return em;
  return '🛒';
}
