import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, createStudentAccount,
  createUserWithEmailAndPassword, deleteUser, updatePassword, reauthenticateWithCredential, EmailAuthProvider, where,
  collection, doc, onSnapshot, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, writeBatch, serverTimestamp, deleteField,
  arrayUnion, query, limit,
} from './firebase.js?v=10';
import * as C from './core.js?v=10';
import {
  h, icon, toast, errMsg, openSheet, confirmSheet, busy, renderLogin, renderLoader, shell, page, avatar,
  subjColor, subjName, calendar, toggleRow, weekGrid, cellName, cellColor, mark, drawShow, stepsSheet, store, esc, daySchedule,
} from './ui.js?v=10';

const root = document.getElementById('app');
// Classe su cui si sta lavorando: tutti i suoi dati stanno in classes/{cid}/…
let CID = null;
const cref = (...p) => collection(db, 'classes', CID, ...p);
const dref = (...p) => doc(db, 'classes', CID, ...p);
const CID_KEY = 'interrogo.admin.cid';
const TUT_KEY = 'interrogo.admin.tutorial.v10';
const A = fresh();
function classData() {
  return {
    students: {}, subjects: {}, events: {}, rounds: {}, configs: {}, proposals: {}, votes: {},
    excl: {}, swaps: {}, recov: {}, tt: null, ttChanges: null, unlockReqs: {}, ready: new Set(),
  };
}
function fresh() {
  return {
    uid: null, role: null, me: null, classes: {}, members: {}, classAdmins: {}, gready: new Set(), legacy: false, ...classData(),
    tab: 'giri', roundId: null, more: null, ttDay: C.isWeekend(C.todayISO()) ? '1' : C.weekdayOf(C.todayISO()), cal: { view: 'week', sel: C.nextWeekday(C.todayISO()), filter: 'all' },
  };
}
let unsubs = [], classUnsubs = [], roundSubs = {};

/* ---------- Auth ---------- */
/* Ruoli: 'super' = admins/{uid} (gestisce tutta la scuola ed entra in ogni classe)
          'class' = classAdmins/{uid} (gestisce solo la sua classe, dopo l'approvazione del super admin) */
renderLoader(root);
let signingUp = false; // durante l'iscrizione l'account esiste prima dei suoi documenti: aspetto
onAuthStateChanged(auth, user => { if (!signingUp) route(user); });
async function route(user) {
  stopAll(); Object.assign(A, fresh());
  if (!user) return showLogin();
  try {
    if ((await getDoc(doc(db, 'admins', user.uid))).exists()) { A.uid = user.uid; A.role = 'super'; return startSuper(); }
    const ca = await getDoc(doc(db, 'classAdmins', user.uid));
    if (ca.exists() && ca.data().classId) { A.uid = user.uid; A.role = 'class'; A.me = ca.data(); return startClassAdmin(ca.data().classId); }
  } catch (e) { console.error(e); }
  notAdmin();
}
const isSuper = () => A.role === 'super';
const linkStyle = { display: 'block', textAlign: 'center', marginTop: '14px', color: 'rgba(19,19,23,.6)', fontWeight: '700' };
function showLogin() {
  renderLogin(root, {
    title: 'Pannello admin', sub: C.APP_NAME + ' · gestione della classe', placeholder: 'nome utente',
    onSubmit: (u, p) => signInWithEmailAndPassword(auth, C.emailOf(u), p),
    footer: [
      h('button', { class: 'btn block ghost', style: { marginTop: '14px', background: 'rgba(255,255,255,.6)' }, onclick: renderSignup }, icon('plus'), 'Crea un account admin per la tua classe'),
      h('a', { href: '../', class: 'small', style: linkStyle }, 'Vai al sito studenti'),
    ],
  });
}
/* Iscrizione: crea l'account admin e la sua classe, che resta in attesa finché il super admin non la approva */
function renderSignup() {
  const cls = h('input', { type: 'text', placeholder: 'es. 4A', maxlength: '20', autocomplete: 'off' });
  const name = h('input', { type: 'text', placeholder: 'es. Mario Rossi', maxlength: '60', autocomplete: 'name' });
  const user = h('input', { type: 'text', placeholder: 'es. admin.4a', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', autocomplete: 'username' });
  const pw = h('input', { type: 'password', autocomplete: 'new-password' }), pw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const err = h('div', { class: 'err' });
  const btn = h('button', { class: 'btn block', type: 'submit' }, 'Crea account e classe');
  const form = h('form', { class: 'login-form', onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    const c = cls.value.trim().replace(/\s+/g, ' '), n = name.value.trim().replace(/\s+/g, ' '), u = user.value.trim().toLowerCase();
    if (!c || !n || !u) return (err.textContent = 'Compila tutti i campi');
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(u)) return (err.textContent = 'Nome utente: almeno 3 caratteri, solo lettere minuscole, numeri, punto o trattino');
    if (pw.value.length < 6) return (err.textContent = 'La password deve avere almeno 6 caratteri');
    if (pw.value !== pw2.value) return (err.textContent = 'Le due password non coincidono');
    btn.disabled = true; btn.textContent = 'Creo l\'account…'; signingUp = true;
    let cred = null;
    try {
      cred = await createUserWithEmailAndPassword(auth, C.emailOf(u), pw.value);
      const uid = cred.user.uid; const cid = doc(collection(db, 'classes')).id;
      const b = writeBatch(db);
      b.set(doc(db, 'classes', cid), { name: c, status: 'pending', adminUid: uid, adminName: n, adminUsername: u, createdAt: serverTimestamp() });
      b.set(doc(db, 'classAdmins', uid), { classId: cid, username: u, name: n, createdAt: serverTimestamp() });
      await b.commit();
      signingUp = false; route(auth.currentUser);
    } catch (x) {
      console.error(x);
      if (cred) { try { await deleteUser(cred.user); } catch (y) { console.error(y); } }
      signingUp = false;
      err.textContent = /email-already-in-use/.test(x?.code || '') ? 'Questo nome utente è già usato: scegline un altro' : errMsg(x);
      btn.disabled = false; btn.textContent = 'Crea account e classe';
    }
  } },
  h('label', { class: 'field' }, h('span', {}, 'Nome della classe'), cls),
  h('label', { class: 'field' }, h('span', {}, 'Il tuo nome e cognome'), name),
  h('label', { class: 'field' }, h('span', {}, 'Nome utente per entrare'), user),
  h('label', { class: 'field' }, h('span', {}, 'Password'), pw),
  h('label', { class: 'field' }, h('span', {}, 'Ripeti la password'), pw2),
  h('p', { class: 'small muted', style: { marginBottom: '12px' } }, 'La classe parte vuota e resta in attesa finché l\'amministratore della scuola non la approva.'),
  btn, err);
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('div', { class: 'logo' }, mark(34)), h('h1', {}, 'Nuovo admin'), h('p', { class: 'sub' }, 'Crea il tuo account e la classe che gestirai.'), form,
    h('button', { class: 'small', style: { ...linkStyle, width: '100%' }, onclick: showLogin }, 'Ho già un account: accedi'))));
}
/* Classe in attesa di approvazione o rifiutata */
function renderWaiting(k) {
  const rejected = k?.status === 'rejected';
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('div', { class: 'logo' }, mark(34)),
    h('h1', {}, !k ? 'Classe eliminata' : rejected ? 'Richiesta rifiutata' : 'In attesa di approvazione'),
    h('p', { class: 'sub' }, !k ? 'La tua classe non esiste più. Contatta l\'amministratore della scuola.'
      : rejected ? `La richiesta per la classe ${k.name} non è stata approvata. Contatta l'amministratore della scuola.`
      : `Hai creato la classe ${k.name}. Potrai usarla appena l'amministratore della scuola la approva: questa pagina si aggiorna da sola.`),
    h('button', { class: 'btn block line', style: { marginTop: '20px' }, onclick: () => signOut(auth) }, icon('logout'), 'Esci'))));
}
function notAdmin() {
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' }, h('div', { class: 'logo' }, mark(34)),
    h('h1', {}, 'Accesso negato'), h('p', { class: 'sub' }, 'Questo account non ha i permessi da admin.'),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' } },
      h('a', { class: 'btn block', href: '../' }, 'Vai al sito studenti'),
      h('button', { class: 'btn block line', onclick: () => signOut(auth) }, 'Esci')))));
}

/* ---------- Dati ---------- */
const toMap = q => { const m = {}; q.forEach(d => (m[d.id] = { id: d.id, ...d.data() })); return m; };
function listen(key, ref, fn, list = classUnsubs, ready = () => A.ready) {
  const cid = CID;
  list.push(onSnapshot(ref, s => { if (list === classUnsubs && cid !== CID) return; fn(s); ready().add(key); schedule(); },
    e => { console.error(key, e); if (!/unlockRequests|ttc/.test(key)) toast(errMsg(e), 'error'); ready().add(key); schedule(); }));
}
const CLASS_KEYS = 10;
// Admin di classe: vede solo la sua classe e i suoi studenti
function startClassAdmin(cid) {
  const g = () => A.gready;
  listen('classes', doc(db, 'classes', cid), s => {
    A.classes = s.exists() ? { [cid]: { id: cid, ...s.data() } } : {};
    const active = s.exists() && (s.data().status || 'active') === 'active';
    if (active && CID !== cid) selectClass(cid);
    if (!active && CID) selectClass(null);
  }, unsubs, g);
  listen('members', query(collection(db, 'members'), where('classId', '==', cid)), q => { A.members = {}; q.forEach(d => (A.members[d.id] = d.data())); }, unsubs, g);
}
function startSuper() {
  const g = () => A.gready;
  listen('classAdmins', collection(db, 'classAdmins'), q => (A.classAdmins = toMap(q)), unsubs, () => new Set());
  listen('classes', collection(db, 'classes'), q => {
    A.classes = toMap(q);
    if (CID && !A.classes[CID]) selectClass(null);
    if (!CID) { const saved = store.get(CID_KEY); const ids = sortedClasses().filter(isActive).map(c => c.id); const pick = ids.includes(saved) ? saved : ids[0]; if (pick) selectClass(pick); }
  }, unsubs, g);
  listen('members', collection(db, 'members'), q => { A.members = {}; q.forEach(d => (A.members[d.id] = d.data())); }, unsubs, g);
  checkLegacy();
}
async function checkLegacy() {
  try { A.legacy = !(await getDocs(query(collection(db, 'students'), limit(1)))).empty; } catch (e) { A.legacy = false; }
  schedule();
}
function selectClass(cid) {
  classUnsubs.forEach(u => u()); classUnsubs = []; Object.values(roundSubs).forEach(u => u()); roundSubs = {};
  Object.assign(A, classData(), { roundId: null });
  CID = cid; if (cid) store.set(CID_KEY, cid);
  if (!cid) return schedule();
  listen('students', cref('students'), q => { A.students = {}; q.forEach(d => (A.students[d.id] = d.data())); });
  listen('subjects', cref('subjects'), q => (A.subjects = toMap(q)));
  listen('events', cref('events'), q => (A.events = toMap(q)));
  listen('rounds', cref('rounds'), q => { A.rounds = toMap(q); syncRoundSubs(); });
  listen('excl', cref('exclusions'), q => { A.excl = {}; q.forEach(d => (A.excl[d.id] = d.data())); });
  listen('swaps', cref('swaps'), q => (A.swaps = toMap(q)));
  listen('recov', cref('recoveries'), q => (A.recov = toMap(q)));
  listen('tt', dref('timetable', 'week'), s => (A.tt = s.exists() ? s.data() : null));
  listen('ttc', dref('timetable', 'changes'), s => (A.ttChanges = s.exists() ? s.data() : null));
  listen('unlockRequests', cref('unlockRequests'), q => (A.unlockReqs = toMap(q)));
  schedule();
}
const isActive = c => (c?.status || 'active') === 'active';
const sortedClasses = () => Object.values(A.classes).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it', { numeric: true }));
const className = (cid = CID) => A.classes[cid]?.name || 'Classe';
function syncRoundSubs() {
  const want = {}; const cid = CID;
  const mine = fn => (...a) => { if (cid === CID) { fn(...a); schedule(); } };
  for (const r of Object.values(A.rounds)) {
    if (r.status === 'archived') continue;
    want[r.id + ':v'] = () => onSnapshot(cref('rounds', r.id, 'votes'), mine(q => { A.votes[r.id] = toMap(q); }));
    want[r.id + ':c'] = () => onSnapshot(dref('rounds', r.id, 'private', 'config'), mine(s => { A.configs[r.id] = s.exists() ? s.data() : { defaultCap: 0, caps: {} }; }));
    want[r.id + ':p'] = () => onSnapshot(dref('rounds', r.id, 'private', 'proposal'), mine(s => { A.proposals[r.id] = s.exists() ? s.data() : null; }));
  }
  for (const k of Object.keys(roundSubs)) if (!want[k]) { roundSubs[k](); delete roundSubs[k]; }
  for (const [k, f] of Object.entries(want)) if (!roundSubs[k]) roundSubs[k] = f();
}
function stopAll() { unsubs.forEach(u => u()); unsubs = []; classUnsubs.forEach(u => u()); classUnsubs = []; Object.values(roundSubs).forEach(u => u()); roundSubs = {}; CID = null; }

