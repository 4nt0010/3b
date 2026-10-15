import {
  auth, db, onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential,
  EmailAuthProvider, collection, doc, onSnapshot, query, where, getDoc, setDoc, updateDoc, addDoc, serverTimestamp,
} from './firebase.js';
import * as C from './core.js';
import {
  h, icon, toast, errMsg, openSheet, confirmSheet, busy, renderLogin, renderLoader, shell, page, avatar,
  subjColor, subjName, calendar, rulesList, eventCard,
} from './ui.js';

const root = document.getElementById('app');
const S = fresh();
function fresh() {
  return {
    uid: null, me: null, students: {}, subjects: {}, evA: {}, evB: {}, rounds: {}, myVotes: {}, allVotes: {},
    excl: {}, swapsIn: {}, swapsOut: {}, recov: {}, ready: new Set(),
    tab: 'cal', cal: { view: 'week', sel: C.nextWeekday(C.todayISO()), filter: 'all' }, rulesShown: false,
  };
}
let unsubs = [], roundSubs = {};

/* ---------- Auth ---------- */
renderLoader(root);
onAuthStateChanged(auth, async user => {
  stopAll(); Object.assign(S, fresh());
  if (!user) return showLogin();
  S.uid = user.uid;
  try {
    const snap = await getDoc(doc(db, 'students', user.uid));
    if (!snap.exists()) return notStudent();
    S.me = snap.data();
  } catch (e) { console.error(e); toast(errMsg(e), 'error'); return notStudent(); }
  start();
});
function showLogin() {
  renderLogin(root, {
    title: C.APP_NAME, sub: 'Interrogazioni programmate della classe', placeholder: 'nome.cognome',
    onSubmit: (u, p) => signInWithEmailAndPassword(auth, C.emailOf(u), p),
  });
}
function notStudent() {
  root.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login-card' },
    h('div', { class: 'logo' }, '3B'), h('h1', {}, 'Account non studente'),
    h('p', { class: 'sub' }, 'Questo account non è registrato come studente della classe. Se sei l\'admin, usa il pannello admin.'),
    h('div', { class: 'actions', style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '20px' } },
      h('a', { class: 'btn block', href: './admin/' }, 'Vai al pannello admin'),
      h('button', { class: 'btn block line', onclick: () => signOut(auth) }, 'Esci')))));
}

/* ---------- Dati in tempo reale ---------- */
function listen(key, ref, fn) {
  unsubs.push(onSnapshot(ref, s => { fn(s); S.ready.add(key); schedule(); }, e => { console.error(key, e); S.ready.add(key); schedule(); }));
}
const toMap = q => { const m = {}; q.forEach(d => (m[d.id] = { id: d.id, ...d.data() })); return m; };
function start() {
  const uid = S.uid;
  listen('me', doc(db, 'students', uid), s => { if (s.exists()) S.me = s.data(); });
  listen('students', collection(db, 'students'), q => { S.students = {}; q.forEach(d => (S.students[d.id] = d.data())); });
  listen('subjects', collection(db, 'subjects'), q => (S.subjects = toMap(q)));
  listen('evA', query(collection(db, 'events'), where('type', '==', 'interrogazione')), q => (S.evA = toMap(q)));
  listen('evB', query(collection(db, 'events'), where('studentIds', 'array-contains', uid)), q => (S.evB = toMap(q)));
  listen('rounds', query(collection(db, 'rounds'), where('visible', '==', true)), q => { S.rounds = toMap(q); syncRoundSubs(); });
  listen('excl', doc(db, 'exclusions', uid), s => (S.excl = s.exists() ? s.data() : {}));
  listen('swOut', query(collection(db, 'swaps'), where('fromUid', '==', uid)), q => (S.swapsOut = toMap(q)));
  listen('swIn', query(collection(db, 'swaps'), where('toUid', '==', uid)), q => (S.swapsIn = toMap(q)));
  listen('recov', query(collection(db, 'recoveries'), where('uid', '==', uid)), q => (S.recov = toMap(q)));
}
function syncRoundSubs() {
  const want = {};
  for (const r of Object.values(S.rounds)) {
    if (r.status === 'archived') continue;
    want[r.id + ':mine'] = () => onSnapshot(doc(db, 'rounds', r.id, 'votes', S.uid), s => { S.myVotes[r.id] = s.exists() ? s.data() : null; schedule(); }, e => console.error(e));
    if (r.showVotes) want[r.id + ':all'] = () => onSnapshot(collection(db, 'rounds', r.id, 'votes'), q => { S.allVotes[r.id] = toMap(q); schedule(); }, e => console.error(e));
  }
  for (const k of Object.keys(roundSubs)) if (!want[k]) { roundSubs[k](); delete roundSubs[k]; if (k.endsWith(':all')) delete S.allVotes[k.split(':')[0]]; }
  for (const [k, f] of Object.entries(want)) if (!roundSubs[k]) roundSubs[k] = f();
}
function stopAll() { unsubs.forEach(u => u()); unsubs = []; Object.values(roundSubs).forEach(u => u()); roundSubs = {}; }

