import type { EntityKind, EntityRef, OracleResult, QueryActionKey, RelationEdge } from "./types";

/* ------------------------------------------------------------------ */
/*  KERNEL SAPIENZIALE — generatore procedurale di emergenza.           */
/*  Non è un dataset di testi: ogni risposta viene composta al volo     */
/*  attraversando un grafo di relazioni mitologiche e assemblando       */
/*  frasi epiche in italiano. Usato solo se nessun LLM è configurato.   */
/* ------------------------------------------------------------------ */

const ENT: Record<string, EntityKind> = {
  // primordiali
  Caos: "primordiale", Gea: "primordiale", Urano: "primordiale", Erebo: "primordiale", Notte: "primordiale",
  // titani
  Crono: "titano", Rea: "titano", Oceano: "titano", Teti: "titano", Iperione: "titano",
  Giapeto: "titano", Mnemosine: "titano", Temi: "titano", Leto: "titano", Prometeo: "titano",
  Epimeteo: "titano", Atlante: "titano", Meti: "titano", Eos: "titano", Selene: "titano",
  // divinità
  Zeus: "divinità", Era: "divinità", Poseidone: "divinità", Ade: "divinità", Demetra: "divinità",
  Estia: "divinità", Atena: "divinità", Apollo: "divinità", Artemide: "divinità", Ares: "divinità",
  Afrodite: "divinità", Efesto: "divinità", Ermes: "divinità", Dioniso: "divinità", Persefone: "divinità",
  Ecate: "divinità", Pan: "divinità", Iride: "divinità", Nike: "divinità", Eris: "divinità", Eros: "divinità",
  // creature
  Tifone: "creatura", Echidna: "creatura", Cerbero: "creatura", "Idra di Lerna": "creatura",
  Chimera: "creatura", Sfinge: "creatura", "Leone di Nemea": "creatura", Medusa: "creatura",
  Minotauro: "creatura", Pegaso: "creatura", Ciclopi: "creatura", Polifemo: "creatura",
  Argo: "creatura", Arpie: "creatura", Sirene: "creatura", Scilla: "creatura", Cariddi: "creatura", Chirone: "creatura",
  // eroi
  Eracle: "eroe", Perseo: "eroe", Teseo: "eroe", Giasone: "eroe", Achille: "eroe", Odisseo: "eroe",
  Ettore: "eroe", Paride: "eroe", Agamennone: "eroe", Menelao: "eroe", Aiace: "eroe",
  Bellerofonte: "eroe", Orfeo: "eroe", Atalanta: "eroe", Cadmo: "eroe", Edipo: "eroe", Oreste: "eroe",
  // mortali
  Elena: "mortale", Cassandra: "mortale", Clitennestra: "mortale", Penelope: "mortale", Medea: "mortale",
  Andromeda: "mortale", Arianna: "mortale", Icaro: "mortale", Dedalo: "mortale", Tiresia: "mortale",
  Europa: "mortale", Io: "mortale", Danae: "mortale", Leda: "mortale", Aracne: "mortale", Narciso: "mortale",
  Eco: "mortale", Midas: "mortale", Niobe: "mortale", Sisifo: "mortale", Tantalo: "mortale",
  Deucalione: "mortale", Pirra: "mortale", Euridice: "mortale", Euristeo: "mortale", Semele: "mortale", Pandora: "mortale",
  // luoghi
  Olimpo: "luogo", Tartaro: "luogo", Eliseo: "luogo", Stige: "luogo", Lete: "luogo", Delfi: "luogo",
  Delo: "luogo", Creta: "luogo", Troia: "luogo", Micene: "luogo", Tebe: "luogo", Atene: "luogo",
  Itaca: "luogo", Colchide: "luogo", "Labirinto di Cnosso": "luogo",
  // oggetti
  "Fulmine di Zeus": "oggetto", "Tridente di Poseidone": "oggetto", Egida: "oggetto",
  "Elmo di Ade": "oggetto", "Sandali alati": "oggetto", "Falce adamantina": "oggetto",
  "Vaso di Pandora": "oggetto", "Velo d'oro": "oggetto", "Pomo della Discordia": "oggetto",
  "Filo di Arianna": "oggetto", "Cavallo di Troia": "oggetto", "Lira di Orfeo": "oggetto",
};

