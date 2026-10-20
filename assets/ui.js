import * as C from './core.js?v=10';

/* ---------- DOM helper ---------- */
export function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) sk.startsWith('--') ? el.style.setProperty(sk, sv) : (el.style[sk] = sv);
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Icone (SVG originali, tratto semplice) ---------- */
const P = {
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="4"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  vote: '<path d="M9 11.5l2.2 2.2L15.5 9"/><rect x="4" y="3.5" width="16" height="17" rx="4"/>',
  swap: '<path d="M7 7h12l-3.5-3.5M17 17H5l3.5 3.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.6v.2"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c1.4-3.6 4.2-5.2 7.5-5.2s6.1 1.6 7.5 5.2"/>',
  users: '<circle cx="9" cy="9" r="3.5"/><path d="M2.8 19.5c1.1-3.1 3.4-4.5 6.2-4.5s5.1 1.4 6.2 4.5M15.5 5.6a3.4 3.4 0 010 6.8M17.5 15.2c1.8.5 3 1.8 3.7 4.3"/>',
  layers: '<path d="M12 3.5l8.5 4.5L12 12.5 3.5 8 12 3.5z"/><path d="M3.5 12.2L12 16.7l8.5-4.5M3.5 16.2L12 20.7l8.5-4.5"/>',
  inbox: '<path d="M4 13.5l2.4-7.2A2 2 0 018.3 5h7.4a2 2 0 011.9 1.3l2.4 7.2V18a2 2 0 01-2 2H6a2 2 0 01-2-2v-4.5z"/><path d="M4 13.5h4.5l1.2 2h4.6l1.2-2H20"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5"/>',
  check: '<path d="M5.5 12.5l4 4 9-9"/>',
  logout: '<path d="M14 4.5h3.5a2 2 0 012 2v11a2 2 0 01-2 2H14M10 16l-4-4 4-4M6 12h10"/>',
  trash: '<path d="M5 7h14M10 4h4M7 7l.8 12a2 2 0 002 1.9h4.4a2 2 0 002-1.9L17 7"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>',
  hand: '<path d="M8 12V6.5a1.5 1.5 0 013 0V11m0-5.5a1.5 1.5 0 013 0V11m0-4a1.5 1.5 0 013 0v6.5a6.5 6.5 0 01-6.5 6.5h-.6a5.6 5.6 0 01-4.6-2.4L5 13.6a1.4 1.4 0 012.2-1.7L8 13"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.8-.8 1.8-1.7 0-1.1-.9-1.4-.9-2.4 0-.9.7-1.6 1.6-1.6H17a3.5 3.5 0 003.5-3.5C20.5 7 16.7 3.5 12 3.5z"/><circle cx="8" cy="11" r="1" fill="currentColor"/><circle cx="11" cy="7.5" r="1" fill="currentColor"/><circle cx="15.3" cy="8.3" r="1" fill="currentColor"/>',
  school: '<path d="M3 9.5L12 5l9 4.5-9 4.5-9-4.5z"/><path d="M7 11.6v4.2c1.4 1.4 3 2.2 5 2.2s3.6-.8 5-2.2v-4.2M21 9.5v5"/>',
  key: '<circle cx="8.5" cy="14.5" r="4"/><path d="M11.4 11.6L19 4M16 7l2.5 2.5M14 9l2 2"/>',
  unlock: '<rect x="5.5" y="10.5" width="13" height="10" rx="3"/><path d="M8.5 10.5V8a3.5 3.5 0 016.8-1.2"/>',
  book: '<path d="M4.5 5.5A2 2 0 016.5 3.5H19v14H6.5a2 2 0 00-2 2v-14z"/><path d="M4.5 19.5a2 2 0 002 2H19v-4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  edit: '<path d="M4.5 19.5l1-4L15.8 5.2a2 2 0 012.9 0l.1.1a2 2 0 010 2.9L8.5 18.5l-4 1z"/><path d="M14 7l3 3"/>',
  ext: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 14v4a2 2 0 01-2 2H6.5a2 2 0 01-2-2V9.5a2 2 0 012-2H10"/>',
};
export function icon(name, extra = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.9'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true'); if (extra) s.setAttribute('class', extra);
  s.innerHTML = P[name] || ''; return s;
}

