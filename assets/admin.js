import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, createStudentAccount,
  collection, doc, onSnapshot, getDoc, setDoc, updateDoc, addDoc, deleteDoc, writeBatch, serverTimestamp, deleteField,
} from './firebase.js';
import * as C from './core.js';
import {
  h, icon, toast, errMsg, openSheet, confirmSheet, busy, renderLogin, renderLoader, shell, page, avatar,
  subjColor, subjName, calendar, toggleRow,
} from './ui.js';

const root = document.getElementById('app');
const A = fresh();
function fresh() {
  return {
    uid: null, students: {}, subjects: {}, events: {}, rounds: {}, configs: {}, proposals: {}, votes: {},
    excl: {}, swaps: {}, recov: {}, ready: new Set(),
    tab: 'giri', roundId: null, cal: { view: 'week', sel: C.nextWeekday(C.todayISO()), filter: 'all' },
  };
}
let unsubs = [], roundSubs = {};

/* ---------- Auth ---------- */
renderLoader(root);
onAuthStateChanged(auth, async user => {
  stopAll(); Object.assign(A, fresh());
  if (!user) return showLogin();
  try {
    const s = await getDoc(doc(db, 'admins', user.uid));
    if (!s.exists()) return notAdmin();
  } catch (e) { console.error(e); return notAdmin(); }
  A.uid = user.uid; start();
});
function showLogin() {
  renderLogin(root, {
    title: 'Pannello admin', sub: C.APP_NAME + ' · gestione della classe', placeholder: 'admin',
    onSubmit: (u, p) => signInWithEmailAndPassword(auth, C.emailOf(u), p),
    footer: h('a', { href: '../', class: 'small', style: { display: 'block', textAlign: 'center', marginTop: '14px', color: 'rgba(19,19,23,.6)', fontWeight: '700' } }, 'Vai al sito studenti'),
  });
}
function notAdmin() {
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' }, h('div', { class: 'logo' }, '3B'),
    h('h1', {}, 'Accesso negato'), h('p', { class: 'sub' }, 'Questo account non ha i permessi da admin.'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' } },
      h('a', { class: 'btn block', href: '../' }, 'Vai al sito studenti'),
      h('button', { class: 'btn block line', onclick: () => signOut(auth) }, 'Esci')))));
}

/* ---------- Dati ---------- */
const toMap = q => { const m = {}; q.forEach(d => (m[d.id] = { id: d.id, ...d.data() })); return m; };
function listen(key, ref, fn) {
  unsubs.push(onSnapshot(ref, s => { fn(s); A.ready.add(key); schedule(); }, e => { console.error(key, e); toast(errMsg(e), 'error'); A.ready.add(key); schedule(); }));
}
function start() {
  listen('students', collection(db, 'students'), q => { A.students = {}; q.forEach(d => (A.students[d.id] = d.data())); });
  listen('subjects', collection(db, 'subjects'), q => (A.subjects = toMap(q)));
  listen('events', collection(db, 'events'), q => (A.events = toMap(q)));
  listen('rounds', collection(db, 'rounds'), q => { A.rounds = toMap(q); syncRoundSubs(); });
  listen('excl', collection(db, 'exclusions'), q => { A.excl = {}; q.forEach(d => (A.excl[d.id] = d.data().dates || {})); });
  listen('swaps', collection(db, 'swaps'), q => (A.swaps = toMap(q)));
  listen('recov', collection(db, 'recoveries'), q => (A.recov = toMap(q)));
}
function syncRoundSubs() {
  const want = {};
  for (const r of Object.values(A.rounds)) {
    if (r.status === 'archived') continue;
    want[r.id + ':v'] = () => onSnapshot(collection(db, 'rounds', r.id, 'votes'), q => { A.votes[r.id] = toMap(q); schedule(); });
    want[r.id + ':c'] = () => onSnapshot(doc(db, 'rounds', r.id, 'private', 'config'), s => { A.configs[r.id] = s.exists() ? s.data() : { defaultCap: 0, caps: {} }; schedule(); });
    want[r.id + ':p'] = () => onSnapshot(doc(db, 'rounds', r.id, 'private', 'proposal'), s => { A.proposals[r.id] = s.exists() ? s.data() : null; schedule(); });
  }
  for (const k of Object.keys(roundSubs)) if (!want[k]) { roundSubs[k](); delete roundSubs[k]; }
  for (const [k, f] of Object.entries(want)) if (!roundSubs[k]) roundSubs[k] = f();
}
function stopAll() { unsubs.forEach(u => u()); unsubs = []; Object.values(roundSubs).forEach(u => u()); roundSubs = {}; }

/* ---------- Helpers ---------- */
const events = () => Object.values(A.events);
const studentIds = () => Object.keys(A.students).sort((a, b) => C.byLastName(A.students[a], A.students[b]));
const st = id => A.students[id];
const capOf = (rid, d) => { const c = A.configs[rid] || {}; return c.caps?.[d] ?? c.defaultCap ?? 0; };
const reasonsFor = (u, d, ignore = []) => C.blockReasons(u, d, { events: events(), exclusions: A.excl[u] || {}, ignore });
const blocker = (ignore = []) => (u, d) => reasonsFor(u, d, ignore).length > 0;
const roundTitle = r => r.title || `Interrogazioni di ${subjName(A.subjects, r.subjectId)}`;
const roundEvents = r => events().filter(e => e.roundId === r.id);
const reasonLine = (u, d, ignore) => reasonsFor(u, d, ignore).map(x => C.reasonText(x, A.subjects, false)).join('; ');
const sortIds = ids => [...ids].filter(st).sort((a, b) => C.byLastName(st(a), st(b)));