const EPITHET: Record<string, string> = {
  Zeus: "il Tonante, padre degli dèi e degli uomini", Era: "la regina dell'Olimpo",
  Poseidone: "l'Agitatore della Terra", Ade: "il Sovrano Invisibile",
  Atena: "la dea dagli occhi azzurri", Apollo: "il nume che colpisce da lontano",
  Artemide: "la cacciatrice dalle frecce d'oro", Ares: "il dio sanguinario",
  Afrodite: "la dea nata dalla spuma", Efesto: "il Fabbro celeste",
  Ermes: "il messaggero dai talari alati", Dioniso: "il dio del delirio",
  Demetra: "la madre delle messi", Persefone: "la regina dell'Erebo",
  Crono: "il Titano divoratore", Prometeo: "il Titano previdente",
  Achille: "il piè veloce", Odisseo: "l'eroe dai molti ingegni",
  Eracle: "il più forte tra i mortali", Orfeo: "il cantore tracio",
  Medusa: "la Gorgone dallo sguardo di pietra", Minotauro: "il mostro dal volto di toro",
  Tifone: "l'uragano fatto mostro", Cerbero: "il cane dalle tre teste",
  Cassandra: "la profetessa inascoltata", Elena: "la più bella delle mortali",
  Tiresia: "il veggente cieco", Edipo: "il re maledetto", Narciso: "il giovane che amò se stesso",
  Dedalo: "l'architetto geniale", Icaro: "l'audace caduto dal cielo",
  Atlante: "colui che regge la volta celeste", Medea: "la maga di Colchide",
  Teseo: "l'eroe di Atene", Giasone: "il capitano degli Argonauti",
  Perseo: "l'uccisore della Gorgone", Pandora: "la donna forgiata dagli dèi",
  Olimpo: "la dimora luminosa degli dèi", Tartaro: "l'abisso più profondo del mondo",
  Delfi: "l'ombelico del mondo", Troia: "la rocca di Ilio", Caos: "il vuoto primordiale",
  Gea: "la Madre Terra", Urano: "il cielo stellato", Chirone: "il più giusto dei Centauri",
  Bellerofonte: "il domatore di Pegaso", Pegaso: "il cavallo alato", Sisifo: "il più astuto dei mortali",
  Andromeda: "la fanciulla incatenata alla roccia", Io: "la sacerdotessa trasformata in giovenca",
};