/* Marchio di Interrogo: una "I" con il punto lime */
export function mark(size = 30) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 40 40'); s.setAttribute('width', size); s.setAttribute('height', size); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<rect x="13" y="15" width="9" height="20" rx="4.5" fill="currentColor"/><circle cx="17.5" cy="7.5" r="5" fill="currentColor"/><circle cx="29" cy="30.5" r="4.5" fill="#e3f86c"/>';
  return s;
}

/* ---------- Toast ---------- */
let toastEl, toastT;
export function toast(msg, kind = 'ok') {
  if (!toastEl) { toastEl = h('div', { class: 'toast', role: 'status' }); document.body.append(toastEl); }
  toastEl.className = 'toast ' + kind; toastEl.textContent = msg;
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), kind === 'error' ? 4200 : 2400);
}
export function errMsg(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found') || c.includes('invalid-email')) return 'Nome utente o password errati';
  if (c.includes('too-many-requests')) return 'Troppi tentativi, riprova tra qualche minuto';
  if (c.includes('network')) return 'Connessione assente';
  if (c.includes('permission-denied')) return 'Operazione non permessa';
  if (c.includes('email-already-in-use')) return 'Account già esistente';
  if (c.includes('weak-password')) return 'Password troppo corta (minimo 6 caratteri)';
  if (c.includes('requires-recent-login')) return 'Esci e rientra, poi riprova';
  return e?.message || 'Qualcosa è andato storto';
}

/* ---------- Bottom sheet ---------- */
const sheets = [];
export function openSheet(title, build, onClose) {
  const back = h('div', { class: 'backdrop' });
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
  let closed = false;
  const close = () => {
    if (closed) return; closed = true; onClose?.();
    back.classList.remove('show'); sheet.classList.remove('show');
    const i = sheets.indexOf(close); if (i >= 0) sheets.splice(i, 1);
    setTimeout(() => { back.remove(); sheet.remove(); }, 260);
    if (!sheets.length) document.body.style.overflow = '';
  };
  back.addEventListener('click', close);
  const content = h('div');
  sheet.append(h('div', { class: 'grab' }),
    h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'iconbtn', 'aria-label': 'Chiudi', onclick: close }, icon('close'))),
    content);
  const fill = () => { content.replaceChildren(); const r = build(close, fill); if (r) content.append(...[r].flat(Infinity).filter(x => x != null && x !== false)); };
  fill();
  document.body.append(back, sheet); document.body.style.overflow = 'hidden';
  sheets.push(close);
  requestAnimationFrame(() => { back.classList.add('show'); sheet.classList.add('show'); });
  return close;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheets.length) sheets[sheets.length - 1](); });

export function confirmSheet(title, text, okLabel = 'Conferma', danger = false) {
  return new Promise(res => {
    let done = false;
    openSheet(title, c => [
      h('p', { class: 'muted', html: text }),
      h('div', { class: 'actions' },
        h('button', { class: 'btn block ' + (danger ? 'danger' : ''), onclick: () => { done = true; res(true); c(); } }, okLabel),
        h('button', { class: 'btn block ghost', onclick: () => c() }, 'Annulla')),
    ], () => { if (!done) res(false); });
  });
}

/* Esegue un'azione asincrona mostrando lo stato sul bottone */
export async function busy(btn, fn, okMsg) {
  const label = btn?.innerHTML; if (btn) { btn.disabled = true; btn.textContent = 'Attendi…'; }
  try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
  catch (e) { console.error(e); toast(errMsg(e), 'error'); throw e; }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; } }
}