/* ---------- Render ---------- */
let raf = 0;
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
const TABS = [
  { id: 'giri', label: 'Giri', icon: 'layers' }, { id: 'cal', label: 'Calendario', icon: 'cal' },
  { id: 'studenti', label: 'Studenti', icon: 'users' }, { id: 'richieste', label: 'Richieste', icon: 'inbox' },
  { id: 'altro', label: 'Altro', icon: 'more' },
];
function render() {
  if (!A.uid) return;
  const a = document.activeElement;
  if (a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { a.addEventListener('blur', () => setTimeout(schedule, 400), { once: true }); return; }
  if (A.ready.size < 7) return renderLoader(root);
  const badges = { richieste: Object.values(A.swaps).filter(s => s.status === 'pending_admin').length + Object.values(A.recov).filter(r => r.status === 'open').length };
  const y = window.scrollY;
  const main = shell(root, TABS, A.tab, t => { A.tab = t; A.roundId = null; window.scrollTo(0, 0); render(); }, badges);
  ({ giri: renderRounds, cal: renderCal, studenti: renderStudents, richieste: renderRequests, altro: renderMore })[A.tab](main);
  window.scrollTo(0, y);
}
const fab = (label, fn) => document.body.append(h('button', { class: 'fab', 'aria-label': label, onclick: fn, 'data-fab': '1' }, icon('plus')));
const clearFab = () => document.querySelectorAll('[data-fab]').forEach(x => x.remove());

/* =========================================================
   GIRI
   ========================================================= */
function renderRounds(main) {
  clearFab();
  if (A.roundId && A.rounds[A.roundId]) return renderRound(main, A.rounds[A.roundId]);
  const order = { voting: 0, closed: 1, draft: 2, published: 3, archived: 4 };
  const list = Object.values(A.rounds).sort((a, b) => (order[a.status] - order[b.status]) || ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
  const n = studentIds().length;
  page(main, [h('h1', {}, 'Giri di interrogazioni'), h('p', { class: 'sub' }, `${n} studenti · ${Object.keys(A.subjects).length} materie`)], [
    list.length ? list.map(r => {
      const voted = Object.values(A.votes[r.id] || {}).filter(v => v.first).length;
      const sPill = { draft: 'grey', voting: 'lime', closed: 'violet', published: 'ok', archived: 'grey' }[r.status];
      return h('button', { class: 'card', style: { display: 'block', width: '100%', textAlign: 'left' }, onclick: () => { A.roundId = r.id; window.scrollTo(0, 0); render(); } },
        h('div', { class: 'row' }, h('span', { class: 'sdot', style: { '--c': subjColor(A.subjects, r.subjectId) } }), h('h3', { class: 'grow' }, roundTitle(r)),
          h('span', { class: 'pill ' + sPill }, C.STATUS[r.status])),
        h('div', { class: 'small muted', style: { marginTop: '6px' } },
          `${(r.dates || []).length} date`, r.dates?.length ? ` · dal ${C.fmtShort([...r.dates].sort()[0])}` : '',
          r.status === 'voting' ? ` · ${voted}/${n} hanno votato` : '', A.proposals[r.id] ? ' · proposta da confermare' : '',
          r.revote?.active ? ' · rivotazione in corso' : ''));
    }) : h('div', { class: 'empty' }, h('b', {}, 'Nessun giro'), 'Crea il primo giro con il pulsante +.'),
  ]);
  fab('Nuovo giro', () => roundSheet());
}

function roundSheet(r = null) {
  if (!Object.keys(A.subjects).length) { toast('Crea prima una materia (sezione Altro)', 'error'); return subjectSheet(); }
  const cfg = r ? (A.configs[r.id] || {}) : {};
  let dates = r ? [...(r.dates || [])].sort() : [];
  const subj = h('select', {}, Object.values(A.subjects).sort((a, b) => a.name.localeCompare(b.name)).map(s => h('option', { value: s.id, selected: r?.subjectId === s.id }, s.name)));
  const title = h('input', { type: 'text', placeholder: 'Facoltativo (es. Storia – 1° periodo)', value: r?.title || '' });
  const capIn = h('input', { type: 'number', min: '1', inputmode: 'numeric', value: String(cfg.defaultCap ?? 4) });
  const dateIn = h('input', { type: 'date', min: C.todayISO() });
  openSheet(r ? 'Modifica giro' : 'Nuovo giro', (close, refill) => {
    const chips = h('div', { class: 'chips', style: { marginTop: '10px' } }, dates.length ? dates.map(d => h('span', { class: 'chip' }, C.fmtShort(d),
      h('button', { 'aria-label': 'Rimuovi', onclick: () => { dates = dates.filter(x => x !== d); refill(); } }, icon('close')))) : h('span', { class: 'small muted' }, 'Nessuna data aggiunta'));
    const add = () => {
      const d = dateIn.value; if (!d) return;
      if (C.isWeekend(d)) return toast('Sabato e domenica non si va a scuola', 'error');
      if (!dates.includes(d)) dates = [...dates, d].sort();
      dateIn.value = ''; refill();
    };
    return [
      h('label', { class: 'field' }, h('span', {}, 'Materia'), subj),
      h('label', { class: 'field' }, h('span', {}, 'Titolo'), title),
      h('label', { class: 'field' }, h('span', {}, 'Posti massimi per giorno (nascosto alla classe)'), capIn),
      h('div', { class: 'field' }, h('span', { class: 'small', style: { fontWeight: '700', color: 'var(--muted)' } }, 'Giorni in cui viene il docente'),
        h('div', { class: 'row', style: { marginTop: '6px' } }, h('div', { class: 'grow' }, dateIn), h('button', { class: 'btn ghost', onclick: add }, icon('plus'), 'Aggiungi')), chips),
      h('div', { class: 'actions' },
        h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => {
          if (!dates.length) throw new Error('Aggiungi almeno una data');
          const capN = Math.max(1, parseInt(capIn.value, 10) || 1);
          const data = { subjectId: subj.value, title: title.value.trim(), dates };
          if (r) {
            await updateDoc(doc(db, 'rounds', r.id), data);
            await setDoc(doc(db, 'rounds', r.id, 'private', 'config'), { defaultCap: capN }, { merge: true });
          } else {
            const ref = await addDoc(collection(db, 'rounds'), { ...data, status: 'draft', visible: false, showVotes: false, createdAt: serverTimestamp() });
            await setDoc(doc(db, 'rounds', ref.id, 'private', 'config'), { defaultCap: capN, caps: {} });
            A.roundId = ref.id;
          }
        }, r ? 'Giro aggiornato' : 'Giro creato').then(close).catch(() => {}) }, r ? 'Salva modifiche' : 'Crea giro')),
    ];
  });
}