/* ---------- Helpers ---------- */
const events = () => Object.values(A.events);
const studentIds = () => Object.keys(A.students).sort((a, b) => C.byLastName(A.students[a], A.students[b]));
const st = id => A.students[id];
const capOf = (rid, d) => { const c = A.configs[rid] || {}; return c.caps?.[d] ?? c.defaultCap ?? 0; };
const reasonsFor = (u, d, ignore = [], round = null) => C.blockReasons(u, d, { events: events(), exclusions: A.excl[u] || {}, ignore, unlock: round?.unlocks?.[u] || null });
const blocker = (ignore = [], round = null) => (u, d) => reasonsFor(u, d, ignore, round).length > 0;
const roundStudents = r => (Array.isArray(r.participants) ? r.participants : studentIds()).filter(st).sort((a, b) => C.byLastName(st(a), st(b)));
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
  if (A.gready.size < 2) return renderLoader(root);
  if (!CID) { clearFab(); return A.role === 'class' ? renderWaiting(A.classes[A.me.classId]) : renderNoClass(); }
  if (A.ready.size < CLASS_KEYS) return renderLoader(root);
  const tabs = isSuper() ? [...TABS, { id: 'scuola', label: 'Scuola', icon: 'school' }] : TABS;
  if (!tabs.some(t => t.id === A.tab)) A.tab = 'giri';
  const badges = { scuola: Object.values(A.classes).filter(c => c.status === 'pending').length, richieste: Object.values(A.swaps).filter(s => s.status === 'pending_admin').length + Object.values(A.recov).filter(r => r.status === 'open').length
    + Object.values(A.unlockReqs).filter(r => r.status === 'pending').length };
  const y = window.scrollY;
  const main = shell(root, tabs, A.tab, t => { A.tab = t; A.roundId = null; A.more = null; window.scrollTo(0, 0); render(); }, badges, className());
  if (tabs.length > 5) root.querySelector('.nav')?.classList.add('six');
  ({ giri: renderRounds, cal: renderCal, studenti: renderStudents, richieste: renderRequests, altro: renderMore, scuola: renderSchool })[A.tab](main);
  window.scrollTo(0, y);
  if (!store.get(TUT_KEY + '.' + A.uid) && !document.querySelector('.sheet.show, .draw-ov')) { store.set(TUT_KEY + '.' + A.uid, '1'); setTimeout(() => showTutorial(), 300); }
}
/* Ogni pagina mostra in alto la classe su cui si sta lavorando: toccandola si cambia classe */
function classBar() {
  if (!isSuper()) return h('div', { class: 'class-bar' }, h('span', { class: 'class-chip' }, icon('school'), `Classe ${className()}`));
  return h('div', { class: 'class-bar' },
    h('button', { class: 'class-chip', 'aria-label': 'Cambia classe', onclick: classPicker }, icon('school'), `Classe ${className()}`, icon('right', 'chev')),
    h('span', { class: 'pill dark' }, 'Super admin'));
}
const pg = (main, hero, body) => page(main, [classBar(), hero], body);
function classPicker() {
  openSheet('Classi', close => [
    h('p', { class: 'small muted', style: { marginBottom: '6px' } }, 'Scegli la classe su cui lavorare. Ogni classe ha i suoi studenti, materie, orario e giri.'),
    sortedClasses().filter(isActive).map(c => h('button', { class: 'list-item', onclick: () => { close(); if (c.id !== CID) { A.tab = 'giri'; A.more = null; window.scrollTo(0, 0); selectClass(c.id); } } },
      h('span', { class: 'av' }, (c.name || '?').slice(0, 3)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, `Classe ${c.name}`), h('div', { class: 's' }, `${membersOf(c.id).length} studenti`)),
      c.id === CID ? h('span', { class: 'pill lime' }, 'Attuale') : icon('right', 'chev'))),
    h('div', { class: 'actions' },
      h('button', { class: 'btn block', onclick: () => { close(); newClassSheet(); } }, icon('plus'), 'Nuova classe'),
      h('button', { class: 'btn block ghost', onclick: () => { close(); A.tab = 'scuola'; A.more = null; window.scrollTo(0, 0); render(); } }, 'Gestione della scuola')),
  ]);
}
const membersOf = cid => Object.entries(A.members).filter(([, m]) => m.classId === cid).map(([id]) => id);
const fab = (label, fn) => document.body.append(h('button', { class: 'fab', 'aria-label': label, onclick: fn, 'data-fab': '1' }, icon('plus')));
const clearFab = () => document.querySelectorAll('[data-fab]').forEach(x => x.remove());

/* =========================================================
   GIRI
   ========================================================= */
function renderRounds(main) {
  clearFab();
  if (A.roundId && A.rounds[A.roundId]) return renderRound(main, A.rounds[A.roundId]);
  const order = { voting: 0, paused: 0, closed: 1, draft: 2, published: 3, archived: 4 };
  const list = Object.values(A.rounds).sort((a, b) => (order[a.status] - order[b.status]) || ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
  const n = studentIds().length;
  pg(main, [h('h1', {}, 'Giri di interrogazioni'), h('p', { class: 'sub' }, `${n} studenti · ${Object.keys(A.subjects).length} materie`)], [
    list.length ? list.map(r => {
      const rn = roundStudents(r).length; const voted = roundStudents(r).filter(id => A.votes[r.id]?.[id]?.first).length;
      const sPill = { draft: 'grey', voting: 'lime', paused: 'grey', closed: 'violet', published: 'ok', archived: 'grey' }[r.status];
      const completed = r.status === 'published' && (r.dates || []).length && (r.dates || []).every(d => d <= C.todayISO());
      return h('button', { class: 'card', style: { display: 'block', width: '100%', textAlign: 'left' }, onclick: () => { A.roundId = r.id; window.scrollTo(0, 0); render(); } },
        h('div', { class: 'row' }, h('span', { class: 'sdot', style: { '--c': subjColor(A.subjects, r.subjectId) } }), h('h3', { class: 'grow' }, roundTitle(r)),
          h('span', { class: 'pill ' + sPill }, completed ? 'Completato' : C.STATUS[r.status])),
        h('div', { class: 'small muted', style: { marginTop: '6px' } },
          `${(r.dates || []).length} date`, r.dates?.length ? ` · dal ${C.fmtShort([...r.dates].sort()[0])}` : '',
          ` · ${rn} studenti`, r.status === 'voting' ? ` · ${voted}/${rn} hanno votato` : '', A.proposals[r.id] ? ' · proposta da confermare' : '',
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
  const part = new Set(r && Array.isArray(r.participants) ? r.participants : studentIds());
  const def = () => Math.max(1, parseInt(capIn.value, 10) || 1);
  // posti per ogni data: partono dal valore predefinito e si cambiano una per una
  const caps = {}; dates.forEach(d => (caps[d] = cfg.caps?.[d] ?? cfg.defaultCap ?? 4));
  let showPart = false, summaryEl = null;
  openSheet(r ? 'Modifica giro' : 'Nuovo giro', (close, refill) => {
    const ids = studentIds(); const allIn = ids.every(id => part.has(id));
    const summaryText = () => {
      const tot = dates.reduce((a, d) => a + (caps[d] ?? def()), 0);
      if (!dates.length) return `${part.size} studenti nel giro: aggiungi le date e scegli quanti posti ha ciascuna.`;
      return `${dates.length} date · ${tot} posti totali per ${part.size} studenti` + (tot < part.size ? ` · mancano ${part.size - tot} posti` : '');
    };
    const upd = () => { if (summaryEl) { summaryEl.textContent = summaryText(); summaryEl.style.color = dates.length && dates.reduce((a, d) => a + caps[d], 0) < part.size ? 'var(--danger)' : ''; } };
    const stepper = d => {
      const val = h('b', { style: { minWidth: '28px', textAlign: 'center', fontSize: '18px' } }, String(caps[d]));
      const set = n => { caps[d] = Math.max(1, Math.min(40, n)); val.textContent = String(caps[d]); upd(); };
      return h('div', { class: 'row', style: { gap: '6px' } },
        h('button', { class: 'iconbtn', style: { background: 'var(--surface-2)', width: '36px', height: '36px', fontSize: '20px', fontWeight: '800' }, 'aria-label': 'Meno', onclick: () => set(caps[d] - 1) }, '−'),
        val,
        h('button', { class: 'iconbtn', style: { background: 'var(--surface-2)', width: '36px', height: '36px', fontSize: '20px', fontWeight: '800' }, 'aria-label': 'Più', onclick: () => set(caps[d] + 1) }, '+'));
    };
    const dateRows = dates.length ? h('div', { style: { marginTop: '8px' } }, dates.map(d => h('div', { class: 'list-item', style: { padding: '8px 2px' } },
      h('div', { class: 'grow' }, h('div', { class: 't' }, C.cap(C.fmtShort(d))), h('div', { class: 's' }, 'posti')),
      stepper(d),
      h('button', { class: 'iconbtn', style: { background: 'var(--danger-soft)', color: 'var(--danger)', width: '36px', height: '36px', marginLeft: '4px' }, 'aria-label': 'Rimuovi data', onclick: () => { dates = dates.filter(x => x !== d); delete caps[d]; refill(); } }, icon('close')))))
      : h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Nessuna data aggiunta');
    const add = () => {
      const d = dateIn.value; if (!d) return;
      if (C.isWeekend(d)) return toast('Sabato e domenica non si va a scuola', 'error');
      if (!dates.includes(d)) { dates = [...dates, d].sort(); caps[d] = def(); }
      dateIn.value = ''; refill();
    };
    capIn.oninput = upd;
    subj.onchange = refill;
    // Suggerimento dall'orario: aggiunge i giorni della settimana successiva in cui c'è lezione della materia
    const ttWd = C.subjectWeekdays(A.tt, subj.value);
    const addFromTT = () => {
      let from = dates.length ? C.addDays(dates[dates.length - 1], 1) : C.addDays(C.todayISO(), 1);
      if (from <= C.todayISO()) from = C.addDays(C.todayISO(), 1);
      const add = [];
      for (let i = 0; i < 7; i++) { const d = C.addDays(from, i); if (!C.isWeekend(d) && C.hasLesson(A.tt, A.ttChanges, d, subj.value) && !dates.includes(d)) add.push(d); }
      if (!add.length) return toast('Nessun giorno trovato nell\'orario', 'error');
      add.forEach(d => (caps[d] = def())); dates = [...dates, ...add].sort(); refill();
    };
    const ttHint = ttWd.length ? h('button', { class: 'btn sm line', style: { marginTop: '8px' }, onclick: addFromTT }, icon('plus'),
      dates.length ? 'Aggiungi la settimana dopo dall\'orario' : 'Aggiungi i prossimi giorni dall\'orario')
      : null;
    const ttNote = ttWd.length ? h('p', { class: 'small muted', style: { marginTop: '6px' } },
      `Da orario: lezione di ${C.WEEKDAYS.filter(([w]) => ttWd.includes(w)).map(([, l]) => l.toLowerCase()).join(', ')}.`) : null;
    const partBlock = h('div', { class: 'field' },
      h('div', { class: 'row', style: { justifyContent: 'space-between' } },
        h('span', { class: 'small', style: { fontWeight: '700', color: 'var(--muted)' } }, `Chi partecipa: ${part.size} su ${ids.length}`),
        h('button', { class: 'btn sm ghost', onclick: () => { showPart = !showPart; refill(); } }, showPart ? 'Chiudi elenco' : 'Scegli')),
      showPart ? h('div', { style: { marginTop: '8px' } },
        h('button', { class: 'btn sm line', onclick: () => { allIn ? part.clear() : ids.forEach(id => part.add(id)); refill(); } }, allIn ? 'Togli tutti' : 'Tutta la classe'),
        ids.map(id => h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: part.has(id), onchange: e => { e.target.checked ? part.add(id) : part.delete(id); refill(); } }),
          h('div', { class: 'grow' }, C.fullName(st(id)))))) : null);
    const out = [
      h('label', { class: 'field' }, h('span', {}, 'Materia'), subj),
      h('label', { class: 'field' }, h('span', {}, 'Titolo'), title),
      partBlock,
      h('div', { class: 'field' }, h('span', { class: 'small', style: { fontWeight: '700', color: 'var(--muted)' } }, 'Giorni in cui viene il docente e quanti può interrogarne'),
        h('div', { class: 'row', style: { marginTop: '6px', alignItems: 'flex-end' } },
          h('div', { class: 'grow' }, dateIn),
          h('label', { style: { width: '92px' } }, h('span', { class: 'small muted', style: { display: 'block', marginBottom: '4px', fontWeight: '700' } }, 'Posti'), capIn),
          h('button', { class: 'btn ghost', onclick: add }, icon('plus'), 'Aggiungi')),
        h('p', { class: 'small muted', style: { marginTop: '6px' } }, 'Ogni data parte con i posti indicati qui sopra; poi puoi cambiarli una per una con − e +. La classe non vede mai questi numeri.'),
        ttNote, ttHint,
        dateRows),
      summaryEl = h('div', { class: 'card', style: { fontWeight: '700', fontSize: '14px' } }, ''),
      h('div', { class: 'actions' },
        h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => {
          if (!dates.length) throw new Error('Aggiungi almeno una data');
          if (!part.size) throw new Error('Scegli almeno uno studente');
          const data = { subjectId: subj.value, title: title.value.trim(), dates, participants: [...part] };
          const conf = { defaultCap: def(), caps: Object.fromEntries(dates.map(d => [d, caps[d] ?? def()])) };
          if (r) {
            await updateDoc(dref('rounds', r.id), data);
            await setDoc(dref('rounds', r.id, 'private', 'config'), conf);
          } else {
            const ref = await addDoc(cref('rounds'), { ...data, status: 'draft', visible: false, showVotes: false, createdAt: serverTimestamp() });
            await setDoc(dref('rounds', ref.id, 'private', 'config'), conf);
            A.roundId = ref.id;
          }
        }, r ? 'Giro aggiornato' : 'Giro creato').then(close).catch(() => {}) }, r ? 'Salva modifiche' : 'Crea giro')),
    ];
    upd();
    return out;
  });
}

function renderRound(main, r) {
  const rs = roundStudents(r); const n = rs.length;
  const votes = A.votes[r.id] || {};
  const voted = rs.filter(id => votes[id]?.first);
  const missing = rs.filter(id => !votes[id]?.first);
  const prop = A.proposals[r.id];
  const sorted = [...(r.dates || [])].sort();
  const upd = (data, msg) => busy(null, () => updateDoc(dref('rounds', r.id), data), msg);

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
    h('button', { class: 'btn ghost', onclick: () => roundSheet(r) }, 'Modifica'));
  if (r.status === 'voting') actions.append(
    h('button', { class: 'btn ghost', onclick: () => upd({ status: 'paused' }, 'Votazione in pausa') }, 'Metti in pausa'));
  if (r.status === 'paused') actions.append(
    h('button', { class: 'btn lime', onclick: () => upd({ status: 'voting' }, 'Votazione ripresa') }, 'Riprendi votazione'));
  if (['voting', 'paused'].includes(r.status)) actions.append(
    h('button', { class: 'btn', onclick: async () => { if (await confirmSheet('Chiudere la votazione?', `Hanno votato ${voted.length} studenti su ${n}. Dopo la chiusura nessuno potrà più cambiare scelta (puoi sempre riaprirla).`, 'Chiudi votazione')) upd({ status: 'closed' }, 'Votazione chiusa'); } }, 'Chiudi votazione'),
    h('button', { class: 'btn ghost', onclick: () => roundSheet(r) }, 'Modifica date'));
  if (r.status === 'closed') actions.append(
    h('button', { class: 'btn ghost', onclick: async () => { await deleteDoc(dref('rounds', r.id, 'private', 'proposal')); upd({ status: 'voting' }, 'Votazione riaperta'); } }, 'Riapri votazione'),
    h('button', { class: 'btn ghost', onclick: () => roundSheet(r) }, 'Modifica date'));
  if (r.status === 'published') actions.append(
    h('button', { class: 'btn ghost', onclick: async () => { if (await confirmSheet('Archiviare il giro?', 'Le date restano nel calendario, ma il giro sparisce dalle votazioni.', 'Archivia')) upd({ status: 'archived', 'revote.active': false }, 'Giro archiviato'); } }, 'Archivia'));
  if (r.status === 'archived') actions.append(h('button', { class: 'btn ghost', onclick: () => upd({ status: 'published' }, 'Giro ripristinato') }, 'Ripristina'));
  body.push(actions);

  if (r.status !== 'draft') body.push(h('div', { class: 'card', style: { marginTop: '14px' } },
    toggleRow('Mostra i voti alla classe', 'Se attivo, tutti vedono chi ha scelto ogni data (mai la capienza).', r.showVotes, () => upd({ showVotes: !r.showVotes }, r.showVotes ? 'Voti nascosti' : 'Voti visibili alla classe'))));

  // statistiche di voto
  if (['voting', 'paused', 'closed'].includes(r.status)) {
    const totCap = sorted.reduce((s, d) => s + capOf(r.id, d), 0);
    body.push(h('div', { class: 'section-title' }, 'Votazione'),
      h('div', { class: 'stat' }, h('div', {}, h('b', {}, `${voted.length}/${n}`), h('span', {}, 'hanno votato')), h('div', {}, h('b', {}, totCap), h('span', {}, 'posti totali'))),
      totCap < n ? h('div', { class: 'card warn', style: { marginTop: '10px' } }, `Attenzione: ${n} studenti nel giro ma solo ${totCap} posti. Aumenta i posti o aggiungi date.`) : null,
      missing.length ? h('details', { class: 'acc', style: { marginTop: '10px' } }, h('summary', {}, `Non hanno ancora votato (${missing.length})`, icon('right', 'chev')),
        h('div', { class: 'acc-b', style: { paddingLeft: '16px' } }, missing.map(id => C.fullName(st(id))).join(', '))) : null,
      h('details', { class: 'acc', style: { marginTop: '8px' } }, h('summary', {}, `Voti per studente (${voted.length})`, icon('right', 'chev')),
        h('div', { class: 'acc-b', style: { paddingLeft: '16px' } },
          voted.length ? voted.map(id => h('div', { class: 'list-item', style: { padding: '8px 0' } },
            h('div', { class: 'grow' }, h('div', { class: 't' }, C.fullName(st(id))),
              h('div', { class: 's' }, `1ª ${votes[id].first ? C.fmtShort(votes[id].first) : '—'} · Riserva ${votes[id].reserve ? C.fmtShort(votes[id].reserve) : '—'}`)),
            h('button', { class: 'btn sm danger-ghost', onclick: async () => {
              if (await confirmSheet('Azzerare il voto?', `Il voto di ${C.fullName(st(id))} verrà cancellato.` + (r.status === 'voting' ? ' Potrà votare di nuovo.' : ''), 'Azzera', true))
                busy(null, () => deleteDoc(dref('rounds', r.id, 'votes', id)), 'Voto azzerato').catch(() => {});
            } }, 'Azzera'))) : h('p', { class: 'small muted' }, 'Nessun voto.'))),
      voted.length ? h('button', { class: 'btn sm danger-ghost', style: { marginTop: '10px' }, onclick: async () => {
        if (!await confirmSheet('Azzerare tutti i voti?', `Verranno cancellati i voti di ${voted.length} studenti${prop ? ' e l\'ipotesi in corso' : ''}. Tutti dovranno votare di nuovo.`, 'Azzera tutti', true)) return;
        busy(null, async () => {
          const ids = Object.keys(votes); const b = writeBatch(db);
          ids.forEach(id => b.delete(dref('rounds', r.id, 'votes', id)));
          b.delete(dref('rounds', r.id, 'private', 'proposal'));
          await b.commit();
        }, 'Tutti i voti azzerati').catch(() => {});
      } }, icon('trash'), 'Azzera tutti i voti') : null);
  }

  // date sbloccate per singoli studenti
  if (!['archived'].includes(r.status)) {
    const un = Object.entries(r.unlocks || {}).filter(([id, v]) => st(id) && v && v.length);
    body.push(h('div', { class: 'section-title' }, 'Date sbloccate'),
      h('p', { class: 'small muted', style: { marginBottom: '8px' } }, 'Per chi vuole stare in un giorno vicino a un\'altra interrogazione. Vale solo per questo giro; le esclusioni (giorno fisso, assenze) restano.'),
      un.length ? un.map(([id, v]) => h('button', { class: 'list-item', onclick: () => unlockSheet(r, id) },
        h('span', { class: 'av' }, C.initials(st(id))), h('div', { class: 'grow' }, h('div', { class: 't' }, C.fullName(st(id))),
          h('div', { class: 's' }, v.includes('all') ? 'Tutte le date del giro' : v.slice().sort().map(C.fmtShort).join(', '))), icon('right', 'chev'))) : null,
      h('button', { class: 'btn sm ghost', style: { marginTop: '8px' }, onclick: () => pickStudentSheet(r) }, icon('plus'), 'Sblocca date per uno studente'));
  }

  // tabella date
  const pubCount = d => roundEvents(r).filter(e => e.date === d && !e.cancelled).reduce((s, e) => s + (e.studentIds || []).length, 0);
  const isCancelled = d => roundEvents(r).some(e => e.date === d && e.cancelled) && !roundEvents(r).some(e => e.date === d && !e.cancelled);
  body.push(h('div', { class: 'section-title' }, 'Date e posti (modificabili)'),
    h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, 'Data'), h('th', {}, 'Posti'),
      ['voting', 'paused', 'closed'].includes(r.status) ? [h('th', {}, '1ª'), h('th', {}, 'Ris.')] : r.status !== 'draft' ? h('th', {}, 'Assegnati') : null)),
    h('tbody', {}, sorted.map(d => {
      const f = Object.values(votes).filter(v => v.first === d).length, rs = Object.values(votes).filter(v => v.reserve === d).length;
      const capIn = h('input', { class: 'capin', type: 'number', min: '0', inputmode: 'numeric', value: String(capOf(r.id, d)),
        onchange: e => busy(null, () => setDoc(dref('rounds', r.id, 'private', 'config'), { caps: { [d]: Math.max(0, parseInt(e.target.value, 10) || 0) } }, { merge: true }), 'Posti aggiornati') });
      return h('tr', {}, h('td', {}, h('b', {}, C.fmtShort(d)), isCancelled(d) ? h('span', { class: 'pill danger', style: { marginLeft: '6px' } }, 'Annullata') : null),
        h('td', {}, capIn),
        ['voting', 'paused', 'closed'].includes(r.status) ? [h('td', { class: 'num' + (f > capOf(r.id, d) ? ' over' : '') }, f), h('td', { class: 'num' }, rs)]
          : r.status !== 'draft' ? h('td', { class: 'num' }, pubCount(d)) : null);
    }))));

  // proposta
  if (r.status === 'closed' && !prop) body.push(h('div', { class: 'section-title' }, 'Sistemazione'),
    h('p', { class: 'muted small', style: { marginBottom: '10px' } }, 'Scegli come procedere. In entrambi i casi vedrai prima un\'ipotesi da controllare: nulla viene pubblicato finché non la accetti.'),
    h('div', { class: 'stack' },
      h('button', { class: 'btn block violet', onclick: e => busy(e.currentTarget, () => makeInitialProposal(r, 'draw'), 'Ipotesi pronta') }, icon('dice'), 'Sorteggio automatico'),
      h('button', { class: 'btn block ghost', onclick: e => busy(e.currentTarget, () => makeInitialProposal(r, 'votes'), 'Ipotesi pronta') }, icon('hand'), 'Sistemo a mano partendo dai voti')),
    h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Sistemando a mano potrai poi sorteggiare solo chi non si mette d\'accordo.'));
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
        h('div', { class: 'pday-h' }, h('span', {}, C.cap(C.fmtLong(d)), ev.cancelled ? h('span', { class: 'pill danger', style: { marginLeft: '8px' } }, 'Annullata')
            : C.isDone(ev) ? h('span', { class: 'pill ok', style: { marginLeft: '8px' } }, icon('check'), 'Fatta') : null),
          !ev.cancelled && ev.date >= C.todayISO() ? h('button', { class: 'btn sm danger-ghost', onclick: () => cancelDaySheet(r, ev) }, 'Annulla giornata') : null),
        h('div', { class: 'chips' }, sortIds(ev.studentIds || []).map(id => h('button', { class: 'chip', onclick: ev.cancelled ? null : () => assignedStudentSheet(ev, id) }, C.fullName(st(id)))))));
    }
    const recs = Object.values(A.recov).filter(x => x.roundId === r.id && x.status === 'open');
    if (recs.length) body.push(h('div', { class: 'card danger', style: { marginTop: '10px' } }, h('b', {}, 'Da recuperare: '), recs.map(x => C.fullName(st(x.uid))).join(', '),
      h('div', { class: 'small' }, 'Assegna le nuove date dalla sezione Richieste.')));
  }
  body.push(h('div', { class: 'section-title', style: { marginTop: '32px' } }, 'Elimina'),
    h('div', { class: 'card danger' },
      h('p', { class: 'small', style: { marginBottom: '10px' } }, 'Cancella il giro e tutto ciò che è collegato: voti, posti, date pubblicate nel calendario, "da recuperare" e scambi. Non si può annullare.'),
      h('button', { class: 'btn block danger', onclick: () => deleteRound(r) }, icon('trash'), 'Elimina giro definitivamente')));
  pg(main, hero, body);
}