/* ---------- Login ---------- */
export function renderLogin(root, { title, sub, placeholder, onSubmit, footer }) {
  const u = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', placeholder });
  const p = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'Password' });
  const err = h('div', { class: 'err' });
  const btn = h('button', { class: 'btn block', type: 'submit' }, 'Accedi');
  const form = h('form', { class: 'login-form', onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    if (!u.value.trim() || !p.value) { err.textContent = 'Compila entrambi i campi'; return; }
    btn.disabled = true; btn.textContent = 'Accesso…';
    try { await onSubmit(u.value, p.value); } catch (x) { err.textContent = errMsg(x); btn.disabled = false; btn.textContent = 'Accedi'; }
  } },
  h('label', { class: 'field' }, h('span', {}, 'Nome utente'), u),
  h('label', { class: 'field' }, h('span', {}, 'Password'), p), btn, err);
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('div', { class: 'logo' }, mark(34)), h('h1', {}, title), h('p', { class: 'sub' }, sub), form, footer || null)));
}
export function renderLoader(root) { root.replaceChildren(h('div', { class: 'loader' }, h('div', { class: 'spin' }))); }

/* ---------- Shell con navigazione ---------- */
export function shell(root, tabs, current, onTab, badges = {}, brand = null) {
  const main = h('div', { class: 'main' });
  const nav = h('nav', { class: 'nav' }, h('div', { class: 'brand', title: brand || C.APP_NAME }, brand ? h('span', { class: 'brand-t' }, brand) : mark(30)),
    tabs.map(t => h('button', { class: t.id === current ? 'active' : '', 'aria-label': t.label, onclick: () => onTab(t.id) },
      icon(t.icon), h('span', {}, t.label), badges[t.id] ? h('span', { class: 'dot' }, String(badges[t.id])) : null)));
  root.replaceChildren(h('div', { class: 'app' }, main), nav);
  return main;
}
export function page(main, heroKids, bodyKids) {
  main.replaceChildren(h('div', { class: 'hero' }, h('div', { class: 'hero-inner' }, heroKids)), h('div', { class: 'body' }, h('div', { class: 'body-inner' }, bodyKids)));
}

/* ---------- Avatar / eventi ---------- */
export function avatar(st, { me = false, color } = {}) {
  return h('span', { class: 'av' + (me ? ' me' : ''), title: C.fullName(st), style: color ? { '--c': color } : null }, C.initials(st));
}
export const subjColor = (subjects, id) => subjects[id]?.color || '#e1e1ea';
export const subjName = (subjects, id) => subjects[id]?.name || 'Materia';

export function eventCard(ev, { students, subjects, me, totalStudents, onClick, recover = [] }) {
  const ids = (ev.studentIds || []).filter(id => students[id]);
  const list = ids.map(id => students[id]).sort(C.byLastName);
  const mine = me && (ev.studentIds || []).includes(me);
  const color = subjColor(subjects, ev.subjectId);
  const isVer = ev.type === 'verifica';
  const whole = isVer && totalStudents && ids.length >= totalStudents;
  const done = C.isDone(ev);
  const typeLabel = ev.cancelled ? 'Giornata annullata' : isVer ? 'Verifica in classe' : 'Interrogazione';
  return h('button', { class: 'ev' + (mine ? ' mine' : '') + (ev.cancelled ? ' cancelled' : '') + (done ? ' done' : ''), style: { '--c': color }, onclick: onClick ? () => onClick(ev) : null },
    h('div', { class: 'ev-top' }, h('span', { class: 'ev-type' }, typeLabel), done ? h('span', { class: 'pill ok' }, icon('check'), isVer ? 'Svolta' : 'Fatta') : null, mine ? h('span', { class: 'pill lime' }, 'Tu') : null),
    h('h3', {}, subjName(subjects, ev.subjectId)),
    ev.note ? h('div', { class: 'note' }, ev.note) : null,
    whole ? h('div', { class: 'names' }, 'Tutta la classe') :
      list.length ? [
        h('div', { class: 'avs' }, list.slice(0, 7).map(st => avatar(st, { me: me && st === students[me], color })),
          list.length > 7 ? h('span', { class: 'av', style: { '--c': color } }, '+' + (list.length - 7)) : null),
        h('div', { class: 'names' }, list.map(C.fullName).join(', ')),
      ] : h('div', { class: 'names' }, 'Nessuno studente'));
}