function renderRound(main, r) {
  const n = studentIds().length;
  const votes = A.votes[r.id] || {};
  const voted = studentIds().filter(id => votes[id]?.first);
  const missing = studentIds().filter(id => !votes[id]?.first);
  const prop = A.proposals[r.id];
  const sorted = [...(r.dates || [])].sort();
  const upd = (data, msg) => busy(null, () => updateDoc(doc(db, 'rounds', r.id), data), msg);

  const hero = [
    h('button', { class: 'back', onclick: () => { A.roundId = null; render(); } }, icon('left'), 'Tutti i giri'),
    h('div', { class: 'row' }, h('span', { class: 'sdot', style: { '--c': subjColor(A.subjects, r.subjectId) } }), h('span', { class: 'small', style: { fontWeight: '700' } }, subjName(A.subjects, r.subjectId))),
    h('h1', { style: { marginTop: '4px' } }, roundTitle(r)),
    h('div', { class: 'row wrap', style: { marginTop: '10px' } }, h('span', { class: 'pill dark' }, C.STATUS[r.status]),
      r.revote?.active ? h('span', { class: 'pill lime' }, 'Rivotazione in corso') : null, prop ? h('span', { class: 'pill violet' }, 'Proposta da confermare') : null),
  ];

  const body = [];
  // azioni principali
  const actions = h('div', { class: 'row wrap' });
  if (r.status === 'draft') actions.append(
    h('button', { class: 'btn lime', onclick: () => upd({ status: 'voting', visible: true }, 'Votazione aperta') }, 'Apri votazione'),
    h('button', { class: 'btn ghost', onclick: () => roundSheet(r) }, 'Modifica'),
    h('button', { class: 'btn danger-ghost', onclick: () => deleteRound(r) }, icon('trash'), 'Elimina'));
  if (r.status === 'voting') actions.append(
    h('button', { class: 'btn', onclick: async () => { if (await confirmSheet('Chiudere la votazione?', `Hanno votato ${voted.length} studenti su ${n}. Dopo la chiusura nessuno potrà più cambiare scelta (puoi sempre riaprirla).`, 'Chiudi votazione')) upd({ status: 'closed' }, 'Votazione chiusa'); } }, 'Chiudi votazione'),
    h('button', { class: 'btn ghost', onclick: () => roundSheet(r) }, 'Modifica date'));
  if (r.status === 'closed') actions.append(
    h('button', { class: 'btn ghost', onclick: async () => { await deleteDoc(doc(db, 'rounds', r.id, 'private', 'proposal')); upd({ status: 'voting' }, 'Votazione riaperta'); } }, 'Riapri votazione'),
    h('button', { class: 'btn ghost', onclick: () => roundSheet(r) }, 'Modifica date'));
  if (r.status === 'published') actions.append(
    h('button', { class: 'btn ghost', onclick: async () => { if (await confirmSheet('Archiviare il giro?', 'Le date restano nel calendario, ma il giro sparisce dalle votazioni.', 'Archivia')) upd({ status: 'archived', 'revote.active': false }, 'Giro archiviato'); } }, 'Archivia'));
  if (r.status === 'archived') actions.append(h('button', { class: 'btn ghost', onclick: () => upd({ status: 'published' }, 'Giro ripristinato') }, 'Ripristina'));
  body.push(actions);

  if (r.status !== 'draft') body.push(h('div', { class: 'card', style: { marginTop: '14px' } },
    toggleRow('Mostra i voti alla classe', 'Se attivo, tutti vedono chi ha scelto ogni data (mai la capienza).', r.showVotes, () => upd({ showVotes: !r.showVotes }, r.showVotes ? 'Voti nascosti' : 'Voti visibili alla classe'))));

  // statistiche di voto
  if (['voting', 'closed'].includes(r.status)) {
    const totCap = sorted.reduce((s, d) => s + capOf(r.id, d), 0);
    body.push(h('div', { class: 'section-title' }, 'Votazione'),
      h('div', { class: 'stat' }, h('div', {}, h('b', {}, `${voted.length}/${n}`), h('span', {}, 'hanno votato')), h('div', {}, h('b', {}, totCap), h('span', {}, 'posti totali'))),
      missing.length ? h('details', { class: 'acc', style: { marginTop: '10px' } }, h('summary', {}, `Non hanno ancora votato (${missing.length})`, icon('right', 'chev')),
        h('div', { class: 'acc-b', style: { paddingLeft: '16px' } }, missing.map(id => C.fullName(st(id))).join(', '))) : null);
  }

  // tabella date
  const pubCount = d => roundEvents(r).filter(e => e.date === d && !e.cancelled).reduce((s, e) => s + (e.studentIds || []).length, 0);
  const isCancelled = d => roundEvents(r).some(e => e.date === d && e.cancelled) && !roundEvents(r).some(e => e.date === d && !e.cancelled);
  body.push(h('div', { class: 'section-title' }, 'Date e posti'),
    h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Data'), h('th', {}, 'Posti'),
      ['voting', 'closed'].includes(r.status) ? [h('th', {}, '1ª'), h('th', {}, 'Ris.')] : r.status !== 'draft' ? h('th', {}, 'Assegnati') : null)),
    h('tbody', {}, sorted.map(d => {
      const f = Object.values(votes).filter(v => v.first === d).length, rs = Object.values(votes).filter(v => v.reserve === d).length;
      const capIn = h('input', { class: 'capin', type: 'number', min: '0', inputmode: 'numeric', value: String(capOf(r.id, d)),
        onchange: e => busy(null, () => setDoc(doc(db, 'rounds', r.id, 'private', 'config'), { caps: { [d]: Math.max(0, parseInt(e.target.value, 10) || 0) } }, { merge: true }), 'Posti aggiornati') });
      return h('tr', {}, h('td', {}, h('b', {}, C.fmtShort(d)), isCancelled(d) ? h('span', { class: 'pill danger', style: { marginLeft: '6px' } }, 'Annullata') : null),
        h('td', {}, capIn),
        ['voting', 'closed'].includes(r.status) ? [h('td', { class: 'num' + (f > capOf(r.id, d) ? ' over' : '') }, f), h('td', { class: 'num' }, rs)]
          : r.status !== 'draft' ? h('td', { class: 'num' }, pubCount(d)) : null);
    }))));

  // proposta
  if (r.status === 'closed' && !prop) body.push(h('div', { class: 'section-title' }, 'Sistemazione'),
    h('p', { class: 'muted small', style: { marginBottom: '10px' } }, 'Scegli come procedere. In entrambi i casi vedrai prima un\'ipotesi da controllare: nulla viene pubblicato finché non la accetti.'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn block violet', onclick: e => busy(e.currentTarget, () => makeInitialProposal(r, 'draw'), 'Ipotesi pronta') }, icon('dice'), 'Sorteggio automatico'),
      h('button', { class: 'btn block ghost', onclick: e => busy(e.currentTarget, () => makeInitialProposal(r, 'votes'), 'Ipotesi pronta') }, icon('hand'), 'Sistemo a mano partendo dai voti')));
  if (prop) body.push(proposalEditor(r, prop));

  // rivotazione
  if (r.revote?.active) {
    const rv = r.revote; const rvVoted = (rv.students || []).filter(id => votes[id]?.first);
    body.push(h('div', { class: 'section-title' }, 'Rivotazione in corso'),
      h('div', { class: 'card warn' }, h('p', {}, `Rivotano: ${sortIds(rv.students || []).map(id => C.fullName(st(id))).join(', ')}`),
        h('p', { class: 'small', style: { marginTop: '6px' } }, `Date disponibili: ${(rv.dates || []).map(C.fmtShort).join(', ')} · hanno votato ${rvVoted.length}/${(rv.students || []).length}`),
        h('button', { class: 'btn sm', style: { marginTop: '10px' }, onclick: e => busy(e.currentTarget, () => closeRevote(r), 'Ipotesi pronta') }, 'Chiudi e prepara l\'ipotesi')));
  }

  // date pubblicate
  if (['published', 'archived'].includes(r.status)) {
    body.push(h('div', { class: 'section-title' }, 'Date pubblicate'));
    for (const d of sorted) {
      const evs = roundEvents(r).filter(e => e.date === d);
      if (!evs.length) { body.push(h('div', { class: 'pday' }, h('div', { class: 'pday-h' }, C.cap(C.fmtLong(d)), h('span', { class: 'muted small' }, 'nessuno')))); continue; }
      for (const ev of evs) body.push(h('div', { class: 'pday', style: ev.cancelled ? { opacity: '.6' } : null },
        h('div', { class: 'pday-h' }, h('span', {}, C.cap(C.fmtLong(d)), ev.cancelled ? h('span', { class: 'pill danger', style: { marginLeft: '8px' } }, 'Annullata') : null),
          !ev.cancelled ? h('button', { class: 'btn sm danger-ghost', onclick: () => cancelDaySheet(r, ev) }, 'Annulla giornata') : null),
        h('div', { class: 'chips' }, sortIds(ev.studentIds || []).map(id => h('button', { class: 'chip', onclick: ev.cancelled ? null : () => assignedStudentSheet(ev, id) }, C.fullName(st(id)))))));
    }
    const recs = Object.values(A.recov).filter(x => x.roundId === r.id && x.status === 'open');
    if (recs.length) body.push(h('div', { class: 'card danger', style: { marginTop: '10px' } }, h('b', {}, 'Da recuperare: '), recs.map(x => C.fullName(st(x.uid))).join(', '),
      h('div', { class: 'small' }, 'Assegna le nuove date dalla sezione Richieste.')));
  }
  page(main, hero, body);
}

async function deleteRound(r) {
  if (!await confirmSheet('Eliminare il giro?', 'Il giro in bozza verrà eliminato definitivamente.', 'Elimina', true)) return;
  await busy(null, async () => {
    const b = writeBatch(db);
    b.delete(doc(db, 'rounds', r.id, 'private', 'config')); b.delete(doc(db, 'rounds', r.id, 'private', 'proposal'));
    Object.keys(A.votes[r.id] || {}).forEach(id => b.delete(doc(db, 'rounds', r.id, 'votes', id)));
    b.delete(doc(db, 'rounds', r.id)); await b.commit(); A.roundId = null;
  }, 'Giro eliminato');
}