const RAW_EDGES: string[] = [
  // cosmogonia
  "Caos>generò per primo>Gea", "Gea>sgorgò dal>Caos", "Caos>generò per primo>Tartaro", "Caos>generò>Erebo", "Caos>generò>Notte",
  "Gea>generò dalla propria carne>Urano", "Urano>figlio e poi sposo di>Gea", "Gea>unì il proprio destino a>Urano",
  "Gea>madre di>Crono", "Urano>padre di>Crono", "Crono>figlio di>Gea", "Gea>madre di>Rea", "Rea>figlia di>Gea",
  "Urano>padre di>Rea", "Gea>madre di>Oceano", "Gea>madre di>Teti", "Gea>madre di>Iperione", "Gea>madre di>Giapeto",
  "Gea>madre di>Mnemosine", "Gea>madre di>Temi", "Gea>partorì i monocoli>Ciclopi", "Urano>incatenò nel Tartaro>Ciclopi",
  "Notte>sorella di>Erebo", "Notte>generò le Moire e il sonno presso>Erebo",
  "Gea>consegnò la>Falce adamantina", "Falce adamantina>è forgiata nel grembo di>Gea", "Crono>brandì la>Falce adamantina",
  "Crono>evirò con un fendente>Urano", "Urano>è spodestato e ferito da>Crono", "Afrodite>nacque dalla spuma del sangue di>Urano",
  // regno di Crono
  "Crono>sposò la sorella>Rea", "Rea>sposa di>Crono",
  "Crono>padre di>Zeus", "Zeus>figlio di>Crono", "Rea>madre di>Zeus",
  "Crono>padre di>Era", "Era>figlia di>Crono", "Rea>madre di>Era",
  "Crono>padre di>Poseidone", "Poseidone>figlio di>Crono", "Crono>padre di>Ade", "Ade>figlio di>Crono",
  "Crono>padre di>Demetra", "Demetra>figlia di>Crono", "Crono>padre di>Estia", "Estia>figlia di>Crono",
  "Crono>divorò alla nascita>Poseidone", "Crono>divorò alla nascita>Ade", "Crono>divorò alla nascita>Era",
  "Rea>sottrasse alla follia di Crono il piccolo>Zeus", "Zeus>allevato in segreto su>Creta",
  "Zeus>guidò la Titanomachia contro>Crono", "Crono>è rovesciato dopo dieci anni di guerra da>Zeus",
  "Zeus>liberò dalle catene>Ciclopi", "Ciclopi>forgiarono il>Fulmine di Zeus",
  "Fulmine di Zeus>è l'arma forgiata dai>Ciclopi", "Zeus>brandisce il>Fulmine di Zeus",
  "Ciclopi>forgiarono il>Tridente di Poseidone", "Poseidone>scuote i flutti con il>Tridente di Poseidone",
  "Ciclopi>forgiarono l'Elmo per>Ade", "Elmo di Ade>è dono dei>Ciclopi",
  "Zeus>scagliò nel più profondo abisso>Tartaro", "Tartaro>prigione dei Titani vinti da>Zeus",
  "Zeus>ordinò di reggere il cielo ad>Atlante", "Atlante>è condannato da>Zeus",
  "Gea>generò per vendicarsi>Tifone", "Tifone>figlio di>Gea", "Tifone>sfidò a duello>Zeus",
  "Zeus>seppellì sotto l'Etna>Tifone", "Echidna>compagna di>Tifone",
  "Echidna>madre di>Cerbero", "Cerbero>figlio di>Echidna", "Echidna>madre di>Idra di Lerna", "Idra di Lerna>figlia di>Echidna",
  "Echidna>madre di>Chimera", "Chimera>figlia di>Echidna", "Echidna>madre di>Sfinge", "Sfinge>figlia di>Echidna",
  "Echidna>madre di>Leone di Nemea", "Leone di Nemea>figlio di>Echidna",
  "Cerbero>guardia del regno di>Ade", "Ade>padrone di>Cerbero",
  // titani secondari
  "Giapeto>padre di>Prometeo", "Prometeo>figlio di>Giapeto", "Giapeto>padre di>Epimeteo", "Epimeteo>figlio di>Giapeto",
  "Giapeto>padre di>Atlante", "Atlante>figlio di>Giapeto", "Prometeo>fratello di>Epimeteo",
  "Oceano>sposo di>Teti", "Teti>sposa di>Oceano", "Iperione>padre di>Eos", "Iperione>padre di>Selene",
  "Prometeo>rubò il fuoco celeste a>Zeus", "Zeus>incatenò al Caucaso>Prometeo", "Eracle>spezzò le catene di>Prometeo",
  "Prometeo>padre di>Deucalione", "Deucalione>figlio di>Prometeo", "Pirra>figlia di>Epimeteo",
  "Deucalione>sposo di>Pirra", "Prometeo>avvertì del diluvio>Deucalione", "Zeus>sommerse il mondo risparmiando>Deucalione",
  "Zeus>sposò una volta>Temi", "Zeus>amò per nove notti>Mnemosine",
  // olimpi
  "Zeus>sposo di>Era", "Era>sposa di>Zeus", "Zeus>padre di>Ares", "Era>madre di>Ares",
  "Era>generò senza sposo>Efesto", "Efesto>figlio di>Era", "Efesto>maestro delle forge dell'>Olimpo",
  "Zeus>ingoiò l'astuta>Meti", "Atena>sgorgò armata dalla testa di>Zeus", "Meti>madre custodita nel ventre di>Zeus",
  "Leto>madre di>Apollo", "Leto>madre di>Artemide", "Zeus>padre di>Apollo", "Zeus>padre di>Artemide",
  "Apollo>fratello gemello di>Artemide", "Delo>diede riparo a>Leto", "Apollo>signore dell'oracolo di>Delfi",
  "Zeus>padre di>Dioniso", "Semele>madre di>Dioniso", "Era>perseguitò>Semele", "Zeus>portò a termine la gestazione di>Dioniso",
  "Dioniso>sposò>Arianna", "Eros>freccia al servizio di>Afrodite",
  "Demetra>madre di>Persefone", "Zeus>padre di>Persefone", "Ade>rapì sul carro>Persefone",
  "Persefone>sposa di>Ade", "Demetra>cercò per nove giorni>Persefone", "Ecate>guidò con la fiaccola>Demetra",
  "Zeus>padre di>Ermes", "Ermes>messaggero alato di>Zeus", "Ermes>donò la>Lira di Orfeo", "Apollo>ricevette la lira da>Ermes",
  "Zeus>sedusse in forma di toro>Europa", "Europa>approdò a>Creta",
  "Zeus>amò>Io", "Io>è trasformata in giovenca da>Zeus", "Era>pose a guardia di Io il gigante>Argo", "Ermes>addormentò e uccise>Argo",
  "Era>perseguì per il mondo>Io", "Zeus>raggiunse come pioggia d'oro>Danae", "Danae>madre di>Perseo",
  "Zeus>sedusse in forma di cigno>Leda", "Leda>madre di>Elena", "Elena>figlia di>Leda",
  "Estia>custode del focolare dell'>Olimpo", "Olimpo>dimora luminosa di>Zeus", "Olimpo>dimora di>Atena",
  "Olimpo>dimora di>Apollo", "Nike>araldo della vittoria di>Zeus", "Iride>messaggera iridata di>Era",
  "Pan>figlio di>Ermes", "Pan>amò invano la ninfa>Eco", "Eco>sfiorì per amore di>Narciso", "Narciso>sdegnò>Eco",
  "Poseidone>contese l'Attica ad>Atena", "Atena>donò l'olivo ad>Atene", "Atene>prese il nome da>Atena",
  "Afrodite>sposa di>Efesto", "Afrodite>amante segreta di>Ares", "Efesto>sposo di>Afrodite",
  "Zeus>garante dei giuramenti sullo>Stige", "Lete>fiume dell'oblio del regno di>Ade", "Eliseo>accolse l'ombra di>Achille",
  // mostri ed eroi
  "Perseo>decapitò>Medusa", "Atena>guidò lo scudo di>Perseo", "Ermes>armò>Perseo",
  "Atena>maledì>Medusa", "Poseidone>amò nel tempio di Atena>Medusa",
  "Pegaso>sbocciò dal collo reciso di>Medusa", "Perseo>liberò dalla roccia>Andromeda", "Andromeda>sposa di>Perseo",
  "Sandali alati>sono calzati da>Perseo", "Ermes>prestò i>Sandali alati", "Elmo di Ade>rese invisibile>Perseo",
  "Bellerofonte>cavalcò>Pegaso", "Bellerofonte>trafisse>Chimera", "Pegaso>servì in battaglia>Bellerofonte",
  "Chirone>maestro di>Achille", "Chirone>maestro di>Giasone", "Chirone>maestro di>Eracle",
  "Zeus>padre di>Eracle", "Era>odiò ferocemente>Eracle", "Era>scagliò la follia su>Eracle",
  "Euristeo>impose dodici fatiche a>Eracle", "Eracle>strangolò>Leone di Nemea", "Eracle>distrusse le teste dell'>Idra di Lerna",
  "Eracle>catturò vivo>Cerbero", "Ade>concesse la prova a>Eracle", "Atlante>sostenne il cielo al posto di>Eracle",
  "Teseo>re di>Atene", "Teseo>uccise>Minotauro", "Arianna>donò il>Filo di Arianna", "Filo di Arianna>guidò fuori dal labirinto>Teseo",
  "Arianna>è abbandonata a Nasso da>Teseo", "Labirinto di Cnosso>prigione del>Minotauro", "Dedalo>costruì il>Labirinto di Cnosso",
  "Dedalo>padre di>Icaro", "Icaro>figlio di>Dedalo", "Dedalo>plasmò ali di cera per>Icaro", "Icaro>precipitò disobbedendo a>Dedalo",
  "Giasone>guidò gli Argonauti verso>Colchide", "Velo d'oro>è custodito a>Colchide", "Velo d'oro>è agognato da>Giasone",
  "Eros>scoccò la freccia su>Medea", "Medea>usò la magia per aiutare>Giasone", "Giasone>conquistò il>Velo d'oro",
  "Giasone>tradì>Medea", "Medea>punì con orrore>Giasone", "Medea>figlia del re di>Colchide",
  "Eris>scagliò tra gli dèi il>Pomo della Discordia", "Pomo della Discordia>è conteso da>Era", "Pomo della Discordia>è conteso da>Atena",
  "Pomo della Discordia>è conteso da>Afrodite", "Zeus>elesse giudice>Paride", "Paride>assegnò il pomo ad>Afrodite",
  "Afrodite>concesse Elena a>Paride", "Era>giurò odio eterno a>Paride", "Atena>giurò odio eterno a>Paride",
  "Paride>rapì da Sparta>Elena", "Elena>sposa di>Menelao", "Menelao>fratello di>Agamennone",
  "Agamennone>re di>Micene", "Agamennone>guidò l'assedio di>Troia", "Ettore>difensore di>Troia",
  "Achille>uccise in duello>Ettore", "Paride>colpì a morte>Achille", "Apollo>guidò la freccia di>Paride",
  "Aiace>recuperò il corpo di>Achille", "Cassandra>predisse invano la caduta di>Troia", "Cassandra>è maledetta da>Apollo",
  "Apollo>donò e poi avvelenò la profezia di>Cassandra",
  "Cavallo di Troia>è ideato da>Odisseo", "Atena>ispirò il>Cavallo di Troia", "Troia>è espugnata grazie al>Cavallo di Troia",
  "Clitennestra>sposa di>Agamennone", "Clitennestra>uccise>Agamennone", "Oreste>figlio di>Agamennone",
  "Oreste>vendicò>Agamennone", "Atena>assolse>Oreste",
  "Odisseo>re di>Itaca", "Penelope>sposa fedele di>Odisseo", "Odisseo>accecò>Polifemo", "Polifemo>figlio di>Poseidone",
  "Poseidone>giurò odio implacabile a>Odisseo", "Atena>protettrice di>Odisseo", "Odisseo>udi legato all'albero il canto delle>Sirene",
  "Scilla>divorò sei compagni di>Odisseo", "Cariddi>risucchiò la nave di>Odisseo", "Odisseo>tornò dopo vent'anni a>Itaca",
  "Orfeo>amò oltre la morte>Euridice", "Orfeo>intonò per gli Inferi la>Lira di Orfeo", "Ade>intenerito concesse un patto a>Orfeo",
  "Orfeo>si voltò perdendo per sempre>Euridice",
  "Tiresia>rese cieco per averla vista>Atena", "Zeus>donò la chiaroveggenza a>Tiresia", "Tiresia>veggente di>Tebe",
  "Sfinge>seminò terrore a>Tebe", "Edipo>decifrò l'enigma della>Sfinge", "Edipo>re di>Tebe", "Ade>domina su>Stige",
  "Aracne>sfidò nel telaio>Atena", "Atena>trasformò in ragno>Aracne",
  "Apollo>punì con orecchie d'asino>Midas", "Midas>preferì il flauto di>Apollo", "Dioniso>concesse il tocco d'oro a>Midas",
  "Niobe>derise>Leto", "Apollo>vendicò con l'arco>Leto", "Artemide>vendicò con l'arco>Leto", "Zeus>trasformò in roccia piangente>Niobe",
  "Sisifo>ingannò perfino>Ade", "Zeus>condannò all'eterna fatica>Sisifo",
  "Tantalo>offrì un banchetto empio a>Zeus", "Zeus>condannò all'eterna fame>Tantalo",
  "Egida>è plasmata da>Efesto", "Atena>porta l'>Egida", "Atalanta>cacciatrice consacrata ad>Artemide", "Artemide>protettrice di>Atalanta",
  "Pandora>è forgiata dalla creta da>Efesto", "Zeus>inviò come flagello>Pandora", "Pandora>sposa di>Epimeteo",
  "Epimeteo>accolse ignorando i moniti di Prometeo>Pandora", "Pandora>aprì il>Vaso di Pandora", "Vaso di Pandora>è una trappola ordita da>Zeus",
  "Arpie>flagello alato mandato da>Zeus",
];