/* ---------- Calendario ----------
   state: { view: 'week'|'month', sel: 'YYYY-MM-DD', filter: 'all'|'mine' } */
export function calendar({ state, events, students, subjects, me, onChange, onEventClick, title = null, extraTop = null, extraBody = null, timetable = null, ttChanges = null, onTTEdit = null }) {
  const today = C.todayISO();
  const visible = events.filter(e => state.filter !== 'mine' || (e.studentIds || []).includes(me));
  const byDay = {};
  visible.forEach(e => (byDay[e.date] ??= []).push(e));
  const dots = d => h('div', { class: 'dots' }, [...new Set((byDay[d] || []).filter(e => !e.cancelled).map(e => subjColor(subjects, e.subjectId)))].slice(0, 3).map(c => h('i', { style: { '--c': c } })));
  const set = patch => { Object.assign(state, patch); onChange(); };
  const shift = n => set({ sel: state.view === 'week' ? C.nextWeekday(C.addDays(C.mondayOf(state.sel), 7 * n)) : C.nextWeekday(C.addMonths(state.sel, n)) });

  let grid;
  if (state.view === 'week') {
    const mon = C.mondayOf(state.sel);
    grid = h('div', { class: 'strip' }, [0, 1, 2, 3, 4].map(i => {
      const d = C.addDays(mon, i);
      return h('button', { class: 'day' + (d === today ? ' today' : '') + (d === state.sel ? ' sel' : '') + (C.dayChange(ttChanges, d) ? ' ttchg' : ''), onclick: () => set({ sel: d }) },
        h('small', {}, C.wd3(d)), h('b', {}, C.dnum(d)), dots(d));
    }));
  } else {
    const days = C.weekdaysOfMonth(state.sel);
    const lead = (C.fromISO(days[0]).getDay() + 6) % 7; // 0 = lunedì
    grid = h('div', { class: 'month' }, h('div', { class: 'month-grid' },
      ['Lun', 'Mar', 'Mer', 'Gio', 'Ven'].map(w => h('div', { class: 'wd' }, w)),
      Array.from({ length: lead }, () => h('div', { class: 'mday out' })),
      days.map(d => h('button', { class: 'mday' + (d === today ? ' today' : '') + (d === state.sel ? ' sel' : '') + (C.dayChange(ttChanges, d) ? ' ttchg' : ''), onclick: () => set({ sel: d }) },
        C.dnum(d), dots(d)))));
  }

  const hero = [
    h('div', { class: 'cal-head' },
      h('h1', {}, title || C.monthTitle(state.view === 'week' ? C.mondayOf(state.sel) : state.sel)),
      h('button', { class: 'pill dark', onclick: () => set({ sel: C.nextWeekday(today) }) }, 'Oggi'),
      h('button', { class: 'iconbtn', 'aria-label': 'Precedente', onclick: () => shift(-1) }, icon('left')),
      h('button', { class: 'iconbtn', 'aria-label': 'Successivo', onclick: () => shift(1) }, icon('right'))),
    h('div', { class: 'cal-tools' },
      h('div', { class: 'seg' },
        h('button', { class: state.view === 'week' ? 'active' : '', onclick: () => set({ view: 'week' }) }, 'Settimana'),
        h('button', { class: state.view === 'month' ? 'active' : '', onclick: () => set({ view: 'month' }) }, 'Mese')),
      me ? h('div', { class: 'seg' },
        h('button', { class: state.filter !== 'mine' ? 'active' : '', onclick: () => set({ filter: 'all' }) }, 'Tutti'),
        h('button', { class: state.filter === 'mine' ? 'active' : '', onclick: () => set({ filter: 'mine' }) }, 'Miei')) : extraTop),
    grid,
  ];

  const dayEv = (byDay[state.sel] || []).sort((a, b) => (a.cancelled - b.cancelled) || (a.type === b.type ? 0 : a.type === 'interrogazione' ? -1 : 1));
  const total = Object.keys(students).length;
  const body = [
    extraBody,
    h('div', { class: 'day-title' }, h('h2', {}, C.cap(C.fmtLong(state.sel))),
      h('span', { class: 'muted small' }, dayEv.length ? `${dayEv.length} ${dayEv.length === 1 ? 'impegno' : 'impegni'}` : '')),
    dayEv.length ? dayEv.map(e => eventCard(e, { students, subjects, me, totalStudents: total, onClick: onEventClick }))
      : h('div', { class: 'empty' }, h('b', {}, 'Giornata libera'), state.filter === 'mine' ? 'Nessun tuo impegno in questo giorno.' : 'Nessun impegno in questo giorno.'),
    timetable ? (() => {
      // evidenzia nell'orario le materie con un impegno (per lo studente: solo i suoi)
      const marks = {};
      dayEv.filter(e => !e.cancelled && (!me || (e.studentIds || []).includes(me)))
        .forEach(e => { if (!marks[e.subjectId] || e.type === 'interrogazione') marks[e.subjectId] = e.type === 'verifica' ? 'Verifica' : 'Interrogazione'; });
      return daySchedule(timetable, state.sel, subjects, { marks, changes: ttChanges, onEdit: onTTEdit, onWeek: () => weekSheet(timetable, subjects) });
    })() : null,
  ];
  return { hero, body };
}