/* ---------- Sblocco date per singolo studente ---------- */
function pickStudentSheet(r) {
  openSheet('Sblocca date: scegli lo studente', close => {
    const rr = A.rounds[r.id] || r;
    return [
      h('p', { class: 'small muted', style: { marginBottom: '6px' } }, 'Tra parentesi quante date del giro sono bloccate per lui da altre interrogazioni.'),
      roundStudents(rr).map(id => {
        const n = (rr.dates || []).filter(d => reasonsFor(id, d).some(x => x.kind === 'event')).length;
        return h('button', { class: 'list-item', onclick: () => { close(); unlockSheet(rr, id); } },
          h('span', { class: 'av' }, C.initials(st(id))), h('div', { class: 'grow' }, h('div', { class: 't' }, C.fullName(st(id))),
            h('div', { class: 's' }, n ? `${n} ${n === 1 ? 'data bloccata' : 'date bloccate'}` : 'nessuna data bloccata')), icon('right', 'chev'));
      }),
    ];
  });
}
function unlockSheet(r0, id) {
  openSheet('Sblocca date per ' + C.fullName(st(id)), (close, refill) => {
    const r = A.rounds[r0.id] || r0;
    const cur = r.unlocks?.[id] || [];
    const all = cur.includes('all');
    const save = next => busy(null, () => updateDoc(dref('rounds', r.id), { [`unlocks.${id}`]: next.length ? next : deleteField() }), 'Sblocchi aggiornati')
      .then(() => setTimeout(refill, 200)).catch(() => {});
    const dates = [...(r.dates || [])].sort();
    return [
      h('p', { class: 'small muted' }, `${roundTitle(r)}. Le date sbloccate diventano selezionabili per lui anche se sono vicine a un'altra sua interrogazione. Vale anche a votazione aperta.`),
      h('div', { class: 'card', style: { marginTop: '12px' } }, toggleRow('Tutte le date del giro', 'Toglie il blocco "giorno prima/dopo" su ogni data', all, () => save(all ? [] : ['all']))),
      h('div', { class: 'section-title' }, 'Date del giro'),
      dates.map(d => {
        const ev = reasonsFor(id, d).filter(x => x.kind === 'event');
        const ex = reasonsFor(id, d).filter(x => x.kind !== 'event');
        const on = all || cur.includes(d);
        return h('div', { class: 'list-item', style: { alignItems: 'center' } },
          h('div', { class: 'grow' }, h('div', { class: 't' }, C.cap(C.fmtLong(d))),
            ev.length ? h('div', { class: 's' }, ev.map(x => C.reasonText(x, A.subjects, false)).join('; ')) : h('div', { class: 's' }, 'Già libera'),
            ex.length ? h('div', { class: 's', style: { color: 'var(--danger)' } }, ex.map(x => C.reasonText(x, A.subjects, false)).join('; ') + ' (resta bloccata)') : null),
          ev.length && !all ? h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on), onclick: () => save(on ? cur.filter(x => x !== d) : [...cur.filter(x => x !== 'all'), d]) })
            : ev.length && all ? h('span', { class: 'pill violet' }, 'Sbloccata') : null);
      }),
      cur.length ? h('div', { class: 'actions' }, h('button', { class: 'btn block line', onclick: () => save([]) }, 'Togli tutti gli sblocchi')) : null,
    ];
  });
}

async function deleteRound(r) {
  const evs = roundEvents(r); const evIds = new Set(evs.map(e => e.id));
  const recs = Object.values(A.recov).filter(x => x.roundId === r.id);
  const sw = Object.values(A.swaps).filter(x => evIds.has(x.fromEventId) || evIds.has(x.toEventId));
  const parts = [`il giro "${roundTitle(r)}"`, 'tutti i voti', evs.length ? `${evs.length} date pubblicate nel calendario` : null,
    recs.length ? `${recs.length} "da recuperare"` : null, sw.length ? `${sw.length} richieste di scambio` : null].filter(Boolean);
  if (!await confirmSheet('Eliminare tutto il giro?', `Verranno cancellati definitivamente: ${parts.join(', ')}.<br><br>Non si può annullare.`, 'Elimina tutto', true)) return;
  await busy(null, async () => {
    const refs = [];
    (await getDocs(cref('rounds', r.id, 'votes'))).forEach(d => refs.push(dref('rounds', r.id, 'votes', d.id)));
    refs.push(dref('rounds', r.id, 'private', 'config'), dref('rounds', r.id, 'private', 'proposal'));
    evs.forEach(e => refs.push(dref('events', e.id)));
    recs.forEach(x => refs.push(dref('recoveries', x.id)));
    sw.forEach(x => refs.push(dref('swaps', x.id)));
    refs.push(dref('rounds', r.id)); // per ultimo il giro stesso
    for (let i = 0; i < refs.length; i += 400) { const b = writeBatch(db); refs.slice(i, i + 400).forEach(x => b.delete(x)); await b.commit(); }
    A.roundId = null;
  }, 'Giro eliminato');
}

/* ---------- Proposte ---------- */
function votesMap(r) { const m = {}; const ok = new Set(roundStudents(r)); for (const [id, v] of Object.entries(A.votes[r.id] || {})) if (ok.has(id) || r.revote) m[id] = { first: v.first, reserve: v.reserve }; return m; }
async function makeInitialProposal(r, mode) {
  const dates = [...r.dates].sort(); const capacity = {}; dates.forEach(d => (capacity[d] = capOf(r.id, d)));
  const args = { studentIds: roundStudents(r), dates, capacity, votes: votesMap(r), isBlocked: blocker([], r) };
  const res = mode === 'draw' ? C.buildSchedule(args) : C.proposalFromVotes(args);
  await setDoc(dref('rounds', r.id, 'private', 'proposal'), { mode: 'initial', method: mode, students: roundStudents(r), dates, ...res, createdAt: serverTimestamp() });
  if (mode === 'draw') await playDraw(r, { dates, assign: res.assign, unassigned: res.unassigned, drawn: roundStudents(r) });
}
// Animazione del sorteggio (si può proiettare in classe). drawn = chi viene "estratto"; gli altri compaiono già al loro posto.
function playDraw(r, { dates, assign, unassigned = [], drawn }) {
  return drawShow({ title: 'Sorteggio', subtitle: `${roundTitle(r)} · classe ${className()}`, dates, assign, unassigned, drawn, nameOf: id => C.fullName(st(id)) });
}
async function makeMergeProposal(r, { students, dates, useVotes, cancelledEventId = null }) {
  const capacity = {}; const prefill = {};
  dates.forEach(d => {
    capacity[d] = capOf(r.id, d);
    prefill[d] = roundEvents(r).filter(e => e.date === d && !e.cancelled).reduce((s, e) => s + (e.studentIds || []).filter(id => !students.includes(id)).length, 0);
  });
  const res = C.buildSchedule({ studentIds: students, dates, capacity, prefill, votes: useVotes ? votesMap(r) : {}, isBlocked: blocker([], r) });
  await setDoc(dref('rounds', r.id, 'private', 'proposal'), { mode: 'merge', method: 'draw', students, dates, prefill, cancelledEventId, ...res, createdAt: serverTimestamp() });
  return res;
}

