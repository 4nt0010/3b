// Logica condivisa: date, nomi utente, conflitti, sorteggio, regole.
// Nessuna dipendenza da Firebase: si può testare con Node.

export const DOMAIN = '3b.app';
export const APP_NAME = '3B Interrogazioni';
export const VERSION = 6;

// Palette pastello per le materie (testo scuro leggibile su tutte)
export const PALETTE = [
  '#d8d0fb', '#cfe4ee', '#e6f59a', '#fbd8c2', '#f7cde3',
  '#c6eed9', '#eee2c4', '#c9d5fb', '#f6c4bd', '#e1e1ea',
];

export const STATUS = {
  draft: 'Bozza',
  voting: 'Votazione aperta',
  closed: 'Votazione chiusa',
  published: 'Pubblicato',
  archived: 'Archiviato',
};

/* ---------- Date ---------- */
const GG = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const GG3 = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MM = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio',
  'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

export const pad = n => String(n).padStart(2, '0');
export const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function fromISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = fromISO(s); d.setDate(d.getDate() + n); return toISO(d); }
export function addMonths(s, n) { const d = fromISO(s); d.setDate(1); d.setMonth(d.getMonth() + n); return toISO(d); }
export function dayDiff(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 864e5);
}
export const todayISO = () => toISO(new Date());
// Dal giorno stesso dell'interrogazione in poi è considerata fatta (va in archivio, niente più scambi)
export const isDone = ev => !!ev && !ev.cancelled && ev.date <= todayISO();
export const swappable = ev => !!ev && ev.type === 'interrogazione' && !ev.cancelled && ev.date > todayISO();
export const isWeekend = s => { const w = fromISO(s).getDay(); return w === 0 || w === 6; };
export function mondayOf(s) { const d = fromISO(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); }
export function nextWeekday(s) { let d = s; while (isWeekend(d)) d = addDays(d, 1); return d; }
export const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const wd3 = s => GG3[fromISO(s).getDay()];
export const wdLong = s => GG[fromISO(s).getDay()];
export const WEEKDAYS = [['1', 'Lunedì'], ['2', 'Martedì'], ['3', 'Mercoledì'], ['4', 'Giovedì'], ['5', 'Venerdì']];
export const dnum = s => fromISO(s).getDate();
export const mon3 = s => MM[fromISO(s).getMonth()].slice(0, 3);
export const fmtShort = s => `${wd3(s)} ${dnum(s)} ${mon3(s)}`;
export const fmtLong = s => `${wdLong(s)} ${dnum(s)} ${MM[fromISO(s).getMonth()]}`;
export const fmtDM = s => `${pad(dnum(s))}/${pad(fromISO(s).getMonth() + 1)}`;
export const monthTitle = s => `${cap(MM[fromISO(s).getMonth()])} ${fromISO(s).getFullYear()}`;
export function weekdaysOfMonth(s) {
  const d = fromISO(s); const y = d.getFullYear(), m = d.getMonth();
  const out = []; const x = new Date(y, m, 1);
  while (x.getMonth() === m) { const iso = toISO(x); if (!isWeekend(iso)) out.push(iso); x.setDate(x.getDate() + 1); }
  return out;
}

/* ---------- Nomi utente ---------- */
export function slug(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '');
}
export const baseUsername = (first, last) => `${slug(first)}.${slug(last)}`;
export function uniqueUsername(base, taken) { if (!taken.has(base)) return base; let i = 2; while (taken.has(base + i)) i++; return base + i; }
export const emailOf = u => { u = u.trim().toLowerCase(); return u.includes('@') ? u : `${u}@${DOMAIN}`; };
export const initialPassword = u => (u.length >= 6 ? u : `${u}.3b`);
const titleCase = s => s.trim().split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
// "Mario Rossi" -> nome Mario, cognome Rossi. Con la virgola: "Maria Grazia, De Luca"
export function parseStudentLine(line) {
  line = line.trim(); if (!line) return null;
  let first, last;
  if (line.includes(',')) [first, last] = line.split(',').map(s => s.trim());
  else { const p = line.split(/\s+/); if (p.length < 2) return null; last = p.pop(); first = p.join(' '); }
  if (!first || !last) return null;
  return { first: titleCase(first), last: titleCase(last) };
}
export const fullName = st => (st ? `${st.first} ${st.last}` : 'Studente rimosso');
export const shortName = st => (st ? `${st.last} ${st.first[0]}.` : '?');
export const initials = st => (st ? (st.first[0] + st.last[0]).toUpperCase() : '?');
export const byLastName = (a, b) => (a.last + a.first).localeCompare(b.last + b.first, 'it');

