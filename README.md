# MYTHOS·OS

> Grande Atlante Interattivo della Mitologia Greca, presentato come un sistema operativo retro anni '90.

[![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Deploy on Render](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white)](https://render.com/)

**Demo online:** [https://mithos-os.onrender.com](https://mithos-os.onrender.com)

**Lingua:** italiano  
**Frontend:** React, Vite, TypeScript e Tailwind CSS  
**Backend:** server Node.js  
**Provider consigliato:** Groq  
**Fallback:** Cloudflare Workers AI, altri provider configurati e Kernel Sapienziale

---

## Indice

- [Il progetto](#il-progetto)
- [Funzionalità](#funzionalità)
- [Come si usa](#come-si-usa)
- [Comandi dell'Oracolo](#comandi-delloracolo)
- [Bacheca Investigativa](#bacheca-investigativa)
- [Architettura](#architettura)
- [Installazione locale](#installazione-locale)
- [Build di produzione](#build-di-produzione)
- [Variabili d'ambiente](#variabili-dambiente)
- [Configurare Groq](#configurare-groq)
- [Configurare Cloudflare Workers AI](#configurare-cloudflare-workers-ai)
- [Provider e fallback](#provider-e-fallback)
- [Gestione dei limiti Groq](#gestione-dei-limiti-groq)
- [Deploy su Render](#deploy-su-render)
- [Persistenza](#persistenza)
- [API del server](#api-del-server)
- [Struttura del repository](#struttura-del-repository)
- [Entità e relazioni](#entità-e-relazioni)
- [Kernel Sapienziale](#kernel-sapienziale)
- [Sicurezza](#sicurezza)
- [Roadmap](#roadmap)
- [Licenza](#licenza)

## Il progetto

MYTHOS·OS è un atlante narrativo per esplorare la mitologia greca attraverso un'interfaccia ispirata ai sistemi operativi degli anni '90.

L'utente avvia una spedizione dal Caos, legge pergamene generate dall'Oracolo, seleziona personaggi e luoghi, approfondisce relazioni, origini ed etimologie e costruisce progressivamente una Bacheca Investigativa collegata da fili narrativi.

L'applicazione può funzionare in due modalità:

- **Oracolo online:** usa uno dei provider LLM configurati sul server.
- **Kernel Sapienziale:** generatore procedurale locale che garantisce una risposta anche quando nessun provider è disponibile.

Le chiavi API predefinite possono essere conservate esclusivamente sul server Render. In questo modo gli utenti pubblici non devono conoscere o inserire API key, token o nomi di modelli.

## Funzionalità

- Boot screen retro, finestre in stile desktop anni '90 e audio Web Audio.
- Overture mitologica rigenerabile automaticamente o dal menu File.
- Pergamene con entità interattive evidenziate tramite marcatori `[[Nome]]`.
- Riconoscimento di riserva per rendere cliccabili le entità anche quando il modello omette i marcatori.
- Tassonomia canonica per divinità, Titani, primordiali, eroi, creature, luoghi, oggetti e mortali.
- Pannello dei comandi dell'Oracolo.
- Bacheca Investigativa con cartellini trascinabili e fili di relazione.
- Zoom, pan, adattamento della vista e tela estensibile.
- Auto-disposizione per famiglie, cicli mitologici e relazioni.
- Atlante alfabetico delle entità scoperte.
- Cronologia delle pergamene e ripresa della spedizione.
- Persistenza dello stato per sessione.
- Provider LLM multipli con fallback automatico.
- Selezione dinamica dei modelli Groq e OpenRouter.
- Retry dei limiti Groq temporanei quando il provider comunica il tempo di attesa.
- Recupero tollerante delle risposte JSON troncate.
- Cloudflare Workers AI come fallback server-side.
- Kernel Sapienziale offline basato su un grafo mitologico interno.

## Come si usa

1. Apri la demo oppure avvia il progetto in locale.
2. Inizia una nuova spedizione o riprendi quella salvata.
3. Leggi l'Overture e clicca i nomi evidenziati nella pergamena.
4. Seleziona una o due entità.
5. Usa il pannello dei comandi per interrogare l'Oracolo.
6. Gira la lavagna per osservare la mappa delle entità e delle relazioni.
7. Trascina i cartellini o usa **Auto-disponi** per raggrupparli per clan.

Se sul server è configurata una chiave predefinita, l'Oracolo è già attivo e l'utente non deve inserire credenziali.

## Comandi dell'Oracolo

| Comando | Selezione | Funzione |
|---|---:|---|
| Racconta chi è | 1 nome | Identità, genealogia, attributi, dominio e culto |
| Etimologia di | 1 nome | Grafia greca, traslitterazione, radice e significato |
| Origine / provenienza | 1 nome | Generazione, costruzione, luogo d'origine e contesto |
| Aneddoto mitologico | 1 nome | Curiosità, episodio laterale o variante regionale |
| Passo mitologico | 1 nome | Racconto esteso di un episodio rappresentativo |
| Relazione | 2 nomi | Legame diretto fra le entità |
| Relazione approfondita | 2 nomi | Cause, varianti e conseguenze del rapporto |
| Nesso causa/effetto | 2 nomi | Catena narrativa che unisce le entità |

## Bacheca Investigativa

Ogni entità scoperta viene appuntata sulla lavagna e collegata alle altre mediante fili.

| Azione | Controllo |
|---|---|
| Spostare la visuale | Trascina lo sfondo |
| Zoom | Rotellina, trackpad oppure pulsanti `+` e `-` |
| Adattare la mappa | Pulsante **Adatta** oppure tasto `0` |
| Tornare al 100% | Clic sulla percentuale oppure tasto `1` |
| Spostare una scheda | Trascina il cartellino |
| Interrogare un'entità | Doppio clic sul cartellino |
| Raggruppare la mappa | Pulsante **Auto-disponi** |

Auto-disponi analizza il grafo delle relazioni, individua i clan mitologici, colloca il nodo più connesso al centro e dispone gli altri membri in anelli. Le entità isolate vengono raccolte in coda come indizi ancora da collegare.

La lavagna usa una tela estensibile: le schede possono essere trascinate oltre l'area iniziale e rimangono raggiungibili tramite pan, zoom e adattamento della vista.

## Architettura

```text
Browser React
     |
     v
Server Node.js su Render
     |
     +-- Groq                   provider principale consigliato
     +-- Cloudflare Workers AI fallback gratuito
     +-- altri provider         opzionali
     +-- Kernel Sapienziale     fallback locale definitivo
```

In produzione il browser non contatta direttamente i provider. Le richieste passano attraverso il server Node, che mantiene segrete le chiavi API ed evita i problemi CORS.

Il repository conserva inoltre un bridge client per le anteprime statiche. Le chiavi con prefisso `VITE_` vengono incorporate nel bundle e non devono essere usate per segreti in un sito pubblico.

## Requisiti

- Node.js 20 o superiore.
- npm.
- Una chiave Groq consigliata per l'Oracolo online.
- Un token Cloudflare e un Account ID facoltativi per Workers AI.

Senza provider configurati l'applicazione rimane utilizzabile tramite il Kernel Sapienziale.

## Installazione locale

```bash
git clone https://github.com/riflettosamente/mithos-os.git
cd mithos-os
npm install
npm run dev
```

Vite mostrerà l'indirizzo locale da aprire nel browser.

## Build di produzione

```bash
npm run build
npm start
```

`npm run build` esegue due operazioni:

1. Compila il client Vite in `dist/index.html`.
2. Compila `server/index.ts` in `dist/server.mjs` tramite esbuild.

`npm start` avvia il server Node contenuto in `dist/server.mjs`.

Il server legge automaticamente la variabile `PORT` fornita dall'ambiente di hosting.

## Variabili d'ambiente

Inserisci i valori nella sezione **Environment** del servizio Render. In locale puoi utilizzare un file `.env` non versionato.

### Provider principali

| Variabile | Obbligatoria | Funzione |
|---|---:|---|
| `GROQ_API_KEY` | Consigliata | Provider principale dell'Oracolo |
| `GROQ_MODEL` | No | Modello Groq esplicito; vuoto = selezione dal catalogo live |
| `CLOUDFLARE_API_TOKEN` | No | Token per Cloudflare Workers AI |
| `CLOUDFLARE_ACCOUNT_ID` | Sì, con Cloudflare | Account usato per comporre l'endpoint Workers AI |
| `CLOUDFLARE_MODEL` | No | Modello Workers AI esplicito |

### Provider opzionali

| Variabile | Provider |
|---|---|
| `OPENROUTER_API_KEY` | OpenRouter |
| `OPENAI_API_KEY` | OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic |
| `PERPLEXITY_API_KEY` | Perplexity |
| `GEMINI_API_KEY` o `GOOGLE_API_KEY` | Google Gemini |
| `ORACLE_LLM_KEY` | Endpoint OpenAI-compatibile personalizzato |
| `ORACLE_LLM_URL` | URL dell'endpoint personalizzato |
| `ORACLE_LLM_MODEL` | Modello dell'endpoint personalizzato |

### Applicazione e persistenza

| Variabile | Funzione |
|---|---|
| `PORT` | Porta HTTP del server; assegnata automaticamente da Render |
| `MYTHOS_DATA_DIR` | Directory del registro JSON di stati e configurazioni |
| `OPENROUTER_APP_URL` | URL pubblico inviato a OpenRouter come referrer |

> [!WARNING]
> Non committare file `.env`, chiavi Groq, token Cloudflare o altre credenziali. Su Render usa esclusivamente le Environment Variables.

> [!CAUTION]
> Le variabili con prefisso `VITE_` vengono incorporate nel JavaScript pubblico. Non usarle per segreti in una build pubblica.

## Configurare Groq

1. Apri [console.groq.com](https://console.groq.com/).
2. Crea una chiave dalla sezione **API Keys**.
3. Su Render aggiungi `GROQ_API_KEY` con il valore che inizia per `gsk_`.
4. Lascia `GROQ_MODEL` vuoto per consentire la scelta automatica dal catalogo live.

Il motore interroga il catalogo Groq, esclude modelli audio e di moderazione, evita modelli non attivi e privilegia quelli adatti alle risposte strutturate dell'Oracolo.

## Configurare Cloudflare Workers AI

1. Apri [dash.cloudflare.com](https://dash.cloudflare.com/).
2. Crea un API Token con permessi per Workers AI.
3. Copia l'Account ID dalla dashboard o dall'URL dell'area account.
4. Su Render aggiungi `CLOUDFLARE_API_TOKEN`.
5. Su Render aggiungi `CLOUDFLARE_ACCOUNT_ID`.

Workers AI viene utilizzato come fallback quando Groq non è disponibile o ha raggiunto una quota. Quote e disponibilità dei modelli dipendono dalle condizioni correnti di Cloudflare.

## Provider e fallback

Il motore costruisce una cascata dai provider configurati nell'ambiente. Nella configurazione consigliata:

```text
Groq
  -> Cloudflare Workers AI
      -> altri provider configurati
          -> Kernel Sapienziale
```

Il Kernel non richiede rete né credenziali e mantiene l'applicazione operativa durante errori, quote esaurite o manutenzioni dei provider.

## Gestione dei limiti Groq

Il motore Groq:

- seleziona i modelli dal catalogo live;
- evita slug ritirati o non adatti alla chat;
- disattiva il reasoning quando possibile per preservare i token di output;
- prova prima la modalità JSON;
- interpreta i messaggi `429` che contengono `Please try again in ...`;
- attende una volta il tempo comunicato da Groq quando l'attesa è breve;
- passa al modello o provider successivo se il limite rimane attivo;
- recupera localmente il JSON parziale quando una risposta viene troncata.

I limiti Groq sono applicati all'organizzazione e al modello, non alla singola API key. Creare più chiavi nello stesso account non moltiplica la quota.

## Deploy su Render

### Blueprint

Il repository include `render.yaml`.

1. Crea un nuovo Blueprint su Render.
2. Collega il repository GitHub.
3. Inserisci i secret richiesti nella sezione Environment.
4. Avvia il deploy.

### Web Service manuale

Configura il servizio con:

```text
Build Command: npm install && npm run build
Start Command: npm start
Health Check Path: /api/health
```

Endpoint di verifica:

```text
https://TUO-SERVIZIO.onrender.com/api/health
```

Risposta attesa:

```json
{
  "ok": true,
  "database": "file",
  "schema": "ready"
}
```

## Persistenza

Ogni browser riceve un identificatore di sessione salvato in `localStorage`. Lo stato della spedizione viene registrato dal server in un file JSON all'interno di `MYTHOS_DATA_DIR`.

Lo stato comprende:

- pagine generate;
- posizione nella cronologia;
- entità della Bacheca;
- coordinate dei cartellini;
- relazioni;
- configurazione LLM della sessione, se usata.

Sul piano gratuito di Render il filesystem può essere effimero. Un redeploy o una sostituzione dell'istanza può eliminare i dati. Per una persistenza stabile è necessario collegare un Persistent Disk o sostituire il registro JSON con un database.

## API del server

| Endpoint | Metodo | Funzione |
|---|---|---|
| `/api/health` | GET | Stato del server |
| `/api/query` | POST | Interroga l'Oracolo |
| `/api/state?sid=...` | GET | Carica una spedizione |
| `/api/state?sid=...` | PUT | Salva una spedizione |
| `/api/state?sid=...` | DELETE | Cancella pergamene, entità e relazioni |
| `/api/llmkey?sid=...` | GET | Legge provider server e sessione |
| `/api/llmkey?sid=...` | POST | Salva una configurazione della sessione |
| `/api/llmkey?sid=...` | DELETE | Rimuove la configurazione della sessione |
| `/api/llmkey/test?sid=...` | POST | Prova diagnostica del provider |

## Struttura del repository

```text
.
|-- public/img/                 immagini pubbliche
|-- server/
|   `-- index.ts                server Node per Render
|-- src/
|   |-- app/                    CSS e route originali conservate
|   |-- bridge/                 API locali per anteprime statiche
|   |-- components/             interfaccia React
|   |-- db/                     schema Drizzle originale conservato
|   |-- lib/
|   |   |-- api.ts              fetch JSON con retry
|   |   |-- clan-layout.ts      disposizione per clan
|   |   |-- kernel.ts           Kernel Sapienziale offline
|   |   |-- llm.ts              provider, parsing, quote e fallback
|   |   |-- sound.ts            audio Web Audio
|   |   `-- types.ts            tipi e tassonomia canonica
|   |-- App.tsx                 ingresso dell'applicazione
|   |-- index.css               foglio CSS principale
|   `-- main.tsx                bootstrap React
|-- render.yaml                 Blueprint Render
|-- vite.config.ts              configurazione Vite
`-- package.json                dipendenze e script
```

## Entità e relazioni

L'Oracolo restituisce testo, entità e relazioni in JSON.

Le entità appartengono a una delle categorie:

- divinità;
- titano;
- primordiale;
- eroe;
- creatura;
- luogo;
- oggetto;
- mortale.

Nel testo i nomi sono racchiusi in marcatori come `[[Zeus]]`. MYTHOS·OS li trasforma in pulsanti e li riconcilia con l'elenco strutturato del provider.

Una tassonomia canonica corregge omissioni e classificazioni evidenti, per esempio `Eros`, `Gaia`, `Rea`, `Oceano` e `Titani`. Le spedizioni precedenti vengono riparate alla ripresa.

## Kernel Sapienziale

Il Kernel è un generatore procedurale basato su:

- un dizionario di entità mitologiche;
- un grafo di relazioni;
- epiteti;
- percorsi genealogici e causali;
- modelli narrativi per ogni comando;
- un lessico etimologico offline.

Non sostituisce un LLM completo, ma garantisce che MYTHOS·OS non rimanga mai muto.

## Screenshot

Gli screenshot possono essere aggiunti in `docs/screenshots/` e collegati al README:

```markdown
![Pergamena interattiva](docs/screenshots/pergamena.png)
![Bacheca Investigativa](docs/screenshots/bacheca.png)
![Pannello dei comandi](docs/screenshots/comandi.png)
```

## Sicurezza

- Conserva le chiavi esclusivamente nelle variabili d'ambiente del server.
- Non inserire segreti in `VITE_*` per una build pubblica.
- Non pubblicare `.env`.
- Ricorda che tutti gli utenti pubblici condividono le quote della chiave server.
- Valuta rate limit per utente e cache prima di aprire il sito a traffico elevato.
- Verifica periodicamente i modelli disponibili e le condizioni dei provider.

## Roadmap

- Cache globale condivisa delle pergamene.
- Deduplicazione delle richieste simultanee identiche.
- Rate limit per sessione e indirizzo IP.
- Persistent Disk o database PostgreSQL.
- Corpus di fonti primarie con ricerca RAG.
- Citazioni e riferimenti a libri e versi.
- Esportazione della spedizione.
- Preferiti e segnalibri mitologici.
- Filtri e percorsi evidenziati nella Bacheca.
- Pannello amministrativo per provider e quote.

## Licenza

Questo repository non dichiara automaticamente una licenza tramite il README. Prima di distribuire il progetto o accettare contributi, aggiungi un file `LICENSE` coerente con le tue intenzioni.

Opzioni comuni:

- **MIT:** utilizzo e modifica permissivi.
- **AGPL-3.0:** le modifiche a un servizio pubblicato devono rimanere disponibili.
- **Tutti i diritti riservati:** nessuna autorizzazione implicita al riutilizzo.

Verifica inoltre le licenze delle immagini, dei font, delle eventuali traduzioni e dei testi mitologici aggiunti al progetto.

## Avvertenza

MYTHOS·OS è un progetto culturale e sperimentale. Le risposte dei modelli generativi possono contenere errori, semplificazioni o varianti non chiaramente indicate. Per attività accademiche consulta sempre edizioni critiche e fonti specialistiche.

---

**MYTHOS·OS** — Ogni nome è una porta.