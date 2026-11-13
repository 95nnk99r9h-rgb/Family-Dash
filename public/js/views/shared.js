// Gemeinsame Render-Bausteine für mehrere Seiten.
import { icon } from '../icons.js';
import { esc, eventBounds, eventOnDay, eventTimeLabel } from '../util.js';

export function eventRow(ev, day, i = 0, { detail = false } = {}) {
  const now = new Date();
  const { s, e } = eventBounds(ev);
  const past = !ev.allDay && e < now;
  const running = !ev.allDay && s <= now && e > now;
  return `<div class="ev ${past ? 'past' : ''} ${running ? 'now' : ''}" style="--ev:${esc(ev.color)};--i:${i}">
    <span class="bar"></span>
    <div style="min-width:0">
      <div class="title">${esc(ev.title)}</div>
      ${ev.location ? `<div class="where">${icon('pin')}<span>${esc(ev.location)}</span></div>` : ''}
      ${detail && ev.description ? `<div class="ev-detail">${esc(ev.description).slice(0, 600)}</div>` : ''}
    </div>
    <span class="time">${eventTimeLabel(ev, day)}</span>
  </div>`;
}

export function eventsFor(events, day) {
  return events.filter(ev => eventOnDay(ev, day));
}

export function calendarHint(data) {
  if (!data.configured) {
    return `<div class="empty">${icon('link')}<span>Noch kein Kalender verbunden – <a href="#/einstellungen">jetzt in den Einstellungen verknüpfen</a>.</span></div>`;
  }
  if (data.errors?.length && !data.events.length) {
    return `<div class="err">${icon('info')}<span>${esc(data.errors.join(' · '))}</span></div>`;
  }
  return '';
}

export function errorBox(msg) {
  return `<div class="err">${icon('info')}<span>${esc(msg)}</span></div>`;
}