interface Edge { from: string; to: string; label: string }
const EDGES: Edge[] = RAW_EDGES.map((e) => {
  const [from, label, to] = e.split(">");
  return { from, label, to };
});

const ADJ = new Map<string, Edge[]>();
for (const e of EDGES) {
  if (!ADJ.has(e.from)) ADJ.set(e.from, []);
  ADJ.get(e.from)!.push(e);
  if (!ADJ.has(e.to)) ADJ.set(e.to, []);
  ADJ.get(e.to)!.push(e);
}

export function kernelHas(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENT, name);
}

function norm(name: string): string {
  const n = name.trim();
  if (kernelHas(n)) return n;
  const cap = n.charAt(0).toUpperCase() + n.slice(1);
  if (kernelHas(cap)) return cap;
  return cap;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* BFS sul grafo non orientato, ricostruendo il cammino di archi. */
function findPath(a: string, b: string): Edge[] | null {
  const A = norm(a), B = norm(b);
  if (A === B) return [];
  const prev = new Map<string, { from: string; edge: Edge }>();
  const seen = new Set([A]);
  const queue = [A];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const e of ADJ.get(cur) ?? []) {
      const nxt = e.from === cur ? e.to : e.from;
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      prev.set(nxt, { from: cur, edge: e });
      if (nxt === B) {
        const path: Edge[] = [];
        let step = B;
        while (step !== A) {
          const p = prev.get(step)!;
          path.unshift(p.edge);
          step = p.from;
        }
        return path;
      }
      queue.push(nxt);
    }
  }
  return null;
}