const events = () => Object.values({ ...S.evA, ...S.evB });
const reasons = (date, ignore = []) => C.blockReasons(S.uid, date, { events: events(), exclusions: S.excl, ignore });
const inRound = r => !Array.isArray(r.participants) || r.participants.includes(S.uid);
const canVote = r => (r.status === 'voting' && inRound(r)) || (r.revote?.active && (r.revote.students || []).includes(S.uid));
const voteDates = r => (r.status === 'voting' ? r.dates : (r.revote?.dates || [])).slice().sort();

/* ---------- Render ---------- */
let raf = 0;
function schedule() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); }); }
const TABS = [
  { id: 'cal', label: 'Calendario', icon: 'cal' }, { id: 'vote', label: 'Vota', icon: 'vote' },
  { id: 'swap', label: 'Scambi', icon: 'swap' }, { id: 'info', label: 'Info', icon: 'info' },
  { id: 'me', label: 'Profilo', icon: 'user' },
];
function render() {
  if (!S.uid) return;
  // non ridisegnare mentre si sta scrivendo in un campo
  const a = document.activeElement;
  if (a && root.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) { a.addEventListener('blur', () => setTimeout(schedule, 400), { once: true }); return; }
  if (S.ready.size < 4) return renderLoader(root);
  const badges = {
    vote: Object.values(S.rounds).filter(r => canVote(r) && !S.myVotes[r.id]?.first).length,
    swap: Object.values(S.swapsIn).filter(s => s.status === 'pending_peer').length,
  };
  const y = window.scrollY;
  const main = shell(root, TABS, S.tab, t => { S.tab = t; window.scrollTo(0, 0); render(); }, badges);
  ({ cal: renderCal, vote: renderVote, swap: renderSwap, info: renderInfo, me: renderMe })[S.tab](main);
  window.scrollTo(0, y);
  if (S.me && !S.me.rulesAccepted && !S.rulesShown) showRulesOnce();
}