/* ---------- Orario settimanale ---------- */
export const cellName = (c, subjects) => (C.ttEmpty(c) ? '' : c.s ? subjName(subjects, c.s) : c.t);
export const cellColor = (c, subjects) => (C.ttEmpty(c) ? 'transparent' : c.s ? subjColor(subjects, c.s) : '#ececf2');

/* Griglia lun–ven. Con onCell (editor admin) ogni ora è una casella cliccabile;
   altrimenti le ore consecutive della stessa materia sono unite. */
export function weekGrid(tt, subjects, { onCell = null, todayWd = null } = {}) {
  const hours = tt?.hours || [];
  const kids = [h('div', { style: { gridColumn: 1, gridRow: 1 } })];
  C.WEEKDAYS.forEach(([w, l], j) => kids.push(h('div', { class: 'tt-wd' + (w === todayWd ? ' today' : ''), style: { gridColumn: j + 2, gridRow: 1 } }, l.slice(0, 3))));
  hours.forEach((hr, i) => kids.push(h('div', { class: 'tt-hr', style: { gridColumn: 1, gridRow: i + 2 } }, h('b', {}, C.ordinal(i)), h('small', {}, hr.start))));
  C.WEEKDAYS.forEach(([w], j) => {
    if (onCell) {
      hours.forEach((hr, i) => {
        const c = tt?.days?.[w]?.[i] || null;
        kids.push(h('button', { class: 'tt-c' + (C.ttEmpty(c) ? ' empty' : ''), style: { gridColumn: j + 2, gridRow: i + 2, '--c': cellColor(c, subjects) },
          'aria-label': `${C.WEEKDAYS[j][1]} ${C.ordinal(i)} ora`, onclick: () => onCell(w, i) }, cellName(c, subjects) || '+'));
      });
    } else {
      C.ttBlocks(tt, w).forEach(b => kids.push(h('div', { class: 'tt-c', style: { gridColumn: j + 2, gridRow: `${b.from + 2} / ${b.to + 3}`, '--c': cellColor(b.cell, subjects) },
        title: b.cell.n || null }, cellName(b.cell, subjects))));
    }
  });
  return h('div', { class: 'tt-grid', style: { gridTemplateRows: `auto repeat(${hours.length}, minmax(46px, auto))` } }, kids);
}