/* ---------- Proposte ---------- */
function votesMap(r) { const m = {}; for (const [id, v] of Object.entries(A.votes[r.id] || {})) m[id] = { first: v.first, reserve: v.reserve }; return m; }
async function makeInitialProposal(r, mode) {
  const dates = [...r.dates].sort(); const capacity = {}; dates.forEach(d => (capacity[d] = capOf(r.id, d)));
  const args = { studentIds: studentIds(), dates, capacity, votes: votesMap(r), isBlocked: blocker() };
  const res = mode === 'draw' ? C.buildSchedule(args) : C.proposalFromVotes(args);
  await setDoc(doc(db, 'rounds', r.id, 'private', 'proposal'), { mode: 'initial', method: mode, students: studentIds(), dates, ...res, createdAt: serverTimestamp() });
}
async function makeMergeProposal(r, { students, dates, useVotes, cancelledEventId = null }) {
  const capacity = {}; const prefill = {};
  dates.forEach(d => {
    capacity[d] = capOf(r.id, d);
    prefill[d] = roundEvents(r).filter(e => e.date === d && !e.cancelled).reduce((s, e) => s + (e.studentIds || []).filter(id => !students.includes(id)).length, 0);
  });
  const res = C.buildSchedule({ studentIds: students, dates, capacity, prefill, votes: useVotes ? votesMap(r) : {}, isBlocked: blocker() });
  await setDoc(doc(db, 'rounds', r.id, 'private', 'proposal'), { mode: 'merge', method: 'draw', students, dates, prefill, cancelledEventId, ...res, createdAt: serverTimestamp() });
}

function proposalEditor(r, p) {
  const dates = p.dates || [];
  const assigned = (p.mode === 'merge') ? (d => (p.prefill?.[d] || 0) + (p.assign[d] || []).length) : (d => (p.assign[d] || []).length);
  const over = dates.filter(d => assigned(d) > capOf(r.id, d));
  const votes = A.votes[r.id] || {};
  const chip = (id, d) => {
    const how = p.how?.[id]; const v = votes[id];
    const bad = d && reasonsFor(id, d).length;
    return h('button', { class: `chip tag-${how || 'none'}${bad ? ' warn' : ''}`, title: C.HOW_LABEL[how] || '', onclick: () => moveSheet(r, p, id) },
      C.fullName(st(id)), how === 'reserve' ? h('span', { class: 'muted' }, '·R') : how === 'random' || how === 'novote' ? h('span', { class: 'muted' }, '·S') : null,
      p.method === 'votes' && !v?.first ? h('span', { class: 'muted' }, '·NV') : null);
  };
  return h('div', {},
    h('div', { class: 'section-title' }, p.mode === 'merge' ? 'Ipotesi di spostamento' : 'Ipotesi di calendario'),
    h('p', { class: 'muted small', style: { marginBottom: '10px' } }, 'Tocca un nome per spostarlo. Legenda: bordo viola = 1ª scelta, ·R = riserva, ·S = sorteggiato/assegnato d\'ufficio, ·NV = non ha votato, rosso = data bloccata per lui.'),
    over.length ? h('div', { class: 'card danger', style: { marginBottom: '10px' } }, h('b', {}, 'Giorni oltre la capienza: '), over.map(C.fmtShort).join(', ')) : null,
    dates.map(d => {
      const n = assigned(d), cap = capOf(r.id, d);
      return h('div', { class: 'pday' + (n > cap ? ' overfull' : n === cap ? ' full' : '') },
        h('div', { class: 'pday-h' }, h('span', {}, C.cap(C.fmtLong(d))), h('span', { class: 'cnt' }, `${n}/${cap}`)),
        p.prefill?.[d] ? h('div', { class: 'small muted', style: { marginBottom: '6px' } }, `${p.prefill[d]} già assegnati in precedenza`) : null,
        h('div', { class: 'chips' }, sortIds(p.assign[d] || []).map(id => chip(id, d)), !(p.assign[d] || []).length ? h('span', { class: 'small muted' }, 'Vuoto') : null));
    }),
    (p.unassigned || []).length ? h('div', { class: 'pday overfull' }, h('div', { class: 'pday-h' }, 'Non assegnati', h('span', { class: 'cnt' }, p.unassigned.length)),
      h('div', { class: 'chips' }, sortIds(p.unassigned).map(id => chip(id, null)))) : null,
    h('div', { class: 'stack', style: { marginTop: '14px' } },
      h('button', { class: 'btn block lime', onclick: () => acceptProposal(r, p) }, icon('check'), 'Accetta e pubblica'),
      h('button', { class: 'btn block ghost', onclick: e => busy(e.currentTarget, () => p.mode === 'merge'
        ? makeMergeProposal(r, { students: p.students, dates, useVotes: !!r.revote, cancelledEventId: p.cancelledEventId })
        : makeInitialProposal(r, 'draw'), 'Nuovo sorteggio fatto') }, icon('dice'), 'Rifai sorteggio'),
      p.mode === 'initial' ? h('button', { class: 'btn block line', onclick: e => busy(e.currentTarget, () => deleteDoc(doc(db, 'rounds', r.id, 'private', 'proposal')), 'Ipotesi scartata') }, 'Scarta ipotesi') : null));
}

function moveSheet(r, p, id) {
  const cur = Object.keys(p.assign).find(d => (p.assign[d] || []).includes(id)) || null;
  const v = (A.votes[r.id] || {})[id] || {};
  const count = d => (p.prefill?.[d] || 0) + (p.assign[d] || []).length;
  const move = async (target, close) => {
    const assign = {}; for (const d of Object.keys(p.assign)) assign[d] = (p.assign[d] || []).filter(x => x !== id);
    let unassigned = (p.unassigned || []).filter(x => x !== id);
    if (target) assign[target] = [...(assign[target] || []), id]; else unassigned = [...unassigned, id];
    await busy(null, () => updateDoc(doc(db, 'rounds', r.id, 'private', 'proposal'), { assign, unassigned, [`how.${id}`]: 'manual' }), 'Spostato');
    close();
  };
  openSheet(C.fullName(st(id)), close => [
    h('p', { class: 'muted small' }, `1ª scelta: ${v.first ? C.fmtShort(v.first) : '—'} · Riserva: ${v.reserve ? C.fmtShort(v.reserve) : '—'}`),
    h('div', { class: 'section-title' }, 'Sposta in'),
    (p.dates || []).map(d => {
      const rs = reasonsFor(id, d); const n = count(d), cap = capOf(r.id, d);
      return h('button', { class: 'list-item', disabled: d === cur, onclick: () => move(d, close) },
        h('div', { class: 'grow' }, h('div', { class: 't' }, C.cap(C.fmtLong(d)), d === cur ? '  (attuale)' : ''),
          rs.length ? h('div', { class: 's', style: { color: 'var(--danger)' } }, rs.map(x => C.reasonText(x, A.subjects, false)).join('; ')) : null),
        h('span', { class: 'pill ' + (n >= cap ? 'danger' : 'grey') }, `${n}/${cap}`));
    }),
    cur ? h('div', { class: 'actions' }, h('button', { class: 'btn block line', onclick: () => move(null, close) }, 'Togli (non assegnato)')) : null,
  ]);
}