/* Sorteggio solo per alcuni: dopo aver sistemato a mano chi si è messo d'accordo, si sorteggiano gli altri nei posti rimasti */
function drawPickSheet(r, p0) {
  const sel = new Set((p0.unassigned || []).filter(st));
  let useVotes = false;
  openSheet('Chi va sorteggiato?', (close, refill) => {
    const p = A.proposals[r.id] || p0; const dates = p.dates || [];
    const capacity = {}; dates.forEach(d => (capacity[d] = capOf(r.id, d)));
    const where = {}; dates.forEach(d => (p.assign[d] || []).forEach(id => (where[id] = d)));
    const ids = sortIds(p.students || []);
    const free = C.freeSeats({ assign: p.assign, selected: [...sel], dates, capacity, prefill: p.prefill || {} });
    const groups = [['Non assegnati', ids.filter(id => !where[id])], ...dates.map(d => [C.cap(C.fmtShort(d)), ids.filter(id => where[id] === d)])].filter(([, l]) => l.length);
    const setAll = (list, on) => { list.forEach(id => (on ? sel.add(id) : sel.delete(id))); refill(); };
    return [
      h('p', { class: 'muted small', style: { marginBottom: '10px' } }, 'Seleziona chi non ha trovato un accordo: verrà tolto dal suo posto e sorteggiato nei posti liberi, sempre rispettando i giorni bloccati. Gli altri restano dove sono.'),
      h('div', { class: 'stat' }, h('div', {}, h('b', {}, sel.size), h('span', {}, 'da sorteggiare')), h('div', {}, h('b', { class: free < sel.size ? 'over' : '' }, free), h('span', {}, 'posti liberi'))),
      free < sel.size ? h('div', { class: 'card warn', style: { marginTop: '8px' } }, h('span', { class: 'small' }, `Mancano ${sel.size - free} posti: chi resta fuori finisce tra i non assegnati.`)) : null,
      h('div', { class: 'card', style: { marginTop: '10px' } }, toggleRow('Tieni conto dei loro voti', 'Prima prova la loro 1ª scelta e la riserva, poi un posto libero a caso', useVotes, () => { useVotes = !useVotes; refill(); })),
      groups.map(([label, list]) => {
        const allOn = list.every(id => sel.has(id));
        return [h('div', { class: 'row', style: { justifyContent: 'space-between', margin: '18px 2px 4px' } }, h('b', {}, `${label} (${list.length})`),
          h('button', { class: 'btn sm ghost', onclick: () => setAll(list, !allOn) }, allOn ? 'Togli tutti' : 'Tutti')),
          list.map(id => {
            const how = p.how?.[id];
            return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: sel.has(id), onchange: e => { e.target.checked ? sel.add(id) : sel.delete(id); refill(); } }),
              h('div', { class: 'grow' }, h('div', {}, C.fullName(st(id))), how ? h('div', { class: 'small muted' }, C.HOW_LABEL[how]) : null));
          })];
      }),
      h('div', { class: 'actions' }, h('button', { class: 'btn block violet', disabled: !sel.size, onclick: e => busy(e.currentTarget, async () => {
        const res = C.drawSelected({ assign: p.assign, how: p.how || {}, unassigned: p.unassigned || [], selected: [...sel], dates, capacity, prefill: p.prefill || {}, votes: votesMap(r), useVotes, isBlocked: blocker([], r) });
        await updateDoc(dref('rounds', r.id, 'private', 'proposal'), { assign: res.assign, how: res.how, unassigned: res.unassigned });
        close();
        await playDraw(r, { dates, assign: res.assign, unassigned: res.unassigned, drawn: [...sel] });
      }, 'Sorteggio fatto').catch(() => {}) }, icon('dice'), `Sorteggia ${sel.size || ''}`.trim())),
    ];
  });
}

function proposalEditor(r, p) {
  const dates = p.dates || [];
  const assigned = (p.mode === 'merge') ? (d => (p.prefill?.[d] || 0) + (p.assign[d] || []).length) : (d => (p.assign[d] || []).length);
  const over = dates.filter(d => assigned(d) > capOf(r.id, d));
  const votes = A.votes[r.id] || {};
  const chip = (id, d) => {
    const how = p.how?.[id]; const v = votes[id];
    const bad = d && reasonsFor(id, d, [], r).length;
    return h('button', { class: `chip tag-${how || 'none'}${bad ? ' warn' : ''}`, title: C.HOW_LABEL[how] || '', onclick: () => moveSheet(r, p, id) },
      C.fullName(st(id)), how === 'reserve' ? h('span', { class: 'muted' }, '·R') : how === 'random' || how === 'novote' ? h('span', { class: 'muted' }, '·S') : null,
      p.method === 'votes' && !v?.first ? h('span', { class: 'muted' }, '·NV') : null);
  };
  return h('div', {},
    h('div', { class: 'section-title' }, p.mode === 'merge' ? 'Ipotesi di spostamento' : 'Ipotesi di calendario'),
    h('p', { class: 'muted small', style: { marginBottom: '10px' } }, 'Tocca un nome per spostarlo. Quando hai sistemato chi è d\'accordo, usa "Sorteggia solo alcuni studenti" per gli altri. Legenda: bordo viola = 1ª scelta, ·R = riserva, ·S = sorteggiato/assegnato d\'ufficio, ·NV = non ha votato, rosso = data bloccata per lui.'),
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
      h('button', { class: 'btn block violet', onclick: () => drawPickSheet(r, p) }, icon('dice'), 'Sorteggia solo alcuni studenti'),
      h('button', { class: 'btn block ghost', onclick: e => busy(e.currentTarget, async () => {
        if (p.mode === 'merge') {
          const res = await makeMergeProposal(r, { students: p.students, dates, useVotes: !!r.revote, cancelledEventId: p.cancelledEventId });
          await playDraw(r, { dates, assign: res.assign, unassigned: res.unassigned, drawn: p.students });
        } else await makeInitialProposal(r, 'draw');
      }, 'Nuovo sorteggio fatto') }, icon('dice'), 'Rifai il sorteggio di tutti'),
      p.mode === 'initial' ? h('button', { class: 'btn block line', onclick: e => busy(e.currentTarget, () => deleteDoc(dref('rounds', r.id, 'private', 'proposal')), 'Ipotesi scartata') }, 'Scarta ipotesi') : null));
}

function moveSheet(r, p, id) {
  const cur = Object.keys(p.assign).find(d => (p.assign[d] || []).includes(id)) || null;
  const v = (A.votes[r.id] || {})[id] || {};
  const count = d => (p.prefill?.[d] || 0) + (p.assign[d] || []).length;
  const move = async (target, close) => {
    const assign = {}; for (const d of Object.keys(p.assign)) assign[d] = (p.assign[d] || []).filter(x => x !== id);
    let unassigned = (p.unassigned || []).filter(x => x !== id);
    if (target) assign[target] = [...(assign[target] || []), id]; else unassigned = [...unassigned, id];
    await busy(null, () => updateDoc(dref('rounds', r.id, 'private', 'proposal'), { assign, unassigned, [`how.${id}`]: 'manual' }), 'Spostato');
    close();
  };
  openSheet(C.fullName(st(id)), close => [
    h('p', { class: 'muted small' }, `1ª scelta: ${v.first ? C.fmtShort(v.first) : '—'} · Riserva: ${v.reserve ? C.fmtShort(v.reserve) : '—'}`),
    h('div', { class: 'section-title' }, 'Sposta in'),
    (p.dates || []).map(d => {
      const rs = reasonsFor(id, d, [], r); const n = count(d), cap = capOf(r.id, d);
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
      const drawn = ids.filter(id => C.isDrawnHow(p.how?.[id])); // per l'animazione lato studente
      const existing = p.mode === 'merge' ? roundEvents(r).find(e => e.date === d && !e.cancelled) : null;
      if (existing) b.update(dref('events', existing.id), { studentIds: [...new Set([...(existing.studentIds || []), ...ids])], drawn: [...new Set([...(existing.drawn || []), ...drawn])] });
      else b.set(doc(cref('events')), { type: 'interrogazione', subjectId: r.subjectId, date: d, studentIds: ids, drawn, roundId: r.id, cancelled: false, createdAt: serverTimestamp() });
    }
    for (const id of p.unassigned || []) b.set(doc(cref('recoveries')), { uid: id, subjectId: r.subjectId, roundId: r.id, fromDate: null, status: 'open', createdAt: serverTimestamp() });
    if (p.mode === 'initial') b.update(dref('rounds', r.id), { status: 'published' });
    else if (r.revote) b.update(dref('rounds', r.id), { revote: deleteField() });
    b.delete(dref('rounds', r.id, 'private', 'proposal'));
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
  b.update(dref('events', ev.id), { cancelled: true });
  if (extra) b.update(dref('rounds', r.id), { dates: [...new Set([...(r.dates || []), extra])].sort() });
  if (mode === 'revote') {
    b.update(dref('rounds', r.id), { revote: { active: true, students, dates } });
    students.forEach(id => b.delete(dref('rounds', r.id, 'votes', id)));
  }
  await b.commit();
  if (mode === 'auto') {
    A.events[ev.id] = { ...ev, cancelled: true }; // aggiornamento locale immediato per il calcolo
    const res = await makeMergeProposal(r, { students, dates, useVotes: false, cancelledEventId: ev.id });
    await playDraw(r, { dates, assign: res.assign, unassigned: res.unassigned, drawn: students });
  }
}
async function closeRevote(r) {
  const rv = r.revote;
  await updateDoc(dref('rounds', r.id), { 'revote.active': false });
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
        const n = (tgt?.studentIds || []).length; const rs = reasonsFor(id, d, [ev.id], r);
        return h('button', { class: 'list-item', onclick: e => busy(e.currentTarget, async () => {
          const b = writeBatch(db);
          b.update(dref('events', ev.id), { studentIds: (ev.studentIds || []).filter(x => x !== id), drawn: (ev.drawn || []).filter(x => x !== id) });
          if (tgt) b.update(dref('events', tgt.id), { studentIds: [...new Set([...(tgt.studentIds || []), id])] });
          else b.set(doc(cref('events')), { type: 'interrogazione', subjectId: ev.subjectId, date: d, studentIds: [id], roundId: r.id, cancelled: false, createdAt: serverTimestamp() });
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
          b.update(dref('events', ev.id), { studentIds: (ev.studentIds || []).filter(x => x !== id), drawn: (ev.drawn || []).filter(x => x !== id) });
          b.set(doc(cref('recoveries')), { uid: id, subjectId: ev.subjectId, roundId: ev.roundId || null, fromDate: ev.date, fromEventId: ev.id, status: 'open', createdAt: serverTimestamp() });
          await b.commit();
        }, 'Segnato da recuperare'); close();
      } }, 'Segna da recuperare'),
      !r ? h('button', { class: 'btn block line', onclick: e => busy(e.currentTarget, () => updateDoc(dref('events', ev.id), { studentIds: (ev.studentIds || []).filter(x => x !== id) }), 'Rimosso').then(close).catch(() => {}) }, 'Togli da questo evento') : null),
  ]);
}

/* =========================================================
   CALENDARIO
   ========================================================= */