function edgeSentence(e: Edge): string {
  return `[[${e.from}]] ${e.label} [[${e.to}]]`;
}

function pathSentences(path: Edge[]): string[] {
  return path.map(edgeSentence);
}

function edgesOf(name: string): Edge[] {
  return ADJ.get(norm(name)) ?? [];
}

function epithet(name: string): string {
  return EPITHET[norm(name)] ?? `presenza del mito (${ENT[norm(name)] ?? "mortale"})`;
}

function collectEntities(text: string): EntityRef[] {
  const found = new Map<string, EntityRef>();
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = norm(m[1]);
    if (!found.has(n)) found.set(n, { name: n, kind: ENT[n] ?? "mortale" });
  }
  return [...found.values()];
}

const OPENERS = [
  "Udite, narratori del destino:", "Il mito tramanda che", "Le fonti antiche concordano:",
  "Così cantano le rapsodie:", "Fra le pieghe del tempo si legge:",
];

function whoText(n: string): string {
  const N = norm(n);
  const edges = shuffle(edgesOf(N));
  const parts: string[] = [];
  parts.push(`${pick(OPENERS)} [[${N}]], ${epithet(N)}, si erge fra le figure ${ENT[N] === "divinità" ? "immarcescibili dell'Olimpo" : "indimenticabili del mito greco"}.`);
  const sents = edges.slice(0, 3 + Math.floor(Math.random() * 2)).map(edgeSentence);
  if (sents.length) parts.push(sents.join("; ") + ".");
  parts.push(pick([
    `Il nome di [[${N}]] risuona ancora dove il mito incontra il destino.`,
    `Nessuna rapsodia tace il segno lasciato da [[${N}]].`,
    `Così [[${N}]] è custodito nella memoria degli dèi e dei poeti.`,
  ]));
  return parts.join("\n\n");
}