async function acceptProposal(r, p) {
  const un = (p.unassigned || []).length;
  const ok = await confirmSheet('Pubblicare?', (p.mode === 'initial' ? 'Le date verranno pubblicate nel calendario di tutta la classe.' : 'Gli studenti verranno spostati nelle nuove date.')
    + (un ? `<br><br><b>${un} studenti non assegnati</b> finiranno nell'elenco "Da recuperare".` : ''), 'Pubblica');
  if (!ok) return;
  await busy(null, async () => {
    const b = writeBatch(db);
    for (const d of p.dates) {
      const ids = p.assign[d] || []; if (!ids.length) continue;
      const existing = p.mode === 'merge' ? roundEvents(r).find(e => e.date === d && !e.cancelled) : null;
      if (existing) b.update(doc(db, 'events', existing.id), { studentIds: [...new Set([...(existing.studentIds || []), ...ids])] });
      else b.set(doc(collection(db, 'events')), { type: 'interrogazione', subjectId: r.subjectId, date: d, studentIds: ids, roundId: r.id, cancelled: false, createdAt: serverTimestamp() });
    }
    for (const id of p.unassigned || []) b.set(doc(collection(db, 'recoveries')), { uid: id, subjectId: r.subjectId, roundId: r.id, fromDate: null, status: 'open', createdAt: serverTimestamp() });
    if (p.mode === 'initial') b.update(doc(db, 'rounds', r.id), { status: 'published' });
    else if (r.revote) b.update(doc(db, 'rounds', r.id), { revote: deleteField() });
    b.delete(doc(db, 'rounds', r.id, 'private', 'proposal'));
    await b.commit();
  }, 'Pubblicato');
}

/* ---------- Annulla giornata / rivotazione ---------- */
function cancelDaySheet(r, ev) {
  const today = C.todayISO();
  const others = (r.dates || []).filter(d => d !== ev.date && d >= today && !roundEvents(r).some(e => e.date === d && e.cancelled && !roundEvents(r).some(x => x.date === d && !x.cancelled))).sort();
  const extra = h('input', { type: 'date', min: today });
  const names = sortIds(ev.studentIds || []).map(id => C.fullName(st(id))).join(', ');
  openSheet('Annulla ' + C.fmtLong(ev.date), close => [
    h('p', { class: 'muted' }, `Interrogati coinvolti: ${names || 'nessuno'}.`),
    h('label', { class: 'field', style: { marginTop: '14px' } }, h('span', {}, 'Aggiungi una nuova data al giro (facoltativo)'), extra),
    h('p', { class: 'small muted' }, `Date rimaste: ${others.map(C.fmtShort).join(', ') || 'nessuna'}`),
    h('div', { class: 'actions' },
      h('button', { class: 'btn block violet', onclick: e => busy(e.currentTarget, () => doCancel(r, ev, others, extra.value, 'auto'), 'Ipotesi di spostamento pronta').then(close).catch(() => {}) }, icon('dice'), 'Sposta automaticamente'),
      h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, () => doCancel(r, ev, others, extra.value, 'revote'), 'Rivotazione aperta').then(close).catch(() => {}) }, icon('vote'), 'Rivotazione solo per loro')),
  ]);
}
async function doCancel(r, ev, others, extra, mode) {
  if (extra && C.isWeekend(extra)) throw new Error('Sabato e domenica non si va a scuola');
  const dates = [...new Set([...others, ...(extra ? [extra] : [])])].sort();
  if (!dates.length) throw new Error('Non ci sono altre date: aggiungine una');
  const students = [...(ev.studentIds || [])];
  const b = writeBatch(db);
  b.update(doc(db, 'events', ev.id), { cancelled: true });
  if (extra) b.update(doc(db, 'rounds', r.id), { dates: [...new Set([...(r.dates || []), extra])].sort() });
  if (mode === 'revote') {
    b.update(doc(db, 'rounds', r.id), { revote: { active: true, students, dates } });
    students.forEach(id => b.delete(doc(db, 'rounds', r.id, 'votes', id)));
  }
  await b.commit();
  if (mode === 'auto') {
    A.events[ev.id] = { ...ev, cancelled: true }; // aggiornamento locale immediato per il calcolo
    await makeMergeProposal(r, { students, dates, useVotes: false, cancelledEventId: ev.id });
  }
}
async function closeRevote(r) {
  const rv = r.revote;
  await updateDoc(doc(db, 'rounds', r.id), { 'revote.active': false });
  await makeMergeProposal(r, { students: rv.students, dates: rv.dates, useVotes: true });
}

/* ---------- Studente assegnato: sposta / da recuperare ---------- */
function assignedStudentSheet(ev, id) {
  const r = A.rounds[ev.roundId];
  openSheet(C.fullName(st(id)), close => [
    h('p', { class: 'muted' }, `${subjName(A.subjects, ev.subjectId)} · ${C.fmtLong(ev.date)}`),
    r ? [h('div', { class: 'section-title' }, 'Sposta in un altro giorno del giro'),
      (r.dates || []).filter(d => d !== ev.date).sort().map(d => {
        const tgt = roundEvents(r).find(e => e.date === d && !e.cancelled);
        const n = (tgt?.studentIds || []).length; const rs = reasonsFor(id, d, [ev.id]);
        return h('button', { class: 'list-item', onclick: e => busy(e.currentTarget, async () => {
          const b = writeBatch(db);
          b.update(doc(db, 'events', ev.id), { studentIds: (ev.studentIds || []).filter(x => x !== id) });
          if (tgt) b.update(doc(db, 'events', tgt.id), { studentIds: [...new Set([...(tgt.studentIds || []), id])] });
          else b.set(doc(collection(db, 'events')), { type: 'interrogazione', subjectId: ev.subjectId, date: d, studentIds: [id], roundId: r.id, cancelled: false, createdAt: serverTimestamp() });
          await b.commit();
        }, 'Spostato').then(close).catch(() => {}) },
        h('div', { class: 'grow' }, h('div', { class: 't' }, C.cap(C.fmtLong(d))), rs.length ? h('div', { class: 's', style: { color: 'var(--danger)' } }, rs.map(x => C.reasonText(x, A.subjects, false)).join('; ')) : null),
        h('span', { class: 'pill ' + (n >= capOf(r.id, d) ? 'danger' : 'grey') }, `${n}/${capOf(r.id, d)}`));
      })] : null,
    h('div', { class: 'actions' },
      h('button', { class: 'btn block danger-ghost', onclick: async () => {
        if (!await confirmSheet('Segnare da recuperare?', 'Da usare solo in casi gravi. Lo studente esce da questa data e finisce nell\'elenco "Da recuperare".', 'Segna da recuperare', true)) return;
        await busy(null, async () => {
          const b = writeBatch(db);
          b.update(doc(db, 'events', ev.id), { studentIds: (ev.studentIds || []).filter(x => x !== id) });
          b.set(doc(collection(db, 'recoveries')), { uid: id, subjectId: ev.subjectId, roundId: ev.roundId || null, fromDate: ev.date, fromEventId: ev.id, status: 'open', createdAt: serverTimestamp() });
          await b.commit();
        }, 'Segnato da recuperare'); close();
      } }, 'Segna da recuperare'),
      !r ? h('button', { class: 'btn block line', onclick: e => busy(e.currentTarget, () => updateDoc(doc(db, 'events', ev.id), { studentIds: (ev.studentIds || []).filter(x => x !== id) }), 'Rimosso').then(close).catch(() => {}) }, 'Togli da questo evento') : null),
  ]);
}

/* =========================================================
   CALENDARIO
   ========================================================= */