/* ---------- Conflitti ----------
   Una data è bloccata se lo studente ha un'interrogazione (non annullata)
   lo stesso giorno o nel giorno di calendario prima/dopo, oppure se l'admin
   gli ha escluso quella data. Le verifiche non bloccano. */
// exclusions = { dates: { 'YYYY-MM-DD': nota }, weekdays: { '1': nota } }  (1 = lunedì … 5 = venerdì)
export function blockReasons(uid, date, { events = [], exclusions = {}, ignore = [] } = {}) {
  const out = [];
  const dates = exclusions?.dates || {}, weekly = exclusions?.weekdays || {};
  if (Object.prototype.hasOwnProperty.call(dates, date)) out.push({ kind: 'excl', date, note: dates[date] || '' });
  const wd = String(fromISO(date).getDay());
  if (Object.prototype.hasOwnProperty.call(weekly, wd)) out.push({ kind: 'weekly', date, wd, note: weekly[wd] || '' });
  for (const ev of events) {
    if (ev.type !== 'interrogazione' || ev.cancelled) continue;
    if (ignore.includes(ev.id)) continue;
    if (!(ev.studentIds || []).includes(uid)) continue;
    const diff = dayDiff(date, ev.date);
    if (Math.abs(diff) <= 1) out.push({ kind: 'event', date: ev.date, subjectId: ev.subjectId, same: diff === 0, eventId: ev.id });
  }
  return out;
}
export function reasonText(r, subjects = {}, you = true) {
  if (r.kind === 'excl') return 'Giorno escluso' + (r.note ? ` · ${r.note}` : '');
  if (r.kind === 'weekly') return `Escluso ogni ${GG[Number(r.wd)]}` + (r.note ? ` · ${r.note}` : '');
  const s = subjects[r.subjectId]?.name || 'un\'altra materia';
  if (r.same) return you ? `Hai già ${s} questo giorno` : `Ha già ${s} questo giorno`;
  return `${cap(fmtShort(r.date))}: interrogazione di ${s}`;
}