function episodeText(n: string): string {
  const N = norm(n);
  const edges = shuffle(edgesOf(N)).slice(0, 5 + Math.floor(Math.random() * 2));
  const parts: string[] = [];
  parts.push(pick([
    `Narra il mito un episodio che stringe il cuore: la vicenda di [[${N}]].`,
    `Ascolta il passo epico di [[${N}]], tramandato dai rapsodi.`,
  ]));
  if (edges.length) {
    parts.push(edges.slice(0, 3).map(edgeSentence).join("; ") + ".");
    if (edges.length > 3) parts.push("E non è tutto: " + edges.slice(3).map(edgeSentence).join("; ") + ".");
  }
  parts.push(pick([
    `Così il destino si compì, e [[${N}]] entrò per sempre nel canto degli immortali.`,
    `Le Moire filarono, e la storia di [[${N}]] divenne mito.`,
  ]));
  return parts.join("\n\n");
}

function anecdoteText(n: string): string {
  const N = norm(n);
  const edges = shuffle(edgesOf(N)).slice(0, 2);
  const parts: string[] = [];
  parts.push(pick([
    `Un aneddoto minore ma prezioso riguarda [[${N}]].`,
    `Si racconta sottovoce, fra le colonne del mito, che`,
  ]));
  if (edges.length) parts.push(edges.map(edgeSentence).join("; e ancora: ") + ".");
  parts.push(pick([
    `Piccole storie come questa rendono grande il nome di [[${N}]].`,
    `Anche i dettagli da taverna custodiscono la gloria di [[${N}]].`,
  ]));
  return parts.join("\n\n");
}