function renderCal(main) {
  clearFab();
  const { hero, body } = calendar({ state: A.cal, events: events(), students: A.students, subjects: A.subjects, me: null, onChange: render, onEventClick: adminEventSheet,
    timetable: A.tt, ttChanges: A.ttChanges, onTTEdit: ttHours().length ? dayChangeSheet : null });
  pg(main, hero, body);
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
      r && !ev.cancelled && ev.date >= C.todayISO() ? h('button', { class: 'btn block danger-ghost', onclick: () => { close(); cancelDaySheet(r, ev); } }, 'Annulla giornata') : null,
      r ? h('button', { class: 'btn block ghost', onclick: () => { close(); A.tab = 'giri'; A.roundId = r.id; render(); } }, 'Apri il giro') : null,
      !r || ev.cancelled ? h('button', { class: 'btn block danger', onclick: async () => { if (await confirmSheet('Eliminare l\'evento?', 'Sparirà dal calendario di tutti.', 'Elimina', true)) { await busy(null, () => deleteDoc(dref('events', ev.id)), 'Evento eliminato'); close(); } } }, icon('trash'), 'Elimina evento') : null),
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
        await addDoc(cref('events'), { type, subjectId: subj.value, date: dateIn.value, studentIds: [...sel], roundId: null, cancelled: false, note: note.value.trim(), createdAt: serverTimestamp() });
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
  pg(main, [h('h1', {}, 'Studenti'), h('p', { class: 'sub' }, `${ids.length} account nella ${className()}`)], [
    ids.length ? ids.map(id => {
      const s = st(id); const ex = Object.keys(A.excl[id]?.dates || {}).filter(d => d >= C.todayISO()).length; const wk = Object.keys(A.excl[id]?.weekdays || {}).map(w => C.WEEKDAYS.find(x => x[0] === w)?.[1].slice(0, 3).toLowerCase()).filter(Boolean);
      return h('button', { class: 'list-item', onclick: () => studentSheet(id) }, h('span', { class: 'av' }, C.initials(s)),
        h('div', { class: 'grow' }, h('div', { class: 't' }, C.fullName(s)), h('div', { class: 's' }, s.username, wk.length ? ` · mai di ${wk.join(', ')}` : '', ex ? ` · ${ex} ${ex === 1 ? 'giorno escluso' : 'giorni esclusi'}` : '', s.rulesAccepted ? '' : ' · regole non lette')),
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
    h('p', { class: 'muted small', style: { marginBottom: '10px' } }, `Gli account vengono creati nella classe ${className()}. Uno per riga, "Nome Cognome". Per cognomi o nomi composti usa la virgola: "Maria Grazia, De Luca".`),
    ta,
    h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: async e => {
      const lines = ta.value.split('\n').map(C.parseStudentLine).filter(Boolean);
      if (!lines.length) return toast('Scrivi almeno un nome', 'error');
      const btn = e.currentTarget; btn.disabled = true;
      const taken = new Set([...Object.values(A.students).map(s => s.username), ...Object.values(A.members).map(m => m.username).filter(Boolean)]); results = [];
      for (const [i, p] of lines.entries()) {
        btn.textContent = `Creo ${i + 1} di ${lines.length}…`;
        let username = C.uniqueUsername(C.baseUsername(p.first, p.last), taken);
        let pw = C.initialPassword(username);
        try {
          // il nome utente può essere già usato in un'altra classe (che l'admin di classe non vede): provo il numero successivo
          let uid = null;
          for (let k = 0; k < 20 && !uid; k++) {
            try { uid = await createStudentAccount(C.emailOf(username), pw); }
            catch (x) { if (!/email-already-in-use/.test(x?.code || '')) throw x; taken.add(username); username = C.uniqueUsername(C.baseUsername(p.first, p.last), taken); pw = C.initialPassword(username); }
          }
          if (!uid) throw new Error('Nome utente non disponibile');
          const b = writeBatch(db);
          b.set(dref('students', uid), { first: p.first, last: p.last, username, rulesAccepted: false, createdAt: serverTimestamp() });
          b.set(doc(db, 'members', uid), { classId: CID, username });
          await b.commit();
          taken.add(username);
          results.push({ name: `${p.first} ${p.last}`, username, ok: true, note: username !== C.baseUsername(p.first, p.last) ? 'Omonimo: numero aggiunto' : pw !== username ? 'Password speciale (nome corto)' : null });
        } catch (x) { console.error(x); results.push({ name: `${p.first} ${p.last}`, username, ok: false, err: errMsg(x) }); }
      }
      refill();
    } }, 'Crea account')),
  ]);
}
function studentSheet(id) {
  const today = C.todayISO();
  const dIn = h('input', { type: 'date', min: today }); const nIn = h('input', { type: 'text', placeholder: 'Motivo (facoltativo, lo vede solo lui)' });
  const wNote = h('input', { type: 'text', placeholder: 'Motivo (es. studente atleta)' });
  let editName = false;
  openSheet('Scheda studente', (close, refill) => {
    const s = st(id); if (!s) { close(); return null; }
    const later = () => setTimeout(refill, 150);
    const ex = Object.entries(A.excl[id]?.dates || {}).sort(([a], [b]) => a.localeCompare(b));
    const weekly = A.excl[id]?.weekdays || {};
    const mine = events().filter(e => (e.studentIds || []).includes(id) && e.date >= today && !e.cancelled).sort((a, b) => a.date.localeCompare(b.date));
    const recs = Object.values(A.recov).filter(r => r.uid === id && r.status === 'open');
    const fIn = h('input', { type: 'text', value: s.first }), lIn = h('input', { type: 'text', value: s.last });
    const toggleWeekday = (wd, label) => busy(null, async () => {
      if (Object.prototype.hasOwnProperty.call(weekly, wd)) {
        await updateDoc(dref('exclusions', id), { [`weekdays.${wd}`]: deleteField() });
      } else {
        await setDoc(dref('exclusions', id), { weekdays: { [wd]: wNote.value.trim() } }, { merge: true });
        const n = mine.filter(e => e.type === 'interrogazione' && String(C.fromISO(e.date).getDay()) === wd).length;
        if (n) toast(`Attenzione: ha già ${n} interrogazion${n === 1 ? 'e' : 'i'} di ${label.toLowerCase()}`, 'error');
        wNote.value = '';
      }
    }, 'Giorno fisso aggiornato').then(later).catch(() => {});
    return [
      editName ? h('div', { class: 'card' },
        h('label', { class: 'field' }, h('span', {}, 'Nome'), fIn), h('label', { class: 'field' }, h('span', {}, 'Cognome'), lIn),
        h('p', { class: 'small muted', style: { marginBottom: '10px' } }, `Il nome utente resta ${s.username}.`),
        h('div', { class: 'row' }, h('button', { class: 'btn sm grow', onclick: e => busy(e.currentTarget, async () => {
          const first = fIn.value.trim().replace(/\s+/g, ' '), last = lIn.value.trim().replace(/\s+/g, ' ');
          if (!first || !last) throw new Error('Nome e cognome sono obbligatori');
          await updateDoc(dref('students', id), { first, last }); editName = false;
        }, 'Nome aggiornato').then(later).catch(() => {}) }, 'Salva'), h('button', { class: 'btn sm ghost grow', onclick: () => { editName = false; refill(); } }, 'Annulla')))
        : h('div', { class: 'row' }, h('span', { class: 'av', style: { width: '48px', height: '48px', fontSize: '16px', background: 'var(--surface-2)', boxShadow: 'none' } }, C.initials(s)),
          h('div', { class: 'grow' }, h('div', { style: { fontWeight: '800', fontSize: '18px' } }, C.fullName(s)),
            h('div', { class: 'small muted' }, h('span', { class: 'mono' }, s.username), s.rulesAccepted ? ' · regole lette' : ' · regole non ancora lette')),
          h('button', { class: 'btn sm ghost', onclick: () => { editName = true; refill(); } }, 'Modifica')),

      h('div', { class: 'section-title' }, 'Prossimi impegni'),
      mine.length ? mine.map(e => h('div', { class: 'list-item' }, h('span', { class: 'sdot', style: { '--c': subjColor(A.subjects, e.subjectId) } }),
        h('div', { class: 'grow' }, h('div', { class: 't' }, subjName(A.subjects, e.subjectId)), h('div', { class: 's' }, `${e.type === 'verifica' ? 'Verifica' : 'Interrogazione'} · ${C.fmtLong(e.date)}`))))
        : h('p', { class: 'small muted' }, 'Nessuno'),
      recs.length ? h('div', { class: 'card danger', style: { marginTop: '8px' } }, 'Da recuperare: ', recs.map(r => subjName(A.subjects, r.subjectId)).join(', ')) : null,

      h('div', { class: 'section-title' }, 'Giorno fisso escluso'),
      h('p', { class: 'small muted', style: { marginBottom: '10px' } }, 'Ogni settimana in quel giorno non può essere interrogato (es. studente atleta). Tocca un giorno per attivarlo o toglierlo.'),
      h('div', { class: 'chips' }, C.WEEKDAYS.map(([wd, label]) => {
        const on = Object.prototype.hasOwnProperty.call(weekly, wd);
        return h('button', { class: 'chip', style: on ? { background: '#111', color: '#fff', boxShadow: 'none' } : null, onclick: () => toggleWeekday(wd, label) }, on ? icon('lock') : null, label);
      })),
      Object.keys(weekly).length ? h('p', { class: 'small', style: { marginTop: '8px' } },
        Object.entries(weekly).map(([wd, n]) => `${C.WEEKDAYS.find(x => x[0] === wd)?.[1]}${n ? ` (${n})` : ''}`).join(', ')) : null,
      h('div', { style: { marginTop: '8px' } }, wNote),

      h('div', { class: 'section-title' }, 'Date singole escluse'),
      h('p', { class: 'small muted', style: { marginBottom: '8px' } }, 'Assenze o motivi personali: in queste date non può essere messo. Gli altri non le vedono.'),
      ex.length ? ex.map(([d, n]) => h('div', { class: 'list-item' }, h('div', { class: 'grow' }, h('div', { class: 't' }, C.cap(C.fmtLong(d))), n ? h('div', { class: 's' }, n) : null),
        h('button', { class: 'iconbtn', style: { background: 'var(--danger-soft)', color: 'var(--danger)' }, 'aria-label': 'Rimuovi', onclick: e => busy(e.currentTarget, () => updateDoc(dref('exclusions', id), { [`dates.${d}`]: deleteField() }), 'Esclusione rimossa').then(later).catch(() => {}) }, icon('trash'))))
        : h('p', { class: 'small muted' }, 'Nessuna'),
      h('div', { class: 'row', style: { marginTop: '10px', alignItems: 'stretch' } }, h('div', { class: 'grow' }, dIn), h('button', { class: 'btn ghost', onclick: e => busy(e.currentTarget, async () => {
        if (!dIn.value) throw new Error('Scegli una data');
        await setDoc(dref('exclusions', id), { dates: { [dIn.value]: nIn.value.trim() } }, { merge: true });
        const clash = events().find(ev => ev.type === 'interrogazione' && !ev.cancelled && ev.date === dIn.value && (ev.studentIds || []).includes(id));
        if (clash) toast('Attenzione: ha già un\'interrogazione in quella data', 'error');
        dIn.value = ''; nIn.value = '';
      }, 'Giorno escluso').then(later).catch(() => {}) }, icon('plus'), 'Escludi')),
      h('div', { style: { marginTop: '8px' } }, nIn),

      h('div', { class: 'actions' }, h('button', { class: 'btn block danger-ghost', onclick: async () => {
        if (!await confirmSheet('Rimuovere lo studente?', `${C.fullName(s)} sparirà dalla classe e non potrà più usare il sito. <br><br>Per liberare del tutto il nome utente elimina anche l'account da Firebase Console → Authentication.`, 'Rimuovi', true)) return;
        await busy(null, async () => { const b = writeBatch(db); b.delete(dref('students', id)); b.delete(dref('exclusions', id)); b.delete(doc(db, 'members', id)); await b.commit(); }, 'Studente rimosso'); close();
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
  const unl = Object.values(A.unlockReqs).filter(x => x.status === 'pending').sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
  pg(main, [h('h1', {}, 'Richieste'), h('p', { class: 'sub' }, 'Sblocchi, scambi da approvare e interrogazioni da recuperare.')], [
    h('div', { class: 'section-title' }, `Richieste di sblocco (${unl.length})`),
    unl.length ? unl.map(unlockReqCard) : h('p', { class: 'small muted' }, 'Nessuna richiesta di sblocco.'),
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
function unlockReqCard(x) {
  const r = A.rounds[x.roundId];
  const rs = r ? reasonsFor(x.uid, x.date) : [];
  const ev = rs.filter(y => y.kind === 'event'), ex = rs.filter(y => y.kind !== 'event');
  const already = r && C.isUnlocked(r.unlocks?.[x.uid], x.date);
  const decide = (status, btn) => busy(btn, async () => {
    const b = writeBatch(db);
    if (status === 'approved' && r) b.update(dref('rounds', r.id), { [`unlocks.${x.uid}`]: arrayUnion(x.date) });
    b.update(dref('unlockRequests', x.id), { status, updatedAt: serverTimestamp() });
    await b.commit();
  }, status === 'approved' ? 'Data sbloccata' : 'Richiesta rifiutata').catch(() => {});
  return h('div', { class: 'card white' },
    h('div', { class: 'row' }, avatar(st(x.uid)), h('div', { class: 'grow' }, h('b', {}, C.fullName(st(x.uid))),
      h('div', { class: 'small muted' }, r ? roundTitle(r) : 'Giro eliminato'))),
    h('p', { style: { marginTop: '10px' } }, 'Chiede di sbloccare ', h('b', {}, C.fmtLong(x.date)), '.'),
    ev.length ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, 'Bloccata da: ' + ev.map(y => C.reasonText(y, A.subjects, false)).join('; ')) : null,
    ex.length ? h('div', { class: 'small', style: { color: 'var(--danger)', marginTop: '4px' } }, ex.map(y => C.reasonText(y, A.subjects, false)).join('; ') + ' — resta esclusa anche se sblocchi') : null,
    already ? h('div', { class: 'small', style: { color: 'var(--ok)', marginTop: '4px', fontWeight: '700' } }, 'Già sbloccata') : null,
    x.note ? h('div', { class: 'req-note' }, '“', x.note, '”') : null,
    h('div', { class: 'row', style: { marginTop: '12px' } },
      r ? h('button', { class: 'btn sm lime grow', onclick: e => decide('approved', e.currentTarget) }, icon('unlock'), 'Sblocca') : null,
      h('button', { class: 'btn sm ghost grow', onclick: e => decide('rejected', e.currentTarget) }, 'Rifiuta')));
}
function swapCard(s) {
  const evA = A.events[s.fromEventId], evB = A.events[s.toEventId];
  const expired = !C.swappable(evA) || !C.swappable(evB);
  const valid = !expired && (evA.studentIds || []).includes(s.fromUid) && (evB.studentIds || []).includes(s.toUid);
  const rA = reasonLine(s.fromUid, s.toDate, [s.fromEventId]), rB = reasonLine(s.toUid, s.fromDate, [s.toEventId]);
  return h('div', { class: 'card white' },
    h('div', { class: 'small muted', style: { fontWeight: '700' } }, subjName(A.subjects, s.subjectId)),
    h('p', { style: { marginTop: '6px' } }, h('b', {}, C.fullName(st(s.fromUid))), ` passa da ${C.fmtShort(s.fromDate)} a ${C.fmtShort(s.toDate)}`),
    rA ? h('div', { class: 'small', style: { color: 'var(--danger)' } }, rA) : null,
    h('p', { style: { marginTop: '4px' } }, h('b', {}, C.fullName(st(s.toUid))), ` passa da ${C.fmtShort(s.toDate)} a ${C.fmtShort(s.fromDate)}`),
    rB ? h('div', { class: 'small', style: { color: 'var(--danger)' } }, rB) : null,
    !valid ? h('div', { class: 'card danger', style: { marginTop: '8px' } }, expired ? 'Non più applicabile: una delle due interrogazioni è già stata fatta o annullata.' : 'Le date sono cambiate dopo la richiesta: non è più applicabile.') : null,
    h('div', { class: 'row', style: { marginTop: '12px' } },
      valid ? h('button', { class: 'btn sm lime grow', onclick: e => busy(e.currentTarget, async () => {
        const b = writeBatch(db);
        const nd = e => (e.drawn || []).filter(x => x !== s.fromUid && x !== s.toUid);
        b.update(dref('events', evA.id), { studentIds: [...(evA.studentIds || []).filter(x => x !== s.fromUid), s.toUid], drawn: nd(evA) });
        b.update(dref('events', evB.id), { studentIds: [...(evB.studentIds || []).filter(x => x !== s.toUid), s.fromUid], drawn: nd(evB) });
        b.update(dref('swaps', s.id), { status: 'approved', updatedAt: serverTimestamp() });
        await b.commit();
      }, 'Scambio approvato') }, 'Approva') : null,
      h('button', { class: 'btn sm ghost grow', onclick: e => busy(e.currentTarget, () => updateDoc(dref('swaps', s.id), { status: 'rejected', updatedAt: serverTimestamp() }), 'Scambio rifiutato') }, 'Rifiuta')));
}
function recoverSheet(rec) {
  const dIn = h('input', { type: 'date', min: C.todayISO() });
  const r = rec.roundId ? A.rounds[rec.roundId] : null;
  openSheet('Recupero di ' + C.fullName(st(rec.uid)), (close, refill) => {
    const d = dIn.value; const rs = d ? reasonsFor(rec.uid, d) : [];
    const joinable = d ? events().find(e => e.type === 'interrogazione' && !e.cancelled && e.date === d && e.subjectId === rec.subjectId) : null;
    const assign = async (date, existing) => {
      const b = writeBatch(db);
      if (existing) b.update(dref('events', existing.id), { studentIds: [...new Set([...(existing.studentIds || []), rec.uid])] });
      else b.set(doc(cref('events')), { type: 'interrogazione', subjectId: rec.subjectId, date, studentIds: [rec.uid], roundId: rec.roundId || null, cancelled: false, note: 'Recupero', createdAt: serverTimestamp() });
      b.update(dref('recoveries', rec.id), { status: 'done', toDate: date, updatedAt: serverTimestamp() });
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
   GUIDA PER L'ADMIN
   ========================================================= */
function go(tab, more = null) { return () => { A.tab = tab; A.more = more; A.roundId = null; window.scrollTo(0, 0); render(); }; }
function showTutorial() {
  stepsSheet('Guida per l\'admin', [
    isSuper()
      ? { icon: 'school', title: 'Sei il super admin', html: `<p>Gestisci tutta la scuola: nel menu <b>Scuola</b> approvi le classi create dagli admin, crei classi nuove (partono vuote) e crei o togli gli account admin di ogni classe.</p><p>Puoi entrare in qualsiasi classe: tocca "Classe …" in alto in ogni pagina.</p>`, action: { label: 'Vai alla scuola', go: go('scuola') } }
      : { icon: 'school', title: `Benvenuto su ${C.APP_NAME}`, html: `<p>Da qui gestisci le interrogazioni programmate della <b>classe ${esc(className())}</b>. La classe parte vuota: segui i passi di questa guida per prepararla.</p><p>Gli account degli studenti si creano <b>solo da questo pannello</b>.</p>` },
    { icon: 'users', title: 'Studenti', html: `<p>In <b>Studenti → +</b> incolla l'elenco della classe, un nome per riga ("Nome Cognome"; per nomi composti: "Maria Grazia, De Luca").</p><ul><li>Nome utente: <b>nome.cognome</b>, password iniziale uguale.</li><li>I nomi utente sono unici in tutta la scuola: per gli omonimi si aggiunge un numero.</li><li>Nella scheda dello studente imposti un <b>giorno fisso escluso</b> (es. atleta) o singole <b>date escluse</b>.</li></ul>`, action: { label: 'Vai agli studenti', go: go('studenti') } },
    { icon: 'palette', title: 'Materie e orario', html: `<p>In <b>Altro</b> crea le materie con il loro colore, poi apri <b>Orario settimanale</b>: imposta le ore e tocca ogni casella per scegliere la lezione.</p><p>Gli studenti vedono l'orario nel Calendario, sotto gli impegni del giorno.</p>`, action: { label: 'Vai ad Altro', go: go('altro') } },
    { icon: 'clock', title: 'Variazioni d\'orario', html: `<p>Se un giorno l'orario cambia (uscita anticipata, assemblea, cambio d'ora) non toccare la settimana tipo: nel <b>Calendario</b> scegli il giorno e premi <b>Varia</b> sopra l'orario.</p><ul><li>Tocca un'ora per cambiarla solo in quella data.</li><li>"Uscita anticipata" libera in un colpo le ore finali.</li><li>"Ripristina" torna all'orario normale.</li></ul><p>La classe vede la scritta "Orario variato" e la tua nota.</p>`, action: { label: 'Vai al calendario', go: go('cal') } },
    { icon: 'layers', title: 'Giri di interrogazioni', html: `<p>In <b>Giri → +</b> scegli materia, chi partecipa, i giorni in cui viene il docente e quanti posti ha ogni giorno (la classe non li vede mai).</p><p>Se la materia è nell'orario, <b>Aggiungi i prossimi giorni dall'orario</b> inserisce da solo le date di lezione.</p><p>Poi <b>Apri votazione</b>: ognuno sceglie una 1ª data e una riserva. Quando hai abbastanza voti, <b>Chiudi votazione</b>.</p>`, action: { label: 'Vai ai giri', go: go('giri') } },
    { icon: 'dice', title: 'Sorteggio', html: `<p>A votazione chiusa hai due strade, e in entrambe vedi prima un'<b>ipotesi</b>: nulla è pubblico finché non la accetti.</p><ul><li><b>Sorteggio automatico</b>: tutti al loro posto in base a voti, posti e date bloccate.</li><li><b>Sistemo a mano</b>: sposti tu i nomi, poi con <b>Sorteggia solo alcuni studenti</b> selezioni chi non trova un accordo. Solo loro vengono rimessi a sorte nei posti liberi; gli altri restano fermi.</li></ul><p>Il sorteggio parte con un'animazione che puoi proiettare in classe. Chi viene sorteggiato, aprendo il sito, vede la sua data uscire dal rullo.</p>` },
    { icon: 'inbox', title: 'Richieste', html: `<p>In <b>Richieste</b> trovi:</p><ul><li><b>Sblocchi</b>: uno studente chiede di poter scegliere una data bloccata perché vicina a un'altra sua interrogazione. "Sblocca" la rende disponibile solo per quel giro.</li><li><b>Scambi</b> già accettati dal compagno, da approvare.</li><li><b>Da recuperare</b>: assegna una nuova data.</li></ul>`, action: { label: 'Vai alle richieste', go: go('richieste') } },
    { icon: 'cal', title: 'Calendario e imprevisti', html: `<p>Nel <b>Calendario</b> con il <b>+</b> aggiungi verifiche (solo promemoria) o interrogazioni singole.</p><p>Se il docente salta un giorno, apri l'evento e premi <b>Annulla giornata</b>: gli interrogati vengono spostati a sorte oppure rivotano solo loro.</p><p>Toccando un nome puoi spostarlo o segnarlo "da recuperare".</p><p>Questa guida resta sempre in <b>Altro → Guida per l'admin</b>.</p>` },
  ]);
}

/* =========================================================
   CLASSI (creazione, rinomina, eliminazione, importazione dati v9)
   ========================================================= */
const LEGACY_COLLS = ['students', 'subjects', 'timetable', 'events', 'exclusions', 'recoveries', 'swaps'];
const CLASS_COLLS = ['subjects', 'timetable', 'events', 'exclusions', 'recoveries', 'swaps', 'unlockRequests'];
const migrated = () => Object.values(A.classes).some(c => c.migratedFrom === 'legacy');
async function commitAll(ops) { // ops = [['set', ref, data] | ['delete', ref]]
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach(([k, ref, data]) => (k === 'set' ? b.set(ref, data) : b.delete(ref)));
    await b.commit();
  }
}
function renderNoClass() {
  const name = h('input', { type: 'text', placeholder: 'es. 3B', maxlength: '20' });
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('div', { class: 'logo' }, mark(34)), h('h1', {}, A.legacy && !migrated() ? 'Aggiornamento a più classi' : 'Crea la prima classe'),
    h('p', { class: 'sub' }, A.legacy && !migrated()
      ? `${C.APP_NAME} ora gestisce più classi. I dati che hai già (studenti, giri, orario…) vanno spostati una volta nella loro classe: account e password degli studenti non cambiano.`
      : 'Ogni classe ha i suoi studenti, materie, orario e giri. Potrai aggiungerne altre in qualsiasi momento.'),
    h('div', { class: 'login-form' },
      A.legacy && !migrated() ? [
        h('label', { class: 'field' }, h('span', {}, 'Nome della classe dei dati esistenti'), (name.value = '3B', name)),
        h('button', { class: 'btn block lime', onclick: e => migrateLegacy(name.value, e.currentTarget) }, 'Sposta i dati nella classe'),
      ] : [
        h('label', { class: 'field' }, h('span', {}, 'Nome della classe'), name),
        h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => { const id = await createClass(name.value); A.tab = 'studenti'; selectClass(id); }, 'Classe creata').catch(() => {}) }, 'Crea classe'),
      ]),
    h('button', { class: 'btn block line', style: { marginTop: '12px' }, onclick: () => signOut(auth) }, icon('logout'), 'Esci'))));
}
// Il super admin crea classi già attive e vuote: ognuna parte da zero
async function createClass(rawName) {
  const name = rawName.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Scrivi il nome della classe');
  if (Object.values(A.classes).some(c => (c.name || '').toLowerCase() === name.toLowerCase())) throw new Error('Esiste già una classe con questo nome');
  const ref = await addDoc(collection(db, 'classes'), { name, status: 'active', createdAt: serverTimestamp() });
  return ref.id;
}
function newClassSheet() {
  const name = h('input', { type: 'text', placeholder: 'es. 4A', maxlength: '20' });
  openSheet('Nuova classe', close => [
    h('label', { class: 'field' }, h('span', {}, 'Nome della classe'), name),
    h('p', { class: 'small muted' }, 'La classe parte vuota: niente studenti, materie, orario o giri. Dopo puoi crearle un account admin, oppure entrarci tu e configurarla.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => {
      const id = await createClass(name.value); close(); classSheet(id);
    }, 'Classe creata').catch(() => {}) }, 'Crea classe')),
  ]);
}
const adminsOf = cid => Object.values(A.classAdmins).filter(x => x.classId === cid);
const STATUS_CLS = { pending: ['In attesa', 'violet'], rejected: ['Rifiutata', 'danger'], active: ['Attiva', 'ok'] };
/* Menu "Scuola" (solo super admin): richieste di nuove classi, tutte le classi, account admin */
function renderSchool(main) {
  clearFab();
  const list = sortedClasses();
  const pending = list.filter(c => c.status === 'pending');
  const others = list.filter(c => c.status !== 'pending');
  pg(main, [h('h1', {}, 'Scuola'), h('p', { class: 'sub' }, (() => { const n = others.filter(isActive).length; return `${n} ${n === 1 ? 'classe attiva' : 'classi attive'} · ${Object.keys(A.members).length} studenti · ${Object.keys(A.classAdmins).length} admin di classe`; })())], [
    h('div', { class: 'section-title' }, `Richieste di nuove classi (${pending.length})`),
    pending.length ? pending.map(c => h('div', { class: 'card white' },
      h('div', { class: 'row' }, h('span', { class: 'av' }, (c.name || '?').slice(0, 3)),
        h('div', { class: 'grow' }, h('b', {}, `Classe ${c.name}`), h('div', { class: 'small muted' }, `${c.adminName || 'Admin'} · `, h('span', { class: 'mono' }, c.adminUsername || '')))),
      h('div', { class: 'row', style: { marginTop: '12px' } },
        h('button', { class: 'btn sm lime grow', onclick: e => busy(e.currentTarget, () => updateDoc(doc(db, 'classes', c.id), { status: 'active' }), 'Classe approvata').catch(() => {}) }, icon('check'), 'Approva'),
        h('button', { class: 'btn sm ghost grow', onclick: async e => { const b = e.currentTarget; if (await confirmSheet('Rifiutare la richiesta?', `${esc(c.adminName || 'L\'admin')} non potrà usare la classe ${esc(c.name)}. Potrai sempre eliminarla dalla sua scheda.`, 'Rifiuta', true)) busy(b, () => updateDoc(doc(db, 'classes', c.id), { status: 'rejected' }), 'Richiesta rifiutata').catch(() => {}); } }, 'Rifiuta'))))
      : h('p', { class: 'small muted' }, 'Nessuna richiesta. Quando un admin si iscrive dalla pagina di accesso, la sua classe compare qui.'),
    h('div', { class: 'section-title' }, 'Classi'),
    others.map(c => {
      const [lab, cls] = STATUS_CLS[c.status || 'active'];
      const adm = adminsOf(c.id);
      return h('button', { class: 'list-item', onclick: () => classSheet(c.id) },
        h('span', { class: 'av' }, (c.name || '?').slice(0, 3)),
        h('div', { class: 'grow' }, h('div', { class: 't' }, `Classe ${c.name}`),
          h('div', { class: 's' }, `${membersOf(c.id).length} studenti · `, adm.length ? `admin: ${adm.map(x => x.username).join(', ')}` : 'nessun admin', c.id === CID ? ' · aperta ora' : '')),
        isActive(c) ? null : h('span', { class: 'pill ' + cls }, lab), icon('right', 'chev'));
    }),
    h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: newClassSheet }, icon('plus'), 'Nuova classe')),
    A.legacy ? [h('div', { class: 'section-title' }, 'Dati della versione precedente'),
      migrated()
        ? h('div', { class: 'card warn' }, h('p', { class: 'small' }, 'I vecchi dati sono già stati copiati nella loro classe, ma sono ancora presenti nel database. Quando hai controllato che è tutto a posto puoi eliminarli.'),
          h('button', { class: 'btn sm danger-ghost', style: { marginTop: '10px' }, onclick: deleteLegacy }, icon('trash'), 'Elimina i vecchi dati'))
        : h('div', { class: 'card warn' }, h('p', { class: 'small' }, 'Ci sono dati della versione a una sola classe non ancora spostati.'),
          h('button', { class: 'btn sm', style: { marginTop: '10px' }, onclick: e => migrateLegacy('3B', e.currentTarget) }, 'Spostali in una nuova classe "3B"'))] : null,
  ]);
}
function classSheet(cid) {
  if (!A.classes[cid]) return;
  const name = h('input', { type: 'text', value: A.classes[cid].name || '', maxlength: '20' });
  openSheet(`Classe ${A.classes[cid].name}`, (close, refill) => {
    const c = A.classes[cid]; if (!c) { close(); return null; }
    const n = membersOf(cid).length; const adm = adminsOf(cid);
    const [lab, cls] = STATUS_CLS[c.status || 'active'];
    const later = () => setTimeout(refill, 200);
    return [
      h('div', { class: 'row wrap', style: { marginBottom: '12px' } }, h('span', { class: 'pill ' + cls }, lab), h('span', { class: 'pill grey' }, `${n} studenti`)),
      !isActive(c) ? h('div', { class: 'row', style: { marginBottom: '14px' } },
        h('button', { class: 'btn sm lime grow', onclick: e => busy(e.currentTarget, () => updateDoc(doc(db, 'classes', cid), { status: 'active' }), 'Classe approvata').then(later).catch(() => {}) }, icon('check'), c.status === 'rejected' ? 'Approva comunque' : 'Approva'),
        c.status === 'pending' ? h('button', { class: 'btn sm ghost grow', onclick: e => busy(e.currentTarget, () => updateDoc(doc(db, 'classes', cid), { status: 'rejected' }), 'Richiesta rifiutata').then(later).catch(() => {}) }, 'Rifiuta') : null) : null,
      h('label', { class: 'field' }, h('span', {}, 'Nome'), name),
      h('button', { class: 'btn sm ghost', onclick: e => busy(e.currentTarget, async () => {
        const v = name.value.trim().replace(/\s+/g, ' ');
        if (!v) throw new Error('Scrivi il nome della classe');
        if (Object.values(A.classes).some(x => x.id !== cid && (x.name || '').toLowerCase() === v.toLowerCase())) throw new Error('Esiste già una classe con questo nome');
        await updateDoc(doc(db, 'classes', cid), { name: v });
      }, 'Classe rinominata').then(later).catch(() => {}) }, 'Salva il nome'),

      h('div', { class: 'section-title' }, 'Account admin della classe'),
      adm.length ? adm.map(x => h('div', { class: 'list-item' }, h('span', { class: 'av' }, icon('user')),
        h('div', { class: 'grow' }, h('div', { class: 't' }, x.name || x.username), h('div', { class: 's mono' }, x.username)),
        h('button', { class: 'btn sm danger-ghost', onclick: async () => {
          if (!await confirmSheet('Togliere l\'accesso?', `${esc(x.name || x.username)} non potrà più gestire la classe ${esc(c.name)}. Per liberare del tutto il nome utente elimina anche l'account da Firebase Console → Authentication.`, 'Togli accesso', true)) return;
          busy(null, () => deleteDoc(doc(db, 'classAdmins', x.id)), 'Accesso tolto').then(later).catch(() => {});
        } }, 'Togli')))
        : h('p', { class: 'small muted' }, 'Nessun admin: per ora la gestisci solo tu.'),
      h('button', { class: 'btn sm ghost', style: { marginTop: '8px' }, onclick: () => newAdminSheet(cid, later) }, icon('plus'), 'Crea un account admin'),

      h('div', { class: 'actions' },
        isActive(c) && cid !== CID ? h('button', { class: 'btn block', onclick: () => { close(); A.tab = 'giri'; A.more = null; window.scrollTo(0, 0); selectClass(cid); } }, 'Entra nella classe') : null,
        h('button', { class: 'btn block danger-ghost', onclick: async () => {
          if (n) return toast(`Prima rimuovi i ${n} studenti della classe`, 'error');
          if (!await confirmSheet('Eliminare la classe?', `Verranno cancellati materie, orario, giri, calendario e accessi admin della classe ${esc(c.name)}. Non si può annullare.`, 'Elimina', true)) return;
          await busy(null, () => deleteClassData(cid), 'Classe eliminata'); close();
        } }, icon('trash'), 'Elimina classe')),
      n ? h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Si può eliminare solo una classe senza studenti.') : null,
    ];
  });
}
/* Il super admin crea l'account admin di una classe (es. per la 3B) senza uscire dal proprio */
function newAdminSheet(cid, after) {
  const name = h('input', { type: 'text', placeholder: 'es. Mario Rossi', maxlength: '60' });
  const user = h('input', { type: 'text', placeholder: `es. admin.${C.slug(className(cid))}`, autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false' });
  const pw = h('input', { type: 'text', autocomplete: 'off', placeholder: 'almeno 6 caratteri' });
  openSheet(`Admin della ${className(cid)}`, close => [
    h('label', { class: 'field' }, h('span', {}, 'Nome e cognome'), name),
    h('label', { class: 'field' }, h('span', {}, 'Nome utente'), user),
    h('label', { class: 'field' }, h('span', {}, 'Password iniziale'), pw),
    h('p', { class: 'small muted' }, 'Comunica nome utente e password alla persona: potrà cambiare la password da Altro, nel suo pannello.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => {
      const u = user.value.trim().toLowerCase(); const n = name.value.trim().replace(/\s+/g, ' ');
      if (!n || !u) throw new Error('Compila nome e nome utente');
      if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(u)) throw new Error('Nome utente: almeno 3 caratteri, solo lettere minuscole, numeri, punto o trattino');
      if (pw.value.length < 6) throw new Error('La password deve avere almeno 6 caratteri');
      let uid;
      try { uid = await createStudentAccount(C.emailOf(u), pw.value); }
      catch (x) { if (/email-already-in-use/.test(x?.code || '')) throw new Error('Questo nome utente è già usato'); throw x; }
      await setDoc(doc(db, 'classAdmins', uid), { classId: cid, username: u, name: n, createdAt: serverTimestamp() });
      close(); after?.();
    }, 'Account admin creato').catch(() => {}) }, 'Crea account')),
  ]);
}
function changePasswordSheet() {
  const cur = h('input', { type: 'password', autocomplete: 'current-password' });
  const nw = h('input', { type: 'password', autocomplete: 'new-password' }), nw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  openSheet('Cambia password', close => [
    h('label', { class: 'field' }, h('span', {}, 'Password attuale'), cur),
    h('label', { class: 'field' }, h('span', {}, 'Nuova password'), nw),
    h('label', { class: 'field' }, h('span', {}, 'Ripeti nuova password'), nw2),
    h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => {
      if (nw.value.length < 6) throw new Error('La nuova password deve avere almeno 6 caratteri');
      if (nw.value !== nw2.value) throw new Error('Le due password non coincidono');
      const u = auth.currentUser;
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur.value));
      await updatePassword(u, nw.value);
    }, 'Password cambiata').then(close).catch(() => {}) }, 'Salva password')),
  ]);
}
async function deleteClassData(cid) {
  const ops = [];
  for (const coll of [...CLASS_COLLS, 'students']) (await getDocs(collection(db, 'classes', cid, coll))).forEach(d => ops.push(['delete', d.ref]));
  for (const r of (await getDocs(collection(db, 'classes', cid, 'rounds'))).docs) {
    for (const sub of ['votes', 'private']) (await getDocs(collection(db, 'classes', cid, 'rounds', r.id, sub))).forEach(d => ops.push(['delete', d.ref]));
    ops.push(['delete', r.ref]);
  }
  adminsOf(cid).forEach(x => ops.push(['delete', doc(db, 'classAdmins', x.id)]));
  ops.push(['delete', doc(db, 'classes', cid)]);
  if (cid === CID) selectClass(null);
  await commitAll(ops);
}
/* Copia i dati della v9 (tutto nella radice) dentro classes/{cid}, con gli stessi ID: i riferimenti tra documenti restano validi */
async function migrateLegacy(rawName, btn) {
  const name = (rawName || '').trim() || '3B';
  if (!await confirmSheet('Spostare i dati?', `Studenti, materie, orario, giri, voti, calendario e richieste vengono copiati nella classe <b>${esc(name)}</b>. Account e password degli studenti restano gli stessi. I vecchi dati non vengono cancellati: potrai eliminarli dopo aver controllato.`, 'Sposta i dati')) return;
  await busy(btn, async () => {
    const cid = A.classes['3b'] ? doc(collection(db, 'classes')).id : '3b';
    const to = (...p) => doc(db, 'classes', cid, ...p);
    const ops = [];
    for (const coll of LEGACY_COLLS) {
      (await getDocs(collection(db, coll))).forEach(d => {
        ops.push(['set', to(coll, d.id), d.data()]);
        if (coll === 'students') ops.push(['set', doc(db, 'members', d.id), { classId: cid, username: d.data().username || '' }]);
      });
    }
    for (const r of (await getDocs(collection(db, 'rounds'))).docs) {
      ops.push(['set', to('rounds', r.id), r.data()]);
      for (const sub of ['votes', 'private']) (await getDocs(collection(db, 'rounds', r.id, sub))).forEach(d => ops.push(['set', to('rounds', r.id, sub, d.id), d.data()]));
    }
    await commitAll(ops);
    await setDoc(doc(db, 'classes', cid), { name, status: 'active', createdAt: serverTimestamp(), migratedFrom: 'legacy' });
    store.set(CID_KEY, cid);
  }, 'Dati spostati nella nuova classe').catch(() => {});
}
async function deleteLegacy() {
  if (!await confirmSheet('Eliminare i vecchi dati?', 'Cancella la copia della versione precedente (quella fuori dalle classi). I dati nelle classi non vengono toccati. Non si può annullare.', 'Elimina', true)) return;
  await busy(null, async () => {
    const ops = [];
    for (const coll of LEGACY_COLLS) (await getDocs(collection(db, coll))).forEach(d => ops.push(['delete', d.ref]));
    for (const r of (await getDocs(collection(db, 'rounds'))).docs) {
      for (const sub of ['votes', 'private']) (await getDocs(collection(db, 'rounds', r.id, sub))).forEach(d => ops.push(['delete', d.ref]));
      ops.push(['delete', r.ref]);
    }
    await commitAll(ops);
    A.legacy = false;
  }, 'Vecchi dati eliminati');
}