function renderCal(main) {
  clearFab();
  const { hero, body } = calendar({ state: A.cal, events: events(), students: A.students, subjects: A.subjects, me: null, onChange: render, onEventClick: adminEventSheet });
  page(main, hero, body);
  fab('Aggiungi evento', () => eventSheet(A.cal.sel));
}
function adminEventSheet(ev) {
  const r = ev.roundId ? A.rounds[ev.roundId] : null;
  openSheet(subjName(A.subjects, ev.subjectId), close => [
    h('div', { class: 'row wrap' }, h('span', { class: 'pill', style: { background: subjColor(A.subjects, ev.subjectId) } }, ev.type === 'verifica' ? 'Verifica in classe' : 'Interrogazione'),
      ev.cancelled ? h('span', { class: 'pill danger' }, 'Annullata') : null, r ? h('span', { class: 'pill grey' }, roundTitle(r)) : h('span', { class: 'pill grey' }, 'Inserita a mano')),
    h('p', { style: { marginTop: '12px', fontWeight: '700', fontSize: '17px' } }, C.cap(C.fmtLong(ev.date))),
    ev.note ? h('p', { class: 'muted' }, ev.note) : null,
    h('div', { class: 'section-title' }, ev.type === 'verifica' ? `Assegnata a (${(ev.studentIds || []).length})` : 'Interrogati'),
    ev.type === 'verifica' ? h('p', { class: 'small' }, sortIds(ev.studentIds || []).map(id => C.fullName(st(id))).join(', ') || 'Nessuno')
      : h('div', { class: 'chips' }, sortIds(ev.studentIds || []).map(id => h('button', { class: 'chip', onclick: ev.cancelled ? null : () => { close(); assignedStudentSheet(ev, id); } }, C.fullName(st(id))))),
    h('div', { class: 'actions' },
      r && !ev.cancelled ? h('button', { class: 'btn block danger-ghost', onclick: () => { close(); cancelDaySheet(r, ev); } }, 'Annulla giornata') : null,
      r ? h('button', { class: 'btn block ghost', onclick: () => { close(); A.tab = 'giri'; A.roundId = r.id; render(); } }, 'Apri il giro') : null,
      !r || ev.cancelled ? h('button', { class: 'btn block danger', onclick: async () => { if (await confirmSheet('Eliminare l\'evento?', 'Sparirà dal calendario di tutti.', 'Elimina', true)) { await busy(null, () => deleteDoc(doc(db, 'events', ev.id)), 'Evento eliminato'); close(); } } }, icon('trash'), 'Elimina evento') : null),
  ]);
}
function eventSheet(date) {
  if (!Object.keys(A.subjects).length) { toast('Crea prima una materia (sezione Altro)', 'error'); return; }
  let type = 'verifica'; const sel = new Set();
  const subj = h('select', {}, Object.values(A.subjects).sort((a, b) => a.name.localeCompare(b.name)).map(s => h('option', { value: s.id }, s.name)));
  const dateIn = h('input', { type: 'date', value: date });
  const note = h('input', { type: 'text', placeholder: 'Facoltativa (es. capitoli 3-4)' });
  openSheet('Nuovo evento', (close, refill) => {
    dateIn.onchange = refill;
    const ids = studentIds(); const all = ids.length && ids.every(id => sel.has(id));
    return [
      h('div', { class: 'seg light', style: { marginBottom: '14px' } },
        h('button', { class: type === 'verifica' ? 'active' : '', onclick: () => { type = 'verifica'; refill(); } }, 'Verifica'),
        h('button', { class: type === 'interrogazione' ? 'active' : '', onclick: () => { type = 'interrogazione'; refill(); } }, 'Interrogazione singola')),
      h('p', { class: 'small muted', style: { marginBottom: '12px' } }, type === 'verifica' ? 'Solo promemoria: la vedono gli studenti assegnati e non blocca nessuna data.' : 'Compare nel calendario di tutti e blocca il giorno prima e dopo per gli studenti scelti.'),
      h('label', { class: 'field' }, h('span', {}, 'Materia'), subj),
      h('label', { class: 'field' }, h('span', {}, 'Data'), dateIn),
      h('label', { class: 'field' }, h('span', {}, 'Nota'), note),
      h('div', { class: 'row', style: { justifyContent: 'space-between', margin: '8px 0 4px' } }, h('b', {}, `Studenti (${sel.size})`),
        h('button', { class: 'btn sm ghost', onclick: () => { all ? sel.clear() : ids.forEach(id => sel.add(id)); refill(); } }, all ? 'Nessuno' : 'Tutta la classe')),
      ids.map(id => {
        const warn = type === 'interrogazione' && dateIn.value ? reasonLine(id, dateIn.value) : '';
        return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: sel.has(id), onchange: e => { e.target.checked ? sel.add(id) : sel.delete(id); refill(); } }),
          h('div', { class: 'grow' }, h('div', {}, C.fullName(st(id))), warn ? h('div', { class: 's' }, warn) : null));
      }),
      h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => {
        if (!dateIn.value) throw new Error('Scegli una data');
        if (C.isWeekend(dateIn.value)) throw new Error('Sabato e domenica non si va a scuola');
        if (!sel.size) throw new Error('Scegli almeno uno studente');
        await addDoc(collection(db, 'events'), { type, subjectId: subj.value, date: dateIn.value, studentIds: [...sel], roundId: null, cancelled: false, note: note.value.trim(), createdAt: serverTimestamp() });
        A.cal.sel = dateIn.value;
      }, 'Evento aggiunto').then(close).catch(() => {}) }, 'Salva')),
    ];
  });
}

/* =========================================================
   STUDENTI
   ========================================================= */