/* ---------- Calendario ---------- */
function renderCal(main) {
  const openRecov = Object.values(S.recov).filter(r => r.status === 'open');
  const toVote = Object.values(S.rounds).filter(r => canVote(r) && !S.myVotes[r.id]?.first);
  const banners = [
    ...toVote.map(r => h('button', { class: 'card warn', style: { display: 'block', width: '100%', textAlign: 'left', marginBottom: '10px' }, onclick: () => { S.tab = 'vote'; render(); } },
      h('b', {}, 'Votazione aperta: '), r.title || subjName(S.subjects, r.subjectId), h('div', { class: 'small muted' }, 'Non hai ancora scelto una data. Tocca per votare.'))),
    ...openRecov.map(r => h('div', { class: 'card danger', style: { marginBottom: '10px' } },
      h('b', {}, 'Da recuperare: '), subjName(S.subjects, r.subjectId), h('div', { class: 'small' }, 'L\'admin ti assegnerà una nuova data.'))),
  ];
  const { hero, body } = calendar({
    state: S.cal, events: events(), students: S.students, subjects: S.subjects, me: S.uid,
    onChange: render, onEventClick: eventSheet, extraBody: banners.length ? h('div', {}, banners) : null,
  });
  page(main, hero, body);
}
function eventSheet(ev) {
  const list = (ev.studentIds || []).map(id => S.students[id]).filter(Boolean).sort(C.byLastName);
  openSheet(subjName(S.subjects, ev.subjectId), () => [
    h('div', { class: 'row wrap' },
      h('span', { class: 'pill', style: { background: subjColor(S.subjects, ev.subjectId) } }, ev.type === 'verifica' ? 'Verifica in classe' : 'Interrogazione'),
      ev.cancelled ? h('span', { class: 'pill danger' }, 'Annullata') : null),
    h('p', { style: { marginTop: '12px', fontWeight: '700', fontSize: '17px' } }, C.cap(C.fmtLong(ev.date))),
    ev.note ? h('p', { class: 'muted', style: { marginTop: '6px' } }, ev.note) : null,
    h('div', { class: 'section-title' }, ev.type === 'verifica' ? 'Chi la fa' : 'Interrogati'),
    list.map(st => h('div', { class: 'list-item' }, avatar(st, { me: st === S.students[S.uid] }), h('div', { class: 'grow' }, h('div', { class: 't' }, C.fullName(st))),
      st === S.students[S.uid] ? h('span', { class: 'pill lime' }, 'Tu') : null)),
  ]);
}