/* =========================================================
   ALTRO (materie, account)
   ========================================================= */
function renderMore(main) {
  clearFab();
  if (A.more === 'orario') return renderTimetable(main);
  const subs = Object.values(A.subjects).sort((a, b) => a.name.localeCompare(b.name));
  pg(main, [h('h1', {}, 'Altro'), h('p', { class: 'sub' }, `Materie, orario e impostazioni della ${className()}`)], [
    isSuper() ? h('button', { class: 'list-item', onclick: () => { A.tab = 'scuola'; window.scrollTo(0, 0); render(); } }, icon('school'),
      h('div', { class: 'grow' }, h('div', { class: 't' }, 'Gestione della scuola'), h('div', { class: 's' }, 'Classi, richieste e account admin')), icon('right', 'chev')) : null,
    h('button', { class: 'list-item', onclick: () => showTutorial() }, icon('book'),
      h('div', { class: 'grow' }, h('div', { class: 't' }, 'Guida per l\'admin'), h('div', { class: 's' }, 'Come si usa il pannello, passo per passo')), icon('right', 'chev')),
    isSuper() && A.legacy && migrated() ? h('div', { class: 'card warn', style: { marginTop: '10px' } }, h('span', { class: 'small' }, 'Ci sono ancora i vecchi dati della versione precedente: puoi eliminarli da Scuola.')) : null,
    h('div', { class: 'spacer' }), h('div', { class: 'spacer' }),
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('div', { class: 'section-title', style: { margin: '2px' } }, 'Materie'),
      h('button', { class: 'btn sm', onclick: () => subjectSheet() }, icon('plus'), 'Nuova')),
    subs.length ? subs.map(s => h('button', { class: 'list-item', onclick: () => subjectSheet(s) }, h('span', { class: 'sdot', style: { '--c': s.color, width: '22px', height: '22px', borderRadius: '8px' } }),
      h('div', { class: 'grow' }, h('div', { class: 't' }, s.name)), icon('right', 'chev')))
      : h('p', { class: 'small muted', style: { marginTop: '8px' } }, 'Nessuna materia. Creane una per iniziare.'),
    h('div', { class: 'section-title' }, 'Classe'),
    (() => {
      const hrs = ttHours().length; const n = C.WEEKDAYS.reduce((a, [w]) => a + ttRow(w).filter(c => !C.ttEmpty(c)).length, 0);
      return h('button', { class: 'list-item', onclick: () => { A.more = 'orario'; window.scrollTo(0, 0); render(); } }, icon('cal'),
        h('div', { class: 'grow' }, h('div', { class: 't' }, 'Orario settimanale'),
          h('div', { class: 's' }, hrs ? `${hrs} ore al giorno · ${n} lezioni inserite` + (upcomingChanges().length ? ` · ${upcomingChanges().length} variazioni in arrivo` : '') : 'Non ancora inserito')), icon('right', 'chev'));
    })(),
    h('div', { class: 'section-title' }, 'Sito'),
    h('a', { class: 'list-item', href: '../', target: '_blank', style: { color: 'inherit', textDecoration: 'none' } }, icon('ext'), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Apri il sito studenti'))),
    h('button', { class: 'list-item', onclick: changePasswordSheet }, icon('key'), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Cambia password'), h('div', { class: 's mono' }, auth.currentUser?.email?.replace('@' + C.DOMAIN, '') || ''))),
    h('button', { class: 'list-item', onclick: async () => { if (await confirmSheet('Uscire?', 'Dovrai rientrare con le credenziali admin.', 'Esci')) signOut(auth); } }, icon('logout'), h('div', { class: 'grow' }, h('div', { class: 't' }, 'Esci'))),
    h('p', { class: 'small muted', style: { textAlign: 'center', marginTop: '24px' } }, `Versione ${C.VERSION}`),
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
        if (s) await updateDoc(dref('subjects', s.id), { name: n, color }); else await addDoc(cref('subjects'), { name: n, color });
      }, 'Materia salvata').then(close).catch(() => {}) }, 'Salva'),
      s ? h('button', { class: 'btn block danger-ghost', onclick: async () => {
        const used = events().some(e => e.subjectId === s.id) || Object.values(A.rounds).some(r => r.subjectId === s.id) || C.subjectWeekdays(A.tt, s.id).length > 0;
        if (used) return toast('Materia in uso in eventi, giri o nell\'orario: non si può eliminare', 'error');
        if (await confirmSheet('Eliminare la materia?', '', 'Elimina', true)) { await busy(null, () => deleteDoc(dref('subjects', s.id)), 'Materia eliminata'); close(); }
      } }, 'Elimina') : null),
  ]);
}