function renderStudents(main) {
  clearFab();
  const ids = studentIds();
  page(main, [h('h1', {}, 'Studenti'), h('p', { class: 'sub' }, `${ids.length} account nella classe`)], [
    ids.length ? ids.map(id => {
      const s = st(id); const ex = Object.keys(A.excl[id] || {}).filter(d => d >= C.todayISO()).length;
      return h('button', { class: 'list-item', onclick: () => studentSheet(id) }, h('span', { class: 'av' }, C.initials(s)),
        h('div', { class: 'grow' }, h('div', { class: 't' }, C.fullName(s)), h('div', { class: 's' }, s.username, ex ? ` · ${ex} giorni esclusi` : '', s.rulesAccepted ? '' : ' · regole non lette')),
        icon('right', 'chev'));
    }) : h('div', { class: 'empty' }, h('b', {}, 'Nessuno studente'), 'Aggiungi la classe con il pulsante +.'),
  ]);
  fab('Aggiungi studenti', addStudentsSheet);
}
function addStudentsSheet() {
  const ta = h('textarea', { placeholder: 'Mario Rossi\nGiulia Bianchi\nMaria Grazia, De Luca' });
  let results = null;
  openSheet('Aggiungi studenti', (close, refill) => results ? [
    h('p', { class: 'muted' }, 'Fatto. Ecco i nomi utente creati: la password iniziale segue la regola stabilita, non la riporto qui.'),
    results.map(x => h('div', { class: 'list-item' }, h('div', { class: 'grow' }, h('div', { class: 't' }, x.name), h('div', { class: 's mono' }, x.username || '')),
      h('span', { class: 'pill ' + (x.ok ? 'ok' : 'danger') }, x.ok ? (x.note || 'Creato') : x.err))),
    h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: close }, 'Chiudi')),
  ] : [
    h('p', { class: 'muted small', style: { marginBottom: '10px' } }, 'Uno per riga, "Nome Cognome". Per cognomi o nomi composti usa la virgola: "Maria Grazia, De Luca".'),
    ta,
    h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: async e => {
      const lines = ta.value.split('\n').map(C.parseStudentLine).filter(Boolean);
      if (!lines.length) return toast('Scrivi almeno un nome', 'error');
      const btn = e.currentTarget; btn.disabled = true;
      const taken = new Set(Object.values(A.students).map(s => s.username)); results = [];
      for (const [i, p] of lines.entries()) {
        btn.textContent = `Creo ${i + 1} di ${lines.length}…`;
        const username = C.uniqueUsername(C.baseUsername(p.first, p.last), taken);
        const pw = C.initialPassword(username);
        try {
          const uid = await createStudentAccount(C.emailOf(username), pw);
          await setDoc(doc(db, 'students', uid), { first: p.first, last: p.last, username, rulesAccepted: false, createdAt: serverTimestamp() });
          taken.add(username);
          results.push({ name: `${p.first} ${p.last}`, username, ok: true, note: username !== C.baseUsername(p.first, p.last) ? 'Omonimo: numero aggiunto' : pw !== username ? 'Password speciale (nome corto)' : null });
        } catch (x) { console.error(x); results.push({ name: `${p.first} ${p.last}`, username, ok: false, err: errMsg(x) }); }
      }
      refill();
    } }, 'Crea account')),
  ]);
}
function studentSheet(id) {
  const s = st(id); const today = C.todayISO();
  const dIn = h('input', { type: 'date', min: today }); const nIn = h('input', { type: 'text', placeholder: 'Motivo (facoltativo, lo vede solo lui)' });
  openSheet(C.fullName(s), close => {
    const ex = Object.entries(A.excl[id] || {}).sort(([a], [b]) => a.localeCompare(b));
    const mine = events().filter(e => (e.studentIds || []).includes(id) && e.date >= today && !e.cancelled).sort((a, b) => a.date.localeCompare(b.date));
    const recs = Object.values(A.recov).filter(r => r.uid === id && r.status === 'open');
    return [
      h('p', { class: 'muted' }, h('span', { class: 'mono' }, s.username), s.rulesAccepted ? ' · regole lette' : ' · regole non ancora lette'),
      h('div', { class: 'section-title' }, 'Prossimi impegni'),
      mine.length ? mine.map(e => h('div', { class: 'list-item' }, h('span', { class: 'sdot', style: { '--c': subjColor(A.subjects, e.subjectId) } }),
        h('div', { class: 'grow' }, h('div', { class: 't' }, subjName(A.subjects, e.subjectId)), h('div', { class: 's' }, `${e.type === 'verifica' ? 'Verifica' : 'Interrogazione'} · ${C.fmtLong(e.date)}`))))
        : h('p', { class: 'small muted' }, 'Nessuno'),
      recs.length ? h('div', { class: 'card danger', style: { marginTop: '8px' } }, 'Da recuperare: ', recs.map(r => subjName(A.subjects, r.subjectId)).join(', ')) : null,
      h('div', { class: 'section-title' }, 'Giorni esclusi'),
      h('p', { class: 'small muted', style: { marginBottom: '8px' } }, 'Assenze o motivi personali: in queste date non può essere messo. Gli altri non le vedono.'),
      ex.length ? ex.map(([d, n]) => h('div', { class: 'list-item' }, h('div', { class: 'grow' }, h('div', { class: 't' }, C.cap(C.fmtLong(d))), n ? h('div', { class: 's' }, n) : null),
        h('button', { class: 'iconbtn', style: { background: 'var(--danger-soft)', color: 'var(--danger)' }, 'aria-label': 'Rimuovi', onclick: e => busy(e.currentTarget, () => updateDoc(doc(db, 'exclusions', id), { [`dates.${d}`]: deleteField() }), 'Esclusione rimossa') }, icon('trash'))))
        : h('p', { class: 'small muted' }, 'Nessuno'),
      h('div', { class: 'row', style: { marginTop: '10px', alignItems: 'stretch' } }, h('div', { class: 'grow' }, dIn), h('button', { class: 'btn ghost', onclick: e => busy(e.currentTarget, async () => {
        if (!dIn.value) throw new Error('Scegli una data');
        await setDoc(doc(db, 'exclusions', id), { dates: { [dIn.value]: nIn.value.trim() } }, { merge: true });
        const clash = events().find(ev => ev.type === 'interrogazione' && !ev.cancelled && ev.date === dIn.value && (ev.studentIds || []).includes(id));
        if (clash) toast('Attenzione: ha già un\'interrogazione in quella data', 'error');
        dIn.value = ''; nIn.value = '';
      }, 'Giorno escluso') }, icon('plus'), 'Escludi')),
      h('div', { style: { marginTop: '8px' } }, nIn),
      h('div', { class: 'actions' }, h('button', { class: 'btn block danger-ghost', onclick: async () => {
        if (!await confirmSheet('Rimuovere lo studente?', `${C.fullName(s)} sparirà dalla classe e non potrà più usare il sito. <br><br>Per liberare del tutto il nome utente elimina anche l'account da Firebase Console → Authentication.`, 'Rimuovi', true)) return;
        await busy(null, async () => { const b = writeBatch(db); b.delete(doc(db, 'students', id)); b.delete(doc(db, 'exclusions', id)); await b.commit(); }, 'Studente rimosso'); close();
      } }, 'Rimuovi studente')),
    ];
  });
}

/* =========================================================
   RICHIESTE (scambi + da recuperare)
   ========================================================= */