/* Lezioni del giorno selezionato. marks = { idMateria: 'Interrogazione' } per evidenziare le righe. */
export function daySchedule(tt, date, subjects, { marks = {}, onWeek = null, changes = null, onEdit = null } = {}) {
  const blocks = C.dayBlocks(tt, changes, date);
  const ch = C.dayChange(changes, date);
  if (!blocks.length && !ch && !(onEdit && tt?.hours?.length)) return null;
  return h('div', { class: 'tt-day' },
    h('div', { class: 'day-title' }, h('h2', {}, 'Orario'),
      h('div', { class: 'row', style: { gap: '6px' } },
        onEdit ? h('button', { class: 'btn sm ghost', onclick: () => onEdit(date) }, icon('edit'), ch ? 'Variazione' : 'Varia') : null,
        onWeek ? h('button', { class: 'btn sm ghost', onclick: onWeek }, 'Settimana intera') : null)),
    ch ? h('div', { class: 'tt-change' }, icon('clock'), h('div', { class: 'grow' }, h('b', {}, 'Orario variato per questo giorno'), ch.note ? h('div', { class: 's' }, ch.note) : null)) : null,
    !blocks.length ? h('p', { class: 'small muted', style: { padding: '6px 2px' } }, ch ? 'Nessuna lezione in questo giorno.' : 'Nessuna lezione inserita per questo giorno.') : null,
    blocks.map(b => h('div', { class: 'tt-row', style: { '--c': cellColor(b.cell, subjects) } },
      h('div', { class: 'tt-when' }, h('b', {}, b.from === b.to ? `${C.ordinal(b.from)} ora` : `${C.ordinal(b.from)}–${C.ordinal(b.to)}`), h('small', {}, `${b.start}–${b.end}`)),
      h('div', { class: 'tt-bar' }),
      h('div', { class: 'grow' }, h('div', { class: 't' }, cellName(b.cell, subjects)), b.cell.n ? h('div', { class: 's' }, b.cell.n) : null),
      b.cell.s && marks[b.cell.s] ? h('span', { class: 'pill dark' }, marks[b.cell.s]) : null)));
}
export function weekSheet(tt, subjects) {
  const today = C.todayISO();
  openSheet('Orario settimanale', () => tt?.hours?.length
    ? [weekGrid(tt, subjects, { todayWd: C.isWeekend(today) ? null : C.weekdayOf(today) }),
      h('p', { class: 'small muted', style: { marginTop: '12px' } }, `Orari: ${tt.hours[0].start}–${tt.hours[tt.hours.length - 1].end}`)]
    : h('div', { class: 'empty' }, h('b', {}, 'Orario non ancora inserito'), 'L\'admin non ha ancora caricato l\'orario della classe.'));
}

/* ---------- Regole ---------- */
export function rulesList(openFirst = false) {
  return C.RULES.map((r, i) => h('details', { class: 'acc', open: openFirst && i === 0 },
    h('summary', {}, h('span', { class: 'n' }, String(i + 1)), h('span', {}, r.t), icon('right', 'chev')),
    h('div', { class: 'acc-b', html: r.b })));
}

export function toggleRow(label, sub, on, onToggle) {
  return h('div', { class: 'toggle' }, h('div', {}, h('div', { style: { fontWeight: '700' } }, label), sub ? h('div', { class: 'muted small' }, sub) : null),
    h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on), onclick: onToggle }));
}

/* =========================================================
   ANIMAZIONI DI SORTEGGIO
   ========================================================= */
const reducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

/* Per l'admin (anche da proiettare in classe): i nomi girano e "cadono" uno alla volta nelle date.
   assign = { data: [uid…] }, drawn = uid sorteggiati (gli altri compaiono già fermi), unassigned = uid rimasti senza posto. */