function originText(n: string): string {
  const N = norm(n);
  const rel = edgesOf(N).filter((e) => /forgi|costruì|plasmò|creò|generò|nacque|sbocciò|partorì|dono|donò/i.test(e.label));
  const parts: string[] = [];
  parts.push(`Sull'origine di [[${N}]] le fonti si intrecciano come radici.`);
  if (rel.length) parts.push(shuffle(rel).slice(0, 3).map(edgeSentence).join("; ") + ".");
  else if (edgesOf(N).length) parts.push(shuffle(edgesOf(N)).slice(0, 2).map(edgeSentence).join("; ") + ".");
  else parts.push(`Le origini di [[${N}]] si perdono nella notte dei tempi; nessun rapsode osa giurare.`);
  parts.push(`Tale è la provenienza che il mito attribuisce a [[${N}]].`);
  return parts.join("\n\n");
}

function relationText(a: string, b: string, deep: boolean): string {
  const A = norm(a), B = norm(b);
  const path = findPath(A, B);
  const parts: string[] = [];
  if (!path) {
    parts.push(`Fra [[${A}]] e [[${B}]] i fili del Fato paiono sfuggire anche alle Moire: nessuna fonte del kernel ne canta il legame diretto.`);
  } else if (path.length === 0) {
    parts.push(`[[${A}]] e [[${B}]] sono il medesimo nome sotto il cielo del mito.`);
  } else {
    parts.push(`Il filo rosso del mito lega [[${A}]] a [[${B}]] ${path.length === 1 ? "in un solo, teso legame" : `attraverso ${path.length} nodi del destino`}.`);
    parts.push(pathSentences(path).join("; ") + ".");
    if (deep && path.length) {
      const extras = shuffle(path.flatMap((e) => edgesOf(e.from).concat(edgesOf(e.to)))).slice(0, 4);
      if (extras.length) parts.push("Appendice del filologo: " + extras.map(edgeSentence).join("; ") + ".");
    }
    parts.push(pick([
      "Così ogni filo, per quanto sottile, sostiene l'intera trama del cosmo greco.",
      "Ogni legame è una sentenza delle Moire, incisa nel marmo del mito.",
    ]));
  }
  return parts.join("\n\n");
}

