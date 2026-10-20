# Interrogo

Sito per organizzare le interrogazioni programmate di una o più classi.

- **Studenti**: https://4nt0010.github.io/3b/
- **Admin**: https://4nt0010.github.io/3b/admin/

## Struttura

```
index.html            sito studenti
admin/index.html      pannello admin
assets/
  firebase.js         configurazione Firebase
  core.js             regole: conflitti, sorteggio, orario e variazioni, testi della pagina Info
  ui.js               componenti grafici e calendario
  student.js          app studenti
  admin.js            app admin
  style.css           stile
manifest.webmanifest  per installarlo come app sul telefono
firestore.rules       regole di sicurezza (da incollare in Firebase)

Dati: admins/{uid}, members/{uid} = { classId, username }, classes/{cid} e dentro students, subjects,
timetable (week, changes), events, rounds (votes, private), exclusions, recoveries, swaps, unlockRequests.
```

## Messa online (una volta sola)

1. **Regole di sicurezza** – Firebase Console → Firestore Database → scheda *Regole*: cancella tutto, incolla il contenuto di `firestore.rules`, premi *Pubblica*. Senza questo passaggio il sito non funziona.
2. **Dominio autorizzato** – Authentication → Impostazioni → Domini autorizzati → aggiungi `4nt0010.github.io`.
3. **GitHub** – carica nel repository `3b` tutti i file di questa cartella mantenendo le sottocartelle (`index.html` deve stare nella radice del repository).
4. **GitHub Pages** – nel repository: Settings → Pages → *Deploy from a branch* → branch `main`, cartella `/ (root)` → Save. Dopo un paio di minuti il sito è online.

## Aggiornamento alla versione 10 (più classi) — da fare in quest'ordine

1. **Regole**: ricopia `firestore.rules` in Firebase Console → Firestore → Regole → *Pubblica*. Senza le nuove regole non funziona niente.
2. **GitHub**: carica tutti i file (sostituisci i vecchi).
3. **Admin**: apri `/admin/`. Compare "Aggiornamento a più classi": lascia il nome `3B` e premi *Sposta i dati nella classe*. Studenti, giri, voti, orario e calendario vengono copiati nella classe 3B. Account e password degli studenti non cambiano.
4. Finché non hai fatto il punto 3, gli studenti vedono "Account non collegato a nessuna classe".
5. Quando hai controllato che è tutto a posto: **Altro → Classi → Elimina i vecchi dati**.

### Novità della v10
- **Più classi**: Altro → Classi (o il pulsante "Classe …" in alto) per crearne, rinominarne e passare dall'una all'altra. Ogni classe ha studenti, materie, orario e giri suoi. Creando una classe puoi copiare materie e orario da quella aperta. Classi e account si creano solo dal pannello admin; i nomi utente restano unici tra tutte le classi.
- **Guida per l'admin**: si apre da sola al primo accesso, poi da Altro → Guida per l'admin.
- **Variazioni d'orario di una singola giornata**: Calendario → giorno → *Varia* sopra l'orario (oppure Altro → Orario settimanale → Variazioni). Ore modificabili una per una, "uscita anticipata", "nessuna lezione", nota per la classe, ripristino.
- **Sorteggio solo per alcuni**: nell'ipotesi, *Sorteggia solo alcuni studenti* → selezioni chi non ha trovato un accordo; gli altri restano fermi. Opzione per tenere conto dei loro voti.
- **Animazione del sorteggio**: lato admin (proiettabile in classe) e lato studente: chi è stato sorteggiato, aprendo il sito, vede il rullo fermarsi sulla sua data (una volta; poi "Rivedi il sorteggio" in Vota).
- **Richiesta di sblocco**: dal Profilo (o toccando una data bloccata) lo studente chiede di sbloccare una data vicina a un'altra sua interrogazione; l'admin la approva in Richieste.

## Primo avvio (admin)

1. Apri `/3b/admin/` e accedi con l'email dell'account admin creato in Firebase (se è `admin@3b.app` basta scrivere `admin`). Crea la prima classe (o sposta i dati esistenti, vedi sopra). Tutto quello che segue vale per la classe aperta.
2. **Altro → Materie**: crea le materie e scegli un colore per ognuna.
3. **Studenti → +**: incolla l'elenco della classe, un nome per riga (`Nome Cognome`; per nomi o cognomi composti usa la virgola: `Maria Grazia, De Luca`). Il sito crea gli account: nome utente `nome.cognome`, password iniziale uguale al nome utente.
4. **Giri → +**: crea un giro con materia, giorni in cui viene il docente, posti per giorno e chi partecipa (di default tutta la classe). Poi *Apri votazione*.
5. **Altro → Orario settimanale**: *Imposta le ore* (inizio della 1ª ora, durata, quante ore al giorno), poi tocca ogni ora per scegliere la materia. Ore singole modificabili (es. ricreazione), "ora doppia", *Copia da un altro giorno*. Gli studenti vedono l'orario nel Calendario, sotto gli impegni del giorno.
6. **Studenti → scheda**: puoi correggere nome e cognome, impostare un **giorno fisso escluso** (es. ogni lunedì per uno studente atleta) e singole **date escluse**.

## Come funziona un giro

Bozza → Votazione aperta → Votazione chiusa → Ipotesi (sorteggio o sistemazione manuale) → Pubblicato → Archiviato.

- Gli studenti scelgono una **prima scelta** e una **riserva**, modificabili finché la votazione è aperta.
- Una data è bloccata se lo studente ha un'altra interrogazione lo stesso giorno o il giorno di calendario prima/dopo (quindi venerdì e lunedì sono compatibili), oppure se l'admin gli ha escluso quella data o quel giorno della settimana. Le verifiche non bloccano.
- Il **sorteggio**: chi rientra nei posti della prima scelta resta lì (si sorteggia tra chi l'ha votata se in esubero); chi resta fuori passa alla riserva; chi resta ancora fuori e chi non ha votato va in un giorno libero a caso.
- Nulla viene pubblicato finché l'admin non accetta l'ipotesi.
- **Orario e giri**: creando un giro, se la materia è nell'orario compare *Aggiungi i prossimi giorni dall'orario*, che inserisce i giorni di lezione della settimana successiva (ripremendolo aggiunge la settimana dopo).
- **Annulla giornata**: sposta automaticamente gli interrogati (con ipotesi da accettare) oppure apre una rivotazione solo per loro.
- **Scambi**: proposti da uno studente, accettati dal compagno, approvati dall'admin (sezione Richieste).
- **Da recuperare**: dal giro pubblicato o dal calendario, tocca il nome di uno studente.

## Limiti da sapere (piano gratuito, nessun server)

- **Password dimenticata**: se uno studente cambia password e la dimentica, il sito non può reimpostarla. Vai in Firebase Console → Authentication, elimina il suo account, poi in Studenti rimuovilo e ricrealo (riparte con la password iniziale). Le sue date già pubblicate vanno riassegnate.
- **Rimuovere uno studente** dal pannello lo toglie dalla classe; per liberare del tutto il nome utente elimina anche l'account da Authentication.
- **Nessuna notifica push**: gli avvisi compaiono dentro il sito (badge e banner).
- La password iniziale `nome.cognome` è facile da indovinare per chi conosce la regola: consiglia alla classe di cambiarla dal Profilo.