/* ---------- Votazioni ---------- */
function renderVote(main) {
  const rounds = Object.values(S.rounds).filter(r => r.status !== 'archived' && r.status !== 'draft' && (inRound(r) || canVote(r)))
    .sort((a, b) => (canVote(b) - canVote(a)) || ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
  page(main, [h('h1', {}, 'Votazioni'), h('p', { class: 'sub' }, 'Scegli una prima data e una riserva per ogni giro aperto.')],
    rounds.length ? rounds.map(roundBlock) : h('div', { class: 'empty' }, h('b', {}, 'Nessun giro in corso'), 'Quando l\'admin apre una votazione la trovi qui.'));
}
function roundBlock(r) {
  const color = subjColor(S.subjects, r.subjectId);
  const title = r.title || `Interrogazioni di ${subjName(S.subjects, r.subjectId)}`;
  const v = S.myVotes[r.id] || {};
  const head = (pill) => h('div', { class: 'round-head' }, h('span', { class: 'sdot', style: { '--c': color } }), h('h2', {}, title), pill);

  if (canVote(r)) {
    const isRevote = r.status !== 'voting';
    const today = C.todayISO();
    const all = S.allVotes[r.id];
    const cards = voteDates(r).map(d => {
      const rs = reasons(d); const past = d < today;
      const state = v.first === d ? 'first' : v.reserve === d ? 'reserve' : '';
      const blocked = rs.length > 0;
      const whoFirst = all ? Object.entries(all).filter(([, x]) => x.first === d).map(([id]) => C.shortName(S.students[id])) : null;
      const whoRes = all ? Object.entries(all).filter(([, x]) => x.reserve === d).map(([id]) => C.shortName(S.students[id])) : null;
      return h('button', { class: `datecard ${state} ${blocked ? 'blocked' : ''} ${past ? 'past' : ''}`, onclick: () => dateSheet(r, d, rs, past) },
        h('div', { class: 'dnum' }, h('small', {}, C.wd3(d)), h('b', {}, C.dnum(d)), h('small', {}, C.mon3(d))),
        h('div', { class: 'info' },
          h('div', { class: 't' }, state === 'first' ? '1ª scelta' : state === 'reserve' ? 'Riserva' : blocked ? 'Non disponibile' : past ? 'Data passata' : 'Disponibile'),
          blocked ? rs.map(x => h('div', { class: 'r' }, C.reasonText(x, S.subjects))) : null,
          blocked && state ? h('div', { class: 'r', style: { color: 'var(--danger)', fontWeight: '700' } }, 'La tua scelta ora è bloccata: cambiala') : null,
          whoFirst && (whoFirst.length || whoRes.length) ? h('div', { class: 'who' },
            whoFirst.length ? `1ª: ${whoFirst.join(', ')}` : '', whoFirst.length && whoRes.length ? ' · ' : '', whoRes.length ? `Riserva: ${whoRes.join(', ')}` : '') : null),
        h('div', { class: 'radio' }, blocked ? icon('lock') : state ? icon('check') : null));
    });
    return h('section', { class: 'round' },
      head(h('span', { class: 'pill lime' }, isRevote ? 'Rivotazione' : 'Aperta')),
      h('p', { class: 'muted small' }, isRevote ? 'La tua giornata è stata annullata: scegli una nuova data tra quelle rimaste.' : 'Tocca una data per sceglierla. Puoi cambiare idea finché la votazione è aperta.'),
      cards,
      h('div', { class: 'summary' },
        h('div', {}, h('span', {}, '1ª  '), h('b', {}, v.first ? C.fmtShort(v.first) : '—')),
        h('div', {}, h('span', {}, 'Riserva  '), h('b', {}, v.reserve ? C.fmtShort(v.reserve) : '—'))));
  }

  if (r.status === 'closed') {
    return h('section', { class: 'round' }, head(h('span', { class: 'pill grey' }, 'Chiusa')),
      h('div', { class: 'card' }, h('h3', {}, 'In attesa della pubblicazione'),
        h('p', { class: 'muted small', style: { marginTop: '4px' } }, 'L\'admin sta sistemando le date. Le tue scelte:'),
        h('div', { class: 'row wrap', style: { marginTop: '10px' } },
          h('span', { class: 'pill violet' }, '1ª: ' + (v.first ? C.fmtShort(v.first) : 'nessuna')),
          h('span', { class: 'pill', style: { background: '#e7e3fd' } }, 'Riserva: ' + (v.reserve ? C.fmtShort(v.reserve) : 'nessuna')))));
  }

  // pubblicato
  const mine = events().filter(e => e.roundId === r.id && (e.studentIds || []).includes(S.uid));
  const active = mine.find(e => !e.cancelled);
  const rec = Object.values(S.recov).find(x => x.roundId === r.id && x.status === 'open');
  let content;
  if (active) content = h('div', { class: 'card', style: { background: color } }, h('div', { class: 'small', style: { fontWeight: '700', opacity: .65 } }, 'La tua data'),
    h('h3', { style: { fontSize: '22px', marginTop: '2px' } }, C.cap(C.fmtLong(active.date))));
  else if (rec) content = h('div', { class: 'card danger' }, h('h3', {}, 'Da recuperare'), h('p', { class: 'small' }, 'L\'admin ti assegnerà una nuova data.'));
  else if (mine.length) content = h('div', { class: 'card warn' }, h('h3', {}, 'Giornata annullata'), h('p', { class: 'small' }, 'Sei in attesa di una nuova data.'));
  else content = h('div', { class: 'card' }, h('p', { class: 'muted small' }, 'Non hai una data in questo giro.'));
  return h('section', { class: 'round' }, head(h('span', { class: 'pill ok' }, 'Pubblicato')), content);
}
function dateSheet(r, d, rs, past) {
  const v = S.myVotes[r.id] || {};
  const save = async (first, reserve, btn, close) => {
    await busy(btn, () => setDoc(doc(db, 'rounds', r.id, 'votes', S.uid), { first: first || null, reserve: reserve || null, updatedAt: serverTimestamp() }), 'Scelta salvata');
    close();
  };
  openSheet(C.cap(C.fmtLong(d)), close => {
    if (rs.length) return [
      h('div', { class: 'card' }, h('div', { class: 'row' }, icon('lock'), h('b', {}, 'Data non disponibile per te')),
        rs.map(x => h('p', { class: 'small', style: { marginTop: '8px' } }, C.reasonText(x, S.subjects)))),
      (v.first === d || v.reserve === d) ? h('div', { class: 'actions' }, h('button', { class: 'btn block danger-ghost', onclick: e =>
        save(v.first === d ? null : v.first, v.reserve === d ? null : v.reserve, e.currentTarget, close) }, 'Togli questa scelta')) : null,
    ];
    if (past) return h('p', { class: 'muted' }, 'Questa data è già passata.');
    return [
      h('p', { class: 'muted' }, v.first === d ? 'È la tua prima scelta.' : v.reserve === d ? 'È la tua riserva.' : 'Come vuoi usare questa data?'),
      h('div', { class: 'actions' },
        v.first !== d ? h('button', { class: 'btn block violet', onclick: e => save(d, v.reserve === d ? v.first : v.reserve, e.currentTarget, close) }, 'Imposta come 1ª scelta') : null,
        v.reserve !== d ? h('button', { class: 'btn block', onclick: e => save(v.first === d ? v.reserve : v.first, d, e.currentTarget, close) }, 'Imposta come riserva') : null,
        (v.first === d || v.reserve === d) ? h('button', { class: 'btn block danger-ghost', onclick: e =>
          save(v.first === d ? null : v.first, v.reserve === d ? null : v.reserve, e.currentTarget, close) }, 'Togli questa scelta') : null),
    ];
  });
}

/* ---------- Scambi ---------- */
const swapStatus = { pending_peer: ['In attesa del compagno', 'grey'], pending_admin: ['In attesa dell\'admin', 'violet'], approved: ['Approvato', 'ok'], rejected: ['Rifiutato dall\'admin', 'danger'], declined: ['Rifiutato', 'danger'], cancelled: ['Annullato', 'grey'] };
function renderSwap(main) {
  const today = C.todayISO();
  const incoming = Object.values(S.swapsIn).filter(s => s.status === 'pending_peer');
  const myEv = events().filter(e => e.type === 'interrogazione' && !e.cancelled && e.date >= today && (e.studentIds || []).includes(S.uid)).sort((a, b) => a.date.localeCompare(b.date));
  const history = [...Object.values(S.swapsOut), ...Object.values(S.swapsIn).filter(s => s.status !== 'pending_peer')]
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 12);
  page(main, [h('h1', {}, 'Scambi'), h('p', { class: 'sub' }, 'Scambia la tua data con un compagno, nella stessa materia.')], [
    incoming.length ? [h('div', { class: 'section-title' }, 'Richieste per te'), incoming.map(incomingCard)] : null,
    h('div', { class: 'section-title' }, 'Le tue interrogazioni'),
    myEv.length ? myEv.map(e => h('div', { class: 'card', style: { background: subjColor(S.subjects, e.subjectId) } },
      h('div', { class: 'row' }, h('div', { class: 'grow' }, h('h3', {}, subjName(S.subjects, e.subjectId)), h('div', { class: 'small', style: { opacity: .7, fontWeight: '600' } }, C.cap(C.fmtLong(e.date)))),
        h('button', { class: 'btn sm', onclick: () => proposeSheet(e) }, 'Proponi scambio'))))
      : h('div', { class: 'empty' }, h('b', {}, 'Nessuna interrogazione in programma'), 'Gli scambi si fanno sulle date già pubblicate.'),
    history.length ? [h('div', { class: 'section-title' }, 'Storico'), history.map(historyCard)] : null,
  ]);
}
function incomingCard(s) {
  const other = S.students[s.fromUid];
  const rs = reasons(s.fromDate, [s.toEventId]);
  return h('div', { class: 'card white' },
    h('div', { class: 'row' }, avatar(other), h('div', { class: 'grow' }, h('b', {}, C.fullName(other)), h('div', { class: 'small muted' }, subjName(S.subjects, s.subjectId)))),
    h('p', { style: { marginTop: '10px' } }, 'Tu passeresti da ', h('b', {}, C.fmtShort(s.toDate)), ' a ', h('b', {}, C.fmtShort(s.fromDate)), '.'),
    rs.length ? h('div', { class: 'card danger', style: { marginTop: '10px' } }, h('b', { class: 'small' }, 'Attenzione: '), rs.map(x => h('div', { class: 'small' }, C.reasonText(x, S.subjects)))) : null,
    h('div', { class: 'row', style: { marginTop: '12px' } },
      h('button', { class: 'btn sm lime grow', onclick: e => busy(e.currentTarget, () => updateDoc(doc(db, 'swaps', s.id), { status: 'pending_admin', updatedAt: serverTimestamp() }), 'Accettato: ora decide l\'admin') }, 'Accetta'),
      h('button', { class: 'btn sm ghost grow', onclick: e => busy(e.currentTarget, () => updateDoc(doc(db, 'swaps', s.id), { status: 'declined', updatedAt: serverTimestamp() }), 'Richiesta rifiutata') }, 'Rifiuta')));
}
function historyCard(s) {
  const out = s.fromUid === S.uid; const other = S.students[out ? s.toUid : s.fromUid];
  const [label, cls] = swapStatus[s.status] || [s.status, 'grey'];
  return h('div', { class: 'card' },
    h('div', { class: 'row' }, h('div', { class: 'grow' }, h('b', {}, (out ? 'Con ' : 'Da ') + C.fullName(other)),
      h('div', { class: 'small muted' }, `${subjName(S.subjects, s.subjectId)} · ${C.fmtShort(out ? s.fromDate : s.toDate)} ⇄ ${C.fmtShort(out ? s.toDate : s.fromDate)}`)),
      h('span', { class: 'pill ' + cls }, label)),
    out && (s.status === 'pending_peer' || s.status === 'pending_admin') ? h('button', { class: 'btn sm line', style: { marginTop: '10px' },
      onclick: e => busy(e.currentTarget, () => updateDoc(doc(db, 'swaps', s.id), { status: 'cancelled', updatedAt: serverTimestamp() }), 'Richiesta annullata') }, 'Annulla richiesta') : null);
}
function proposeSheet(myEvent) {
  const today = C.todayISO();
  const pending = new Set(Object.values(S.swapsOut).filter(s => ['pending_peer', 'pending_admin'].includes(s.status)).map(s => s.toUid + s.toEventId));
  const cands = events().filter(e => e.type === 'interrogazione' && !e.cancelled && e.subjectId === myEvent.subjectId && e.id !== myEvent.id
    && e.date !== myEvent.date && e.date >= today && !(e.studentIds || []).includes(S.uid)).sort((a, b) => a.date.localeCompare(b.date));
  openSheet('Proponi uno scambio', close => [
    h('p', { class: 'muted' }, 'La tua data: ', h('b', {}, C.fmtLong(myEvent.date)), '. Scegli il compagno con cui scambiare.'),
    cands.length ? cands.map(e => [
      h('div', { class: 'section-title' }, C.cap(C.fmtLong(e.date))),
      (e.studentIds || []).filter(id => S.students[id]).map(id => {
        const mine = reasons(e.date, [myEvent.id]);
        const theirs = C.blockReasons(id, myEvent.date, { events: events(), ignore: [e.id] });
        const sent = pending.has(id + e.id);
        return h('div', { class: 'list-item' }, avatar(S.students[id]),
          h('div', { class: 'grow' }, h('div', { class: 't' }, C.fullName(S.students[id])),
            mine.length ? h('div', { class: 's', style: { color: 'var(--danger)' } }, 'Per te: ' + mine.map(x => C.reasonText(x, S.subjects)).join('; ')) : null,
            theirs.length ? h('div', { class: 's', style: { color: 'var(--danger)' } }, 'Per lui/lei: ' + theirs.map(x => C.reasonText(x, S.subjects, false)).join('; ')) : null),
          sent ? h('span', { class: 'pill grey' }, 'Inviata') : h('button', { class: 'btn sm', disabled: mine.length > 0, onclick: ev => busy(ev.currentTarget, () => addDoc(collection(db, 'swaps'), {
            fromUid: S.uid, toUid: id, fromEventId: myEvent.id, toEventId: e.id, fromDate: myEvent.date, toDate: e.date,
            subjectId: myEvent.subjectId, status: 'pending_peer', createdAt: serverTimestamp(),
          }), 'Richiesta inviata').then(close) }, 'Proponi'));
      }),
    ]) : h('div', { class: 'empty' }, h('b', {}, 'Nessuna data disponibile'), 'Non ci sono altre date pubblicate per questa materia.'),
  ]);
}

