// To-do-Liste: hinzufügen, abhaken, bearbeiten, löschen – ohne Zuweisung oder Frist.
import { icon } from '../icons.js';
import { api, cachedGet } from '../api.js';
import { esc } from '../util.js';
import { pageHead, confirmSheet } from '../ui.js';
import { errorBox } from './shared.js';

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

export default {
  async mount(root, ctx) {
    root.innerHTML = `
      ${pageHead({ title: 'To-dos', sub: '<span data-sub>Lädt …</span>', icon: 'todo', tone: 't-todo' })}
      <section class="card glass t-todo" data-hero style="max-width:820px;margin:0 auto">
        <form class="todo-add" data-add>
          <input class="field" name="t" placeholder="Was steht an?" autocomplete="off" enterkeyhint="done" aria-label="Neue Aufgabe" maxlength="300">
          <button class="btn primary t-todo" style="flex:none">${icon('plus')}<span>Hinzufügen</span></button>
        </form>
        <div class="progress" data-progress hidden><i></i></div>
        <div class="todo-list" data-open></div>
        <div data-done-wrap></div>
      </section>`;
    const $ = s => root.querySelector(s);
    let todos = [];
    let showDone = true;

    const row = (t, i) => `
      <div class="todo ${t.done ? 'done' : ''}" data-id="${t.id}" style="--i:${i}">
        <button class="check" aria-label="${t.done ? 'Als offen markieren' : 'Erledigt'}">${CHECK}</button>
        <span class="txt" data-edit title="Zum Bearbeiten doppelt tippen">${esc(t.text)}</span>
        <button class="btn icon-btn sm ghost del" aria-label="Löschen">${icon('trash')}</button>
      </div>`;

    function render() {
      const open = todos.filter(t => !t.done), done = todos.filter(t => t.done);
      $('[data-sub]').textContent = todos.length
        ? `${open.length} offen · ${done.length} erledigt`
        : 'Noch keine Aufgaben';
      const pr = $('[data-progress]');
      pr.hidden = !todos.length;
      pr.firstElementChild.style.width = todos.length ? `${Math.round(done.length / todos.length * 100)}%` : '0';
      $('[data-open]').innerHTML = open.map(row).join('') ||
        `<div class="empty" style="justify-content:center;padding:34px 0">${icon('sparkle')}<span>Alles erledigt – Zeit für Freizeit!</span></div>`;
      $('[data-done-wrap]').innerHTML = done.length ? `
        <div class="done-head"><button class="btn sm ghost" data-toggle>${icon(showDone ? 'chevronDown' : 'chevronRight')}<span>Erledigt (${done.length})</span></button>
          <span class="grow"></span><button class="btn sm danger" data-clear>${icon('trash')}<span>Erledigte löschen</span></button></div>
        <div class="todo-list" ${showDone ? '' : 'hidden'}>${done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).map(row).join('')}</div>` : '';
    }

    async function load() {
      try { todos = (await cachedGet('/todos')).todos; render(); }
      catch (e) { $('[data-open]').innerHTML = errorBox(e.message); }
    }

    $('[data-add]').addEventListener('submit', async e => {
      e.preventDefault();
      const inp = e.target.querySelector('input');
      const text = inp.value.trim();
      if (!text) return;
      inp.value = '';
      try { const t = await api('/todos', { method: 'POST', body: { text } }); todos.unshift(t); render(); }
      catch (err) { ctx.toast(err.message, { error: true }); inp.value = text; }
      inp.focus();
    });

    root.addEventListener('click', async e => {
      const el = e.target.closest('.todo');
      if (e.target.closest('[data-toggle]')) { showDone = !showDone; render(); return; }
      if (e.target.closest('[data-clear]')) {
        if (!(await confirmSheet('Erledigte löschen?', 'Alle abgehakten Aufgaben werden endgültig entfernt.', 'Löschen'))) return;
        try { todos = (await api('/todos/clear-done', { method: 'POST' })).todos; render(); ctx.toast('Aufgeräumt'); }
        catch (err) { ctx.toast(err.message, { error: true }); }
        return;
      }
      if (!el) return;
      const t = todos.find(x => x.id === el.dataset.id);
      if (!t) return;
      if (e.target.closest('.check')) {
        t.done = !t.done; t.doneAt = t.done ? Date.now() : null;
        el.classList.toggle('done', t.done);
        if (t.done && navigator.vibrate) navigator.vibrate(12);
        setTimeout(() => { el.classList.add('leaving'); setTimeout(render, 320); }, 500);
        try { await api('/todos/' + t.id, { method: 'PATCH', body: { done: t.done } }); }
        catch (err) { t.done = !t.done; render(); ctx.toast(err.message, { error: true }); }
      } else if (e.target.closest('.del')) {
        el.classList.add('leaving');
        setTimeout(() => { todos = todos.filter(x => x !== t); render(); }, 320);
        try { await api('/todos/' + t.id, { method: 'DELETE' }); }
        catch (err) { ctx.toast(err.message, { error: true }); load(); }
      }
    });

    // Bearbeiten per Doppelklick / Doppeltipp
    root.addEventListener('dblclick', e => {
      const span = e.target.closest('[data-edit]');
      if (!span) return;
      const el = span.closest('.todo');
      const t = todos.find(x => x.id === el.dataset.id);
      const inp = document.createElement('input');
      inp.className = 'field'; inp.value = t.text; inp.maxLength = 300; inp.style.height = '38px';
      span.replaceWith(inp); inp.focus(); inp.select();
      let done = false;
      const finish = async save => {
        if (done) return; done = true;
        const v = inp.value.trim();
        if (save && v && v !== t.text) {
          t.text = v;
          try { await api('/todos/' + t.id, { method: 'PATCH', body: { text: v } }); }
          catch (err) { ctx.toast(err.message, { error: true }); }
        }
        render();
      };
      inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') finish(true); if (ev.key === 'Escape') finish(false); });
      inp.addEventListener('blur', () => finish(true));
    });

    await load();
    ctx.onRemote(() => { if (!root.querySelector('.todo input')) load(); });
  },
};