/* =========================================================
   ORARIO SETTIMANALE (Altro → Orario settimanale)
   Un solo documento: timetable/week
   ========================================================= */
const ttHours = () => A.tt?.hours || [];
const ttRow = wd => A.tt?.days?.[wd] || [];
const dayLabel = wd => C.WEEKDAYS.find(x => x[0] === wd)?.[1] || '';
// Riallinea ogni giorno al numero di ore (Firestore non accetta undefined: le ore libere sono null)
function normDays(days, n) {
  const out = {};
  for (const [w] of C.WEEKDAYS) out[w] = Array.from({ length: n }, (_, i) => (C.ttEmpty(days?.[w]?.[i]) ? null : days[w][i]));
  return out;
}
async function saveTT({ hours = ttHours(), days = A.tt?.days || {} } = {}) {
  await setDoc(dref('timetable', 'week'), { hours, days: normDays(days, hours.length), updatedAt: serverTimestamp() });
}

function renderTimetable(main) {
  const hours = ttHours(); const wd = A.ttDay; const row = ttRow(wd);
  const subsCount = Object.keys(A.subjects).length;
  pg(main, [
    h('button', { class: 'back', onclick: () => { A.more = null; render(); } }, icon('left'), 'Altro'),
    h('h1', {}, 'Orario settimanale'),
    h('p', { class: 'sub' }, 'Lo vede tutta la classe nel calendario, sotto gli impegni del giorno.'),
    hours.length ? h('div', { class: 'seg', style: { marginTop: '14px' } },
      C.WEEKDAYS.map(([w, l]) => h('button', { class: w === wd ? 'active' : '', onclick: () => { A.ttDay = w; render(); } }, l.slice(0, 3)))) : null,
  ], hours.length ? [
    h('div', { class: 'day-title' }, h('h2', {}, dayLabel(wd)),
      h('span', { class: 'muted small' }, `${row.filter(c => !C.ttEmpty(c)).length} su ${hours.length} ore`)),
    !subsCount ? h('div', { class: 'card warn', style: { marginBottom: '10px' } }, h('span', { class: 'small' }, 'Non hai ancora creato materie: puoi scrivere le lezioni come testo libero, oppure crea prima le materie in Altro.')) : null,
    hours.map((hr, i) => {
      const c = row[i] || null; const empty = C.ttEmpty(c);
      return h('button', { class: 'tt-row' + (empty ? ' free' : ''), style: { '--c': cellColor(c, A.subjects) }, onclick: () => cellSheet(wd, i) },
        h('div', { class: 'tt-when' }, h('b', {}, `${C.ordinal(i)} ora`), h('small', {}, `${hr.start}–${hr.end}`)),
        h('div', { class: 'tt-bar' }),
        h('div', { class: 'grow' }, h('div', { class: 't' }, empty ? 'Libera · tocca per inserire' : cellName(c, A.subjects)), !empty && c.n ? h('div', { class: 's' }, c.n) : null),
        icon('right', 'chev'));
    }),
    h('div', { class: 'row wrap', style: { marginTop: '12px' } },
      h('button', { class: 'btn sm ghost', onclick: () => copyDaySheet(wd) }, 'Copia da un altro giorno'),
      row.some(c => !C.ttEmpty(c)) ? h('button', { class: 'btn sm danger-ghost', onclick: async () => {
        if (!(await confirmSheet(`Svuotare ${dayLabel(wd).toLowerCase()}?`, 'Tutte le ore del giorno diventano libere.', 'Svuota', true))) return;
        await busy(null, () => saveTT({ days: { ...(A.tt?.days || {}), [wd]: [] } }), 'Giorno svuotato');
      } }, 'Svuota giorno') : null),

    h('div', { class: 'section-title' }, 'Tutta la settimana'),
    h('p', { class: 'small muted', style: { margin: '-4px 2px 10px' } }, 'Tocca una casella per modificarla.'),
    weekGrid(A.tt, A.subjects, { onCell: (w, i) => cellSheet(w, i) }),

    h('div', { class: 'section-title' }, 'Variazioni di singole giornate'),
    h('p', { class: 'small muted', style: { margin: '-4px 2px 10px' } }, 'Uscite anticipate, assemblee, cambi d\'ora: valgono solo per quella data. Si possono fare anche dal Calendario.'),
    upcomingChanges().map(([d, ch]) => h('button', { class: 'list-item', onclick: () => dayChangeSheet(d) }, icon('clock'),
      h('div', { class: 'grow' }, h('div', { class: 't' }, C.cap(C.fmtLong(d))), h('div', { class: 's' }, ch.note || `${(ch.row || []).filter(c => !C.ttEmpty(c)).length} ore di lezione`)), icon('right', 'chev'))),
    (() => {
      const dIn = h('input', { type: 'date', min: C.todayISO() });
      return h('div', { class: 'row', style: { marginTop: '8px', alignItems: 'stretch' } }, h('div', { class: 'grow' }, dIn),
        h('button', { class: 'btn ghost', onclick: () => { if (!dIn.value) return toast('Scegli una data', 'error'); dayChangeSheet(dIn.value); } }, icon('plus'), 'Varia'));
    })(),
    pastChanges().length ? h('button', { class: 'btn sm line', style: { marginTop: '10px' }, onclick: e => busy(e.currentTarget,
      () => updateDoc(dref('timetable', 'changes'), Object.fromEntries(pastChanges().map(d => [`dates.${d}`, deleteField()]))), 'Variazioni passate eliminate') }, `Elimina le ${pastChanges().length} variazioni passate`) : null,

    h('div', { class: 'section-title' }, 'Ore e orari'),
    hours.map((hr, i) => h('button', { class: 'list-item', onclick: () => hourSheet(i) },
      h('span', { class: 'av' }, C.ordinal(i)),
      h('div', { class: 'grow' }, h('div', { class: 't' }, `${hr.start} – ${hr.end}`), h('div', { class: 's' }, `${C.ordinal(i)} ora`)),
      icon('right', 'chev'))),
    h('div', { class: 'row wrap', style: { marginTop: '12px' } },
      h('button', { class: 'btn sm', onclick: () => hourSheet(null) }, icon('plus'), 'Aggiungi ora'),
      h('button', { class: 'btn sm line', onclick: () => setupHoursSheet() }, 'Rigenera gli orari')),
  ] : [
    h('div', { class: 'empty' }, h('b', {}, 'Orario non ancora inserito'), 'Prima imposta le ore della giornata (inizio, durata, quante sono), poi inserisci le materie giorno per giorno.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: () => setupHoursSheet() }, 'Imposta le ore')),
  ]);
}

/* Genera le fasce orarie tutte uguali (le singole ore si possono poi ritoccare, es. per la ricreazione) */
function setupHoursSheet() {
  const old = ttHours();
  const start = h('input', { type: 'time', value: old[0]?.start || '08:00' });
  const dur = h('input', { type: 'number', min: '20', max: '120', inputmode: 'numeric', value: '60' });
  const count = h('input', { type: 'number', min: '1', max: '10', inputmode: 'numeric', value: String(old.length || 6) });
  openSheet(old.length ? 'Rigenera gli orari' : 'Imposta le ore', close => [
    h('p', { class: 'muted', style: { marginBottom: '14px' } }, old.length
      ? 'Ricalcola inizio e fine di tutte le ore. Le materie già inserite restano al loro posto (1ª ora, 2ª ora…).'
      : 'Le ore vengono create tutte della stessa durata: poi puoi modificarne una per una.'),
    h('label', { class: 'field' }, h('span', {}, 'La 1ª ora inizia alle'), start),
    h('div', { class: 'row' },
      h('label', { class: 'field grow' }, h('span', {}, 'Durata (minuti)'), dur),
      h('label', { class: 'field grow' }, h('span', {}, 'Ore al giorno'), count)),
    h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => {
      const d = parseInt(dur.value, 10), n = parseInt(count.value, 10);
      if (!start.value) throw new Error('Scegli l\'orario di inizio');
      if (!(d >= 20 && d <= 120)) throw new Error('Durata tra 20 e 120 minuti');
      if (!(n >= 1 && n <= 10)) throw new Error('Da 1 a 10 ore al giorno');
      if (n < old.length && C.WEEKDAYS.some(([w]) => ttRow(w).slice(n).some(c => !C.ttEmpty(c)))
        && !(await confirmSheet('Togliere delle ore?', `Le lezioni inserite dopo la ${C.ordinal(n - 1)} ora verranno cancellate.`, 'Continua', true))) throw new Error('Operazione annullata');
      const hours = Array.from({ length: n }, (_, i) => ({ start: C.addMinutes(start.value, i * d), end: C.addMinutes(start.value, (i + 1) * d) }));
      await saveTT({ hours });
    }, 'Orari salvati').then(close).catch(() => {}) }, 'Salva')),
  ]);
}