/* ---------- Info ---------- */
function renderInfo(main) {
  page(main, [h('h1', {}, 'Regole'), h('p', { class: 'sub' }, 'Come funzionano il sito e la votazione.')], rulesList(true));
}
function showRulesOnce() {
  S.rulesShown = true;
  openSheet('Benvenuto su 3B Interrogazioni', close => [
    h('p', { class: 'muted', style: { marginBottom: '14px' } }, 'Prima di iniziare, leggi come funziona. Le regole restano sempre nella sezione Info.'),
    rulesList(true),
    h('div', { class: 'actions' }, h('button', { class: 'btn block lime', onclick: e => busy(e.currentTarget, () => updateDoc(doc(db, 'students', S.uid), { rulesAccepted: true })).then(close) }, 'Ho letto le regole')),
  ]);
}

/* ---------- Profilo ---------- */
function renderMe(main) {
  const me = S.me || S.students[S.uid];
  const recs = Object.values(S.recov).filter(r => r.status === 'open');
  const cur = h('input', { type: 'password', autocomplete: 'current-password' });
  const nw = h('input', { type: 'password', autocomplete: 'new-password' });
  const nw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  page(main, [
    h('div', { class: 'row' }, h('span', { class: 'av lg' }, C.initials(me)), h('div', {}, h('h1', {}, C.fullName(me)), h('p', { class: 'sub' }, me?.username))),
  ], [
    recs.length ? [h('div', { class: 'section-title' }, 'Da recuperare'), recs.map(r => h('div', { class: 'card danger' }, h('b', {}, subjName(S.subjects, r.subjectId)),
      h('div', { class: 'small' }, `Data originale: ${C.fmtShort(r.fromDate)} · in attesa di una nuova data`)))] : null,
    h('div', { class: 'section-title' }, 'Cambia password'),
    h('form', { class: 'card', onsubmit: async e => {
      e.preventDefault(); const btn = e.currentTarget.querySelector('button');
      if (nw.value.length < 6) return toast('La nuova password deve avere almeno 6 caratteri', 'error');
      if (nw.value !== nw2.value) return toast('Le due password non coincidono', 'error');
      await busy(btn, async () => {
        const u = auth.currentUser;
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, cur.value));
        await updatePassword(u, nw.value);
      }, 'Password cambiata').then(() => { cur.value = nw.value = nw2.value = ''; }).catch(() => {});
    } },
    h('label', { class: 'field' }, h('span', {}, 'Password attuale'), cur),
    h('label', { class: 'field' }, h('span', {}, 'Nuova password'), nw),
    h('label', { class: 'field' }, h('span', {}, 'Ripeti nuova password'), nw2),
    h('p', { class: 'small muted', style: { marginBottom: '12px' } }, 'Ricordala bene: se la dimentichi, l\'admin dovrà ricreare il tuo account.'),
    h('button', { class: 'btn block', type: 'submit' }, 'Salva password')),
    h('div', { class: 'spacer' }),
    h('button', { class: 'btn block line', onclick: async () => { if (await confirmSheet('Vuoi uscire?', 'Dovrai inserire di nuovo nome utente e password.', 'Esci')) signOut(auth); } }, icon('logout'), 'Esci'),
  ]);
}