function causeText(a: string, b: string): string {
  const A = norm(a), B = norm(b);
  const path = findPath(A, B);
  const parts: string[] = [];
  if (!path || path.length === 0) {
    parts.push(`Il nesso di causa ed effetto fra [[${A}]] e [[${B}]] non è attestato: il kernel tace, e tace il mito.`);
  } else {
    parts.push(`Perché le cose andarono come andarono? La catena causale che unisce [[${A}]] a [[${B}]] si srotola così:`);
    parts.push(pathSentences(path).map((s) => s).join("; da ciò seguì che ") + ".");
    parts.push(`E fu così che [[${A}]] e [[${B}]] vennero legati da una catena di eventi che nessun dio poté spezzare.`);
  }
  return parts.join("\n\n");
}

function openingText(): string {
  const chain = [
    findPath("Caos", "Urano"),
    findPath("Crono", "Zeus"),
    findPath("Zeus", "Tifone"),
    findPath("Prometeo", "Zeus"),
  ].filter((p): p is Edge[] => !!p && p.length > 0);
  const parts: string[] = [];
  parts.push("OVERTURE — Nel principio fu il [[Caos]], il vuoto primordiale. Da esso sgorgarono [[Gea]] e l'abisso del [[Tartaro]], e la [[Notte]] stese il suo manto sull'[[Erebo]].");
  for (const p of chain.slice(0, 3)) parts.push(pathSentences(p).join("; ") + ".");
  parts.push("Da questa polvere di stelle e di sangue nacque l'intero dramma del mito greco: dèi, Titani, eroi e mostri attendono il tuo tocco sulle parole in grassetto. Interroga l'Oracolo: ogni nome è una porta.");
  return parts.join("\n\n");
}

const TITLE_BY_ACTION: Record<QueryActionKey, (a?: string, b?: string) => string> = {
  opening: () => "Overture del Cosmo Greco",
  who: (a) => `Codice: ${a}`,
  anecdote: (a) => `Aneddoto: ${a}`,
  origin: (a) => `Origine: ${a}`,
  episode: (a) => `Passo epico: ${a}`,
  relation: (a, b) => `${a} ⟷ ${b}`,
  relation_deep: (a, b) => `${a} ⚔ ${b}: analisi`,
  cause: (a, b) => `${a} → ${b}: catena del Fato`,
};

export function kernelQuery(action: QueryActionKey, subject?: string, subject2?: string): OracleResult {
  const a = subject ? norm(subject) : undefined;
  const b = subject2 ? norm(subject2) : undefined;
  let text = "";
  switch (action) {
    case "opening": text = openingText(); break;
    case "who": text = whoText(a!); break;
    case "anecdote": text = anecdoteText(a!); break;
    case "origin": text = originText(a!); break;
    case "episode": text = episodeText(a!); break;
    case "relation": text = relationText(a!, b!, false); break;
    case "relation_deep": text = relationText(a!, b!, true); break;
    case "cause": text = causeText(a!, b!); break;
  }
  const entities = collectEntities(text);
  if (a && !entities.some((e) => e.name === a)) entities.unshift({ name: a, kind: ENT[a] ?? "mortale" });
  if (b && !entities.some((e) => e.name === b)) entities.unshift({ name: b, kind: ENT[b] ?? "mortale" });
  const used = new Set<string>();
  const relations: RelationEdge[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  void re;
  for (const e of EDGES) {
    const inText = text.includes(`[[${e.from}]]`) && text.includes(`[[${e.to}]]`);
    const key = `${e.from}|${e.to}|${e.label}`;
    if (inText && !used.has(key)) {
      used.add(key);
      relations.push({ from: e.from, to: e.to, label: e.label });
    }
  }
  return {
    title: TITLE_BY_ACTION[action](a, b),
    text,
    entities,
    relations: relations.slice(0, 14),
    engine: "KERNEL SAPIENZIALE · OFFLINE",
    degraded: true,
    note: "Nessuna chiave LLM configurata: l'Oracolo procedurale compone risposte dal suo grafo interno.",
  };
}

export function kernelEntities(): string[] {
  return Object.keys(ENT);
}