function hourSheet(i = null) {
  const hours = ttHours(); const hr = i == null ? null : hours[i];
  const lastEnd = hours[hours.length - 1]?.end || '08:00';
  const start = h('input', { type: 'time', value: hr?.start || lastEnd });
  const end = h('input', { type: 'time', value: hr?.end || C.addMinutes(lastEnd, 60) });
  openSheet(hr ? `${C.ordinal(i)} ora` : 'Nuova ora', close => [
    h('div', { class: 'row' },
      h('label', { class: 'field grow' }, h('span', {}, 'Inizio'), start),
      h('label', { class: 'field grow' }, h('span', {}, 'Fine'), end)),
    hr ? null : h('p', { class: 'small muted' }, `Diventa la ${C.ordinal(hours.length)} ora, in fondo alla giornata.`),
    h('div', { class: 'actions' },
      h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => {
        if (!start.value || !end.value) throw new Error('Inserisci inizio e fine');
        if (end.value <= start.value) throw new Error('La fine deve essere dopo l\'inizio');
        if (hours.length >= 10 && !hr) throw new Error('Massimo 10 ore al giorno');
        const next = hours.map(x => ({ ...x }));
        if (hr) next[i] = { start: start.value, end: end.value }; else next.push({ start: start.value, end: end.value });
        await saveTT({ hours: next });
      }, 'Ora salvata').then(close).catch(() => {}) }, 'Salva'),
      hr ? h('button', { class: 'btn block danger-ghost', onclick: async () => {
        const used = C.WEEKDAYS.some(([w]) => !C.ttEmpty(ttRow(w)[i]));
        if (!(await confirmSheet(`Eliminare la ${C.ordinal(i)} ora?`, used ? 'Le lezioni di quest\'ora vengono cancellate e le ore successive scalano di una.' : 'Le ore successive scalano di una.', 'Elimina', true))) return;
        const days = {}; for (const [w] of C.WEEKDAYS) days[w] = ttRow(w).filter((_, j) => j !== i);
        await busy(null, () => saveTT({ hours: hours.filter((_, j) => j !== i), days }), 'Ora eliminata'); close();
      } }, icon('trash'), 'Elimina quest\'ora') : null),
  ]);
}

function cellSheet(wd, i, date = null, after = null) {
  const hr = ttHours()[i]; if (!hr) return;
  const c = date ? C.dayRow(A.tt, A.ttChanges, date)[i] : (ttRow(wd)[i] || null);
  const subs = Object.values(A.subjects).sort((a, b) => a.name.localeCompare(b.name));
  let sel = C.ttEmpty(c) ? '' : c.s ? c.s : '__text';
  const text = h('input', { type: 'text', value: c?.t || '', placeholder: 'es. Religione, Ed. civica' });
  const note = h('input', { type: 'text', value: c?.n || '', placeholder: 'Facoltativa (es. Laboratorio, Palestra)' });
  const nextFree = i + 1 < ttHours().length;
  let alsoNext = false;
  const radio = (val, label, color) => h('label', { class: 'radio-row' },
    h('input', { type: 'radio', name: 'ttcell', checked: sel === val, onchange: () => { sel = val; if (val === '__text') setTimeout(() => text.focus(), 0); } }),
    color ? h('span', { class: 'sdot', style: { '--c': color, width: '18px', height: '18px', borderRadius: '6px' } }) : null,
    h('div', { class: 'grow', style: { fontWeight: '700' } }, label));
  openSheet(`${date ? C.cap(C.fmtShort(date)) : dayLabel(wd)} · ${C.ordinal(i)} ora`, close => [
    h('p', { class: 'small muted', style: { marginBottom: '8px' } }, `${hr.start}–${hr.end}` + (date ? ' · solo per questa data' : '')),
    subs.map(s => radio(s.id, s.name, s.color)),
    (() => {
      const r = h('input', { type: 'radio', name: 'ttcell', checked: sel === '__text', onchange: () => { sel = '__text'; } });
      text.oninput = () => { sel = '__text'; r.checked = true; }; // scrivendo si seleziona da solo
      return h('label', { class: 'radio-row' }, r,
        h('div', { class: 'grow' }, h('div', { style: { fontWeight: '700', marginBottom: '6px' } }, 'Altra lezione (testo libero)'), text));
    })(),
    radio('', 'Ora libera / nessuna lezione'),
    h('label', { class: 'field', style: { marginTop: '14px' } }, h('span', {}, 'Nota'), note),
    nextFree ? h('label', { class: 'check', style: { borderBottom: 0 } },
      h('input', { type: 'checkbox', onchange: e => (alsoNext = e.target.checked) }),
      h('div', { class: 'grow' }, `Uguale anche alla ${C.ordinal(i + 1)} ora (ora doppia)`)) : null,
    h('div', { class: 'actions' }, h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, async () => {
      if (text === document.activeElement) text.blur();
      let cell = null;
      if (sel === '__text') { const t = text.value.trim(); if (!t) throw new Error('Scrivi il nome della lezione'); cell = { t }; }
      else if (sel) cell = { s: sel };
      if (cell && note.value.trim()) cell.n = note.value.trim();
      const r = date ? C.dayRow(A.tt, A.ttChanges, date) : Array.from({ length: ttHours().length }, (_, j) => ttRow(wd)[j] || null);
      r[i] = cell; if (alsoNext && nextFree) r[i + 1] = cell ? { ...cell } : null;
      if (date) await saveChange(date, r, C.dayChange(A.ttChanges, date)?.note || '');
      else await saveTT({ days: { ...(A.tt?.days || {}), [wd]: r } });
    }, date ? 'Variazione salvata' : 'Orario aggiornato').then(() => { close(); after?.(); }).catch(() => {}) }, 'Salva')),
  ]);
}

/* ---------- Variazioni di una singola giornata (timetable/changes) ---------- */
const upcomingChanges = () => Object.entries(A.ttChanges?.dates || {}).filter(([d]) => d >= C.todayISO()).sort(([a], [b]) => a.localeCompare(b));
const pastChanges = () => Object.keys(A.ttChanges?.dates || {}).filter(d => d < C.todayISO());
const normRow = row => Array.from({ length: ttHours().length }, (_, i) => (C.ttEmpty(row[i]) ? null : row[i]));
async function saveChange(date, row, note = '') {
  await setDoc(dref('timetable', 'changes'), { dates: { [date]: { row: normRow(row), note: note.trim() } }, updatedAt: serverTimestamp() }, { merge: true });
}
const removeChange = date => updateDoc(dref('timetable', 'changes'), { [`dates.${date}`]: deleteField() });
function dayChangeSheet(date) {
  if (!ttHours().length) { toast('Prima imposta le ore in Altro → Orario settimanale', 'error'); return; }
  if (C.isWeekend(date)) { toast('Sabato e domenica non si va a scuola', 'error'); return; }
  const note = h('input', { type: 'text', placeholder: 'es. Uscita anticipata, assemblea d\'istituto', value: C.dayChange(A.ttChanges, date)?.note || '' });
  openSheet('Orario di ' + C.fmtLong(date), (close, refill) => {
    const later = () => setTimeout(refill, 200);
    const ch = C.dayChange(A.ttChanges, date);
    const base = Array.from({ length: ttHours().length }, (_, i) => ttRow(C.weekdayOf(date))[i] || null);
    const row = C.dayRow(A.tt, A.ttChanges, date);
    const differs = i => !(C.ttEmpty(base[i]) && C.ttEmpty(row[i])) && !C.sameCell(base[i], row[i]);
    const evs = events().filter(e => e.date === date && !e.cancelled && e.type === 'interrogazione');
    const missing = [...new Set(evs.map(e => e.subjectId))].filter(sid => !row.some(c => c?.s === sid));
    const lastLesson = row.reduce((a, c, i) => (C.ttEmpty(c) ? a : i), -1);
    return [
      h('p', { class: 'small muted', style: { marginBottom: '10px' } }, ch ? 'Questa giornata ha un orario diverso dal solito. La settimana tipo non cambia.' : 'Tocca un\'ora per cambiarla solo in questa data. La settimana tipo non cambia.'),
      missing.length ? h('div', { class: 'card warn', style: { marginBottom: '10px' } }, h('span', { class: 'small' }, `Attenzione: quel giorno ci sono interrogazioni di ${missing.map(id => subjName(A.subjects, id)).join(', ')}, ma la materia non è più nell'orario.`)) : null,
      ttHours().map((hr, i) => {
        const c = row[i]; const empty = C.ttEmpty(c);
        return h('button', { class: 'tt-row' + (empty ? ' free' : '') + (differs(i) ? ' changed' : ''), style: { '--c': cellColor(c, A.subjects) }, onclick: () => cellSheet(C.weekdayOf(date), i, date, later) },
          h('div', { class: 'tt-when' }, h('b', {}, `${C.ordinal(i)} ora`), h('small', {}, `${hr.start}–${hr.end}`)),
          h('div', { class: 'tt-bar' }),
          h('div', { class: 'grow' }, h('div', { class: 't' }, empty ? 'Libera' : cellName(c, A.subjects)),
            differs(i) ? h('div', { class: 's' }, 'Di solito: ' + (C.ttEmpty(base[i]) ? 'libera' : cellName(base[i], A.subjects))) : (!empty && c.n ? h('div', { class: 's' }, c.n) : null)),
          icon('right', 'chev'));
      }),
      lastLesson > 0 ? [h('div', { class: 'section-title' }, 'Uscita anticipata'),
        h('div', { class: 'chips' }, ttHours().slice(0, lastLesson).map((_, i) => h('button', { class: 'chip', onclick: e => busy(e.currentTarget,
          () => saveChange(date, row.map((x, j) => (j > i ? null : x)), note.value), `Uscita dopo la ${C.ordinal(i)} ora`).then(later).catch(() => {}) }, `dopo la ${C.ordinal(i)} ora`)))] : null,
      h('label', { class: 'field', style: { marginTop: '16px' } }, h('span', {}, 'Nota per la classe'), note),
      h('div', { class: 'actions' },
        h('button', { class: 'btn block', onclick: e => busy(e.currentTarget, () => saveChange(date, row, note.value), 'Variazione salvata').then(close).catch(() => {}) }, ch ? 'Salva' : 'Salva variazione'),
        lastLesson >= 0 ? h('button', { class: 'btn block ghost', onclick: e => busy(e.currentTarget, () => saveChange(date, [], note.value || 'Nessuna lezione'), 'Giornata senza lezioni').then(later).catch(() => {}) }, 'Nessuna lezione in questo giorno') : null,
        ch ? h('button', { class: 'btn block danger-ghost', onclick: e => busy(e.currentTarget, () => removeChange(date), 'Orario normale ripristinato').then(close).catch(() => {}) }, 'Ripristina l\'orario normale') : null),
    ];
  });
}

function copyDaySheet(wd) {
  const others = C.WEEKDAYS.filter(([w]) => w !== wd);
  openSheet(`Copia in ${dayLabel(wd).toLowerCase()}`, close => [
    h('p', { class: 'muted', style: { marginBottom: '8px' } }, `Le lezioni di ${dayLabel(wd).toLowerCase()} vengono sostituite con quelle del giorno scelto.`),
    others.map(([w, l]) => {
      const n = ttRow(w).filter(c => !C.ttEmpty(c)).length;
      return h('button', { class: 'list-item', disabled: !n, style: n ? null : { opacity: .45 }, onclick: e => busy(e.currentTarget,
        () => saveTT({ days: { ...(A.tt?.days || {}), [wd]: ttRow(w).map(c => (C.ttEmpty(c) ? null : { ...c })) } }), `Copiato da ${l.toLowerCase()}`).then(close).catch(() => {}) },
        h('div', { class: 'grow' }, h('div', { class: 't' }, l), h('div', { class: 's' }, n ? `${n} ${n === 1 ? 'lezione' : 'lezioni'}` : 'vuoto')), icon('right', 'chev'));
    }),
  ]);
}