export function drawShow({ title = 'Sorteggio', subtitle = '', dates, assign, drawn, unassigned = [], nameOf, dateLabel = C.fmtShort }) {
  return new Promise(resolve => {
    const drawnSet = new Set(drawn);
    // nel rullo girano solo i nomi non ancora estratti
    const pick = () => { const left = cards.flatMap(c => c.queue); return left.length ? nameOf(left[Math.floor(Math.random() * left.length)]) : ''; };
    const cards = dates.map(d => {
      const ids = assign[d] || [];
      const list = h('div', { class: 'draw-names' }, ids.filter(u => !drawnSet.has(u)).map(u => h('span', { class: 'draw-n fixed' }, nameOf(u))));
      const roll = h('div', { class: 'draw-roll' });
      return { el: h('div', { class: 'draw-card' }, h('div', { class: 'draw-d' }, C.cap(dateLabel(d))), list, roll), list, roll, queue: ids.filter(u => drawnSet.has(u)) };
    });
    const lost = unassigned.filter(u => drawnSet.has(u));
    if (lost.length) {
      const list = h('div', { class: 'draw-names' }); const roll = h('div', { class: 'draw-roll' });
      cards.push({ el: h('div', { class: 'draw-card lost' }, h('div', { class: 'draw-d' }, 'Senza posto'), list, roll), list, roll, queue: lost, lost: true });
    }
    const active = cards.filter(c => c.queue.length);
    const total = active.reduce((a, c) => a + c.queue.length, 0);
    const head = h('div', { class: 'draw-head' }, h('div', { class: 'draw-dice' }, icon('dice')), h('div', { class: 'grow' }, h('h2', {}, title), subtitle ? h('p', {}, subtitle) : null));
    const status = h('p', { class: 'draw-status' }, total ? `Sorteggio di ${total} ${total === 1 ? 'studente' : 'studenti'}…` : 'Nessuno da sorteggiare');
    const skip = h('button', { class: 'btn ghost', onclick: () => finish() }, 'Salta');
    const done = h('button', { class: 'btn lime hidden', onclick: () => close() }, 'Chiudi');
    const ov = h('div', { class: 'draw-ov', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'draw-box' }, head, status, h('div', { class: 'draw-grid' }, cards.map(c => c.el)), h('div', { class: 'draw-foot' }, skip, done)));
    document.body.append(ov); document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => ov.classList.add('show'));
    active.forEach(c => c.el.classList.add('rolling'));

    let spin = 0, step = 0, finished = false;
    const drop = (c, u, animate = true) => {
      c.list.append(h('span', { class: 'draw-n' + (c.lost ? ' lost' : '') + (animate ? ' pop' : '') }, nameOf(u)));
      if (!c.queue.length) { c.el.classList.remove('rolling'); c.roll.textContent = ''; }
    };
    const finish = () => {
      if (finished) return; finished = true; clearInterval(spin); clearTimeout(step);
      active.forEach(c => { while (c.queue.length) drop(c, c.queue.shift(), false); });
      status.textContent = total ? 'Sorteggio completato' : status.textContent;
      skip.classList.add('hidden'); done.classList.remove('hidden'); ov.classList.add('finished');
    };
    const close = () => { finish(); ov.classList.remove('show'); setTimeout(() => { ov.remove(); document.body.style.overflow = ''; }, 250); resolve(); };
    if (!total || reducedMotion()) { finish(); return; }
    spin = setInterval(() => active.forEach(c => { if (c.queue.length) c.roll.textContent = pick(); }), 75);
    const gap = Math.max(140, Math.min(600, 3600 / total));
    let i = 0;
    const next = () => {
      const left = active.filter(c => c.queue.length);
      if (!left.length) return finish();
      const c = left[i++ % left.length];
      drop(c, c.queue.shift());
      step = setTimeout(next, gap);
    };
    step = setTimeout(next, 1100);
  });
}