function renderRequests(main) {
  clearFab();
  const pend = Object.values(A.swaps).filter(s => s.status === 'pending_admin');
  const peer = Object.values(A.swaps).filter(s => s.status === 'pending_peer');
  const recs = Object.values(A.recov).filter(r => r.status === 'open');
  page(main, [h('h1', {}, 'Richieste'), h('p', { class: 'sub' }, 'Scambi da approvare e interrogazioni da recuperare.')], [
    h('div', { class: 'section-title' }, `Scambi da approvare (${pend.length})`),
    pend.length ? pend.map(swapCard) : h('p', { class: 'small muted' }, 'Nessuno scambio in attesa.'),
    peer.length ? [h('div', { class: 'section-title' }, 'In attesa del compagno'), peer.map(s => h('div', { class: 'card' }, h('div', { class: 'small' },
      `${C.fullName(st(s.fromUid))} → ${C.fullName(st(s.toUid))} · ${subjName(A.subjects, s.subjectId)} · ${C.fmtShort(s.fromDate)} ⇄ ${C.fmtShort(s.toDate)}`)))] : null,
    h('div', { class: 'section-title' }, `Da recuperare (${recs.length})`),
    recs.length ? recs.map(r => h('div', { class: 'card' }, h('div', { class: 'row' }, h('span', { class: 'sdot', style: { '--c': subjColor(A.subjects, r.subjectId) } }),
      h('div', { class: 'grow' }, h('h3', {}, C.fullName(st(r.uid))), h('div', { class: 'small muted' }, subjName(A.subjects, r.subjectId), r.fromDate ? ` · era il ${C.fmtShort(r.fromDate)}` : ' · non assegnato')),
      h('button', { class: 'btn sm', onclick: () => recoverSheet(r) }, 'Assegna data'))))
      : h('p', { class: 'small muted' }, 'Nessuno da recuperare.'),
  ]);
}
function swapCard(s) {
  const evA = A.events[s.fromEventId], evB = A.events[s.toEventId];
  const valid = evA && evB && !evA.cancelled && !evB.cancelled && (evA.studentIds || []).includes(s.fromUid) && (evB.studentIds || []).includes(s.toUid);
  const rA = reasonLine(s.fromUid, s.toDate, [s.fromEventId]), rB = reasonLine(s.toUid, s.fromDate, [s.toEventId]);
  return h('div', { class: 'card white' },
    h('div', { class: 'small muted', style: { fontWeight: '700' } }, subjName(A.subjects, s.subjectId)),
    h('p', { style: { marginTop: '6px' } }, h('b', {}, C.fullName(st(s.fromUid))), ` passa da ${C.fmtShort(s.fromDate)} a ${C.fmtShort(s.toDate)}`),
    rA ? h('div', { class: 'small', style: { color: 'var(--danger)' } }, rA) : null,
    h('p', { style: { marginTop: '4px' } }, h('b', {}, C.fullName(st(s.toUid))), ` passa da ${C.fmtShort(s.toDate)} a ${C.fmtShort(s.fromDate)}`),
    rB ? h('div', { class: 'small', style: { color: 'var(--danger)' } }, rB) : null,
    !valid ? h('div', { class: 'card danger', style: { marginTop: '8px' } }, 'Le date sono cambiate dopo la richiesta: non è più applicabile.') : null,
    h('div', { class: 'row', style: { marginTop: '12px' } },
      valid ? h('button', { class: 'btn sm lime grow', onclick: e => busy(e.currentTarget, async () => {
        const b = writeBatch(db);
        b.update(doc(db, 'events', evA.id), { studentIds: [...(evA.studentIds || []).filter(x => x !== s.fromUid), s.toUid] });
        b.update(doc(db, 'events', evB.id), { studentIds: [...(evB.studentIds || []).filter(x => x !== s.toUid), s.fromUid] });
        b.update(doc(db, 'swaps', s.id), { status: 'approved', updatedAt: serverTimestamp() });
        await b.commit();
      }, 'Scambio approvato') }, 'Approva') : null,
      h('button', { class: 'btn sm ghost grow', onclick: e => busy(e.currentTarget, () => updateDoc(doc(db, 'swaps', s.id), { status: 'rejected', updatedAt: serverTimestamp() }), 'Scambio rifiutato') }, 'Rifiuta')));
}
function recoverSheet(rec) {
  const dIn = h('input', { type: 'date', min: C.todayISO() });
  const r = rec.roundId ? A.rounds[rec.roundId] : null;
  openSheet('Recupero di ' + C.fullName(st(rec.uid)), (close, refill) => {
    const d = dIn.value; const rs = d ? reasonsFor(rec.uid, d) : [];
    const joinable = d ? events().find(e => e.type === 'interrogazione' && !e.cancelled && e.date === d && e.subjectId === rec.subjectId) : null;
    const assign = async (date, existing) => {
      const b = writeBatch(db);
      if (existing) b.update(doc(db, 'events', existing.id), { studentIds: [...new Set([...(existing.studentIds || []), rec.uid])] });
      else b.set(doc(collection(db, 'events')), { type: 'interrogazione', subjectId: rec.subjectId, date, studentIds: [rec.uid], roundId: rec.roundId || null, cancelled: false, note: 'Recupero', createdAt: serverTimestamp() });
      b.update(doc(db, 'recoveries', rec.id), { status: 'done', toDate: date, updatedAt: serverTimestamp() });
      await b.commit();
    };
    const quick = r ? (r.dates || []).filter(x => x >= C.todayISO()).sort() : [];
    return [
      h('p', { class: 'muted' }, subjName(A.subjects, rec.subjectId)),
      quick.length ? [h('div', { class: 'section-title' }, 'Date del giro'), quick.map(x => {
        const ex = roundEvents(r).find(e => e.date === x && !e.cancelled); const rr = reasonsFor(rec.uid, x);
        return h('button', { class: 'list-item', onclick: e => busy(e.currentTarget, () => assign(x, ex), 'Data assegnata').then(close).catch(() => {}) },
          h('div', { class: 'grow' }, h('div', { class: 't' }, C.cap(C.fmtLong(x))), rr.length ? h('div', { class: 's', style: { color: 'var(--danger)' } }, rr.map(y => C.reasonText(y, A.subjects, false)).join('; ')) : null),
          h('span', { class: 'pill grey' }, `${(ex?.studentIds || []).length}/${capOf(r.id, x)}`));
      })] : null,
      h('div', { class: 'section-title' }, 'Oppure un\'altra data'),
      h('div', { onchange: refill }, dIn),
      d && C.isWeekend(d) ? h('p', { class: 'small', style: { color: 'var(--danger)', marginTop: '6px' } }, 'È un giorno di weekend') : null,
      rs.length ? h('p', { class: 'small', style: { color: 'var(--danger)', marginTop: '6px' } }, rs.map(y => C.reasonText(y, A.subjects, false)).join('; ')) : null,
      d && !C.isWeekend(d) ? h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, () => assign(d, joinable), 'Data assegnata').then(close).catch(() => {}) },
        joinable ? `Aggiungi agli interrogati del ${C.fmtShort(d)}` : `Crea interrogazione il ${C.fmtShort(d)}`)) : null,
    ];
  });
}

/* =========================================================
   ALTRO (materie, account)
   ========================================================= */
function renderMore(main) {
  clearFab();
  const subs = Object.values(A.subjects).sort((a, b) => a.name.localeCompare(b.name));
  page(main, [h('h1', {}, 'Altro'), h('p', { class: 'sub' }, 'Materie e impostazioni')], [
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'section-title', style: { margin: '2px' } }, 'Materie'),
      h('button', { class: 'btn sm', onclick: () => subjectSheet() }, icon('plus'), 'Nuova')),
    subs.length ? subs.map(s => h('button', { class: 'list-item', onclick: () => subjectSheet(s) }, h('span', { class: 'sdot', style: { '--c': s.color, width: '22px', height: '22px', borderRadius: '8px' } }),
      h('div', { class: 'grow' }, h('div', { class: 't' }, s.name)), icon('right', 'chev')))
      : h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Nessuna materia. Creane una per iniziare.'),
    h('div', { class: 'section-title' }, 'Sito'),
    h('a', { class: 'list-item', href: '../', target: '_blank', style: { color: 'inherit', textDecoration: 'none' } }, icon('ext'), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Apri il sito studenti'))),
    h('button', { class: 'list-item', onclick: async () => { if (await confirmSheet('Uscire?', 'Dovrai rientrare con le credenziali admin.', 'Esci')) signOut(auth); } }, icon('logout'), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Esci'))),
  ]);
}
function subjectSheet(s = null) {
  let color = s?.color || C.PALETTE[Object.keys(A.subjects).length % C.PALETTE.length];
  const name = h('input', { type: 'text', value: s?.name || '', placeholder: 'es. Storia' });
  openSheet(s ? 'Modifica materia' : 'Nuova materia', (close, refill) => [
    h('label', { class: 'field' }, h('span', {}, 'Nome'), name),
    h('div', { class: 'field' }, h('span', { class: 'small', style: { fontWeight: '700', color: 'var(--muted)', display: 'block', marginBottom: '8px' } }, 'Colore nel calendario'),
      h('div', { class: 'palette' }, C.PALETTE.map(c => h('button', { class: c === color ? 'on' : '', style: { '--c': c }, 'aria-label': c, onclick: () => { color = c; refill(); } })))),
    h('div', { class: 'ev', style: { '--c': color, marginTop: '6px' } }, h('div', { class: 'ev-top' }, h('span', { class: 'ev-type' }, 'Anteprima')), h('h3', {}, name.value || 'Materia')),
    h('div', { class: 'actions' },
      h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => {
        const n = name.value.trim(); if (!n) throw new Error('Scrivi il nome della materia');
        if (s) await updateDoc(doc(db, 'subjects', s.id), { name: n, color }); else await addDoc(collection(db, 'subjects'), { name: n, color });
      }, 'Materia salvata').then(close).catch(() => {}) }, 'Salva'),
      s ? h('button', { class: 'btn block danger-ghost', onclick: async () => {
        const used = events().some(e => e.subjectId === s.id) || Object.values(A.rounds).some(r => r.subjectId === s.id);
        if (used) return toast('Materia in uso in eventi o giri: non si può eliminare', 'error');
        if (await confirmSheet('Eliminare la materia?', '', 'Elimina', true)) { await busy(null, () => deleteDoc(doc(db, 'subjects', s.id)), 'Materia eliminata'); close(); }
      } }, 'Elimina') : null),
  ]);
}