/* ---------- Sorteggio ---------- */
export function shuffle(arr, random = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function seeded(seed) { // mulberry32
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}

/* buildSchedule:
   1) chi rientra nella capienza della prima scelta resta lì (sorteggio tra chi l'ha votata se in esubero)
   2) chi resta fuori passa alla riserva, se c'è posto (stesso criterio)
   3) chi resta ancora fuori e chi non ha votato va in un giorno libero a caso,
      partendo da chi ha meno date possibili; sempre rispettando i giorni bloccati. */
export function buildSchedule({ studentIds, dates, capacity, votes = {}, isBlocked, prefill = {}, random = Math.random }) {
  const free = {}; const assign = {}; const how = {};
  dates.forEach(d => { free[d] = Math.max(0, (capacity[d] ?? 0) - (prefill[d] || 0)); assign[d] = []; });
  const ok = (u, d) => !!d && dates.includes(d) && !isBlocked(u, d);

  const fillRound = (groups, onOverflow, label) => {
    for (const d of dates) {
      const c = shuffle(groups[d] || [], random);
      const take = c.slice(0, free[d]);
      take.forEach(u => { assign[d].push(u); how[u] = label; });
      free[d] -= take.length;
      c.slice(take.length).forEach(onOverflow);
    }
  };

  const byFirst = {}; const after1 = [];
  for (const u of studentIds) { const v = votes[u]; if (v && ok(u, v.first)) (byFirst[v.first] ??= []).push(u); else after1.push(u); }
  fillRound(byFirst, u => after1.push(u), 'first');

  const byRes = {}; const after2 = [];
  for (const u of after1) { const v = votes[u]; if (v && v.reserve && v.reserve !== v.first && ok(u, v.reserve)) (byRes[v.reserve] ??= []).push(u); else after2.push(u); }
  fillRound(byRes, u => after2.push(u), 'reserve');

  const opts = u => dates.filter(d => free[d] > 0 && ok(u, d));
  let left = shuffle(after2, random); const unassigned = [];
  while (left.length) {
    left.sort((a, b) => opts(a).length - opts(b).length);
    const u = left.shift(); const o = opts(u);
    if (!o.length) { unassigned.push(u); continue; }
    const d = o[Math.floor(random() * o.length)];
    assign[d].push(u); free[d]--; how[u] = votes[u]?.first ? 'random' : 'novote';
  }
  return { assign, how, unassigned };
}

/* Proposta "dai voti" per la sistemazione manuale: tutti sulla prima scelta
   valida (anche oltre la capienza), altrimenti riserva, altrimenti non assegnati. */
export function proposalFromVotes({ studentIds, dates, votes = {}, isBlocked }) {
  const assign = {}; const how = {}; const unassigned = [];
  dates.forEach(d => (assign[d] = []));
  const ok = (u, d) => !!d && dates.includes(d) && !isBlocked(u, d);
  for (const u of studentIds) {
    const v = votes[u];
    if (v && ok(u, v.first)) { assign[v.first].push(u); how[u] = 'first'; }
    else if (v && ok(u, v.reserve)) { assign[v.reserve].push(u); how[u] = 'reserve'; }
    else unassigned.push(u);
  }
  return { assign, how, unassigned };
}

export const HOW_LABEL = { first: '1ª scelta', reserve: 'Riserva', random: 'Sorteggiato', novote: 'Non ha votato', manual: 'Spostato a mano' };

/* ---------- Regole (pagina Info) ---------- */
export const RULES = [
  { t: 'Come funziona un giro', b: `<p>Per ogni materia l'admin crea un <b>giro di interrogazioni</b> con i giorni in cui viene il docente.</p><ol><li>L'admin apre la votazione.</li><li>Ognuno sceglie la data che preferisce.</li><li>L'admin chiude la votazione e pubblica le date definitive.</li></ol><p>Le date pubblicate compaiono nel calendario di tutti.</p>` },
  { t: 'Come si vota', b: `<p>Puoi indicare una <b>prima scelta</b> e una <b>riserva</b>. La riserva non è obbligatoria, ma ti conviene metterla: se la prima scelta è piena, passi lì invece che in un giorno a caso.</p><p>Non c'è una scadenza: puoi cambiare le tue scelte finché l'admin non chiude la votazione.</p>` },
  { t: 'Date bloccate', b: `<p>Non puoi scegliere un giorno in cui hai già un'interrogazione, né il giorno prima o il giorno dopo.</p><p>Il weekend fa da pausa: se sei interrogato il <b>venerdì</b> puoi esserlo anche il <b>lunedì</b>.</p><p>Le verifiche in classe <b>non</b> bloccano nessuna data. Sotto ogni data bloccata trovi scritto il motivo.</p><p>L'admin può escludere per te singole date (assenze, motivi personali) oppure un giorno fisso della settimana (per esempio ogni lunedì per gli studenti atleti): le vedi bloccate solo tu.</p>` },
  { t: 'Posti limitati e sorteggio', b: `<p>Ogni giorno ha un numero massimo di posti, che non viene mostrato. Durante la votazione non si vede nemmeno quanti hanno scelto una data.</p><p>Se troppi scelgono la stessa data, si sorteggia tra chi l'ha votata. Chi resta fuori passa alla sua riserva; se anche quella è piena, viene messo in un giorno libero, sempre rispettando le sue date bloccate.</p><p>In alternativa l'admin può sistemare le date a mano mettendo d'accordo la classe.</p>` },
  { t: 'Chi non vota', b: `<p>Chi non vota viene assegnato d'ufficio a un giorno rimasto libero.</p>` },
  { t: 'Cosa vedono gli altri', b: `<p>Tutti vedono le date pubblicate di tutti nel calendario.</p><p>Le scelte di voto restano private finché l'admin non decide di renderle visibili. Le verifiche le vede solo chi le deve fare.</p>` },
  { t: 'Giornata annullata', b: `<p>Se il docente salta un giorno (sciopero, gita, assenza), l'admin annulla la giornata. Gli interrogati di quel giorno vengono spostati in un altro giorno libero oppure rivotano tra le date rimaste.</p>` },
  { t: 'Scambi', b: `<p>Puoi proporre a un compagno di scambiarvi la data, nella stessa materia. Lo scambio avviene solo se lui accetta <b>e</b> l'admin approva, e solo prima del giorno dell'interrogazione.</p>` },
  { t: 'Interrogazioni fatte', b: `<p>Dal giorno dell'interrogazione in poi, l'interrogazione risulta <b>fatta</b>: nel calendario compare come "Fatta" e finisce nell'archivio del tuo Profilo.</p><p>Da quel giorno non si può più scambiare.</p>` },
  { t: 'Da recuperare', b: `<p>Solo in casi gravi (per esempio un'assenza il giorno dell'interrogazione) l'admin può segnarti come "da recuperare" e assegnarti una nuova data.</p>` },
  { t: 'Il tuo account', b: `<p>L'account è personale: non prestarlo e non entrare in quello di altri. Puoi cambiare la password dal Profilo.</p><p>Se dimentichi una password cambiata, l'admin dovrà ricreare l'account.</p>` },
];