/* Per lo studente: un rullo di date che rallenta e si ferma sulla sua. */
export function drawReveal({ subject, color = '#e3f86c', dates, target, kicker = 'Sei stato sorteggiato' }) {
  return new Promise(resolve => {
    const ROW = 64;
    const pool = dates.length ? dates : [target];
    const seq = [];
    for (let k = 0; k < 6; k++) pool.slice().sort(() => Math.random() - .5).forEach(d => seq.push(d));
    seq.push(target, pool[0]);
    const reel = h('div', { class: 'reel-track' }, seq.map(d => h('div', { class: 'reel-item' }, h('small', {}, C.wd3(d)), h('b', {}, C.dnum(d)), h('small', {}, C.mon3(d)))));
    const result = h('div', { class: 'reveal-result' },
      h('div', { class: 'reveal-k' }, kicker),
      h('div', { class: 'reveal-date' }, C.cap(C.fmtLong(target))),
      h('button', { class: 'btn lime block', style: { marginTop: '18px' }, onclick: () => close() }, 'Ho capito'));
    const confetti = h('div', { class: 'confetti' }, Array.from({ length: 22 }, (_, i) => h('i', { style: { '--x': `${Math.round(Math.random() * 240 - 120)}px`, '--y': `${Math.round(-60 - Math.random() * 140)}px`, '--r': `${Math.round(Math.random() * 360)}deg`, '--d': `${(i % 7) * 40}ms`, '--c': ['#e3f86c', '#9a8af0', '#fff', color][i % 4] } })));
    const box = h('div', { class: 'reveal-box', style: { '--c': color } },
      h('div', { class: 'draw-dice spin' }, icon('dice')),
      h('div', { class: 'reveal-subj' }, h('span', { class: 'sdot', style: { '--c': color } }), 'Sorteggio · ', subject),
      h('div', { class: 'reel' }, reel, h('div', { class: 'reel-mark' })),
      confetti, result);
    const ov = h('div', { class: 'draw-ov reveal', role: 'dialog', 'aria-modal': 'true', 'aria-label': kicker }, box);
    document.body.append(ov); document.body.style.overflow = 'hidden';
    const end = -(seq.length - 3) * ROW; // target nella riga centrale
    const land = () => { box.classList.add('landed'); };
    const close = () => { ov.classList.remove('show'); setTimeout(() => { ov.remove(); document.body.style.overflow = ''; }, 250); resolve(); };
    requestAnimationFrame(() => {
      ov.classList.add('show');
      if (reducedMotion()) { reel.style.transform = `translateY(${end}px)`; land(); return; }
      requestAnimationFrame(() => {
        reel.style.transition = 'transform 3.1s cubic-bezier(.12,.72,.14,1)';
        reel.style.transform = `translateY(${end}px)`;
        setTimeout(land, 3150);
      });
    });
  });
}

/* ---------- Guida a schede (tutorial) ----------
   steps = [{ icon, title, html, action: { label, go } }] */
export function stepsSheet(title, steps, { start = 0, onDone = null } = {}) {
  let i = start;
  return openSheet(title, (close, refill) => {
    const st = steps[i]; const last = i === steps.length - 1;
    return [
      h('div', { class: 'tut' },
        h('div', { class: 'tut-ic' }, icon(st.icon || 'info')),
        h('div', { class: 'tut-n' }, `${i + 1} di ${steps.length}`),
        h('h3', {}, st.title),
        h('div', { class: 'tut-b', html: st.html }),
        st.action ? h('button', { class: 'btn sm line', style: { marginTop: '12px' }, onclick: () => { close(); st.action.go(); } }, st.action.label, icon('right')) : null),
      h('div', { class: 'tut-dots' }, steps.map((_, j) => h('button', { class: j === i ? 'on' : '', 'aria-label': `Passo ${j + 1}`, onclick: () => { i = j; refill(); } }))),
      h('div', { class: 'row', style: { marginTop: '16px' } },
        i > 0 ? h('button', { class: 'btn ghost grow', onclick: () => { i--; refill(); } }, icon('left'), 'Indietro') : h('button', { class: 'btn ghost grow', onclick: close }, 'Salta'),
        h('button', { class: 'btn grow ' + (last ? 'lime' : ''), onclick: () => { if (last) close(); else { i++; refill(); } } }, last ? 'Ho capito' : 'Avanti', last ? null : icon('right'))),
    ];
  }, onDone);
}

/* localStorage protetto: in alcune modalità del browser non è disponibile */
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* niente */ } },
};
