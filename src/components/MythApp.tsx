"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ChevronDown, Columns3, KeyRound, Lamp, RefreshCw, RotateCcw, ScrollText, Shuffle, Volume2, VolumeX, X,
} from "lucide-react";
import type {
  BoardEntity, EntityKind, MythPage, OracleResult, PersistedState, QueryActionKey, RelationEdge,
} from "@/lib/types";
import { ACTION_LABEL, inferEntityKind } from "@/lib/types";
import { setSoundEnabled, sfx } from "@/lib/sound";
import { fetchJson } from "@/lib/api";
import BootScreen from "./BootScreen";
import TextWindow from "./TextWindow";
import Corkboard from "./Corkboard";
import Atlas from "./Atlas";
import QueryConsole from "./QueryConsole";
import ApiKeyDialog from "./ApiKeyDialog";
import { WindowFrame } from "./Retro";

const MAX_HISTORY = 90;

/*
 * Griglia dinamica a margini sicuri. Le coordinate indicano la puntina
 * del cartellino: 10–90% in orizzontale, 9–80% in verticale.
 */
function layoutPos(index: number, total: number): { x: number; y: number } {
  const cols = Math.max(3, Math.ceil(Math.sqrt(Math.max(total, 1) * 1.6)));
  const rows = Math.max(1, Math.ceil(total / cols));
  const col = index % cols;
  const row = Math.floor(index / cols);
  return {
    x: cols === 1 ? 50 : 10 + (col * 80) / (cols - 1),
    y: rows === 1 ? 38 : 9 + (row * 71) / (rows - 1),
  };
}

/*
 * Per una scoperta successiva non sposta i cartellini già sistemati:
 * valuta una griglia più ampia e sceglie la cella più lontana dai nodi
 * esistenti. La metrica ellittica tiene conto del formato delle schede.
 */
function freePos(existing: BoardEntity[]): { x: number; y: number } {
  const count = Math.max(20, existing.length + 12);
  const candidates = Array.from({ length: count }, (_, i) => layoutPos(i, count));
  let best = candidates[0];
  let bestScore = -1;
  for (const p of candidates) {
    let score = Number.POSITIVE_INFINITY;
    for (const e of existing) {
      const dx = (p.x - e.x) / 15;
      const dy = (p.y - e.y) / 18;
      score = Math.min(score, Math.hypot(dx, dy));
    }
    if (score > bestScore) {
      best = p;
      bestScore = score;
    }
  }
  return best;
}

function relationsKey(r: RelationEdge): string {
  return `${r.from}|${r.to}|${r.label}`.toLowerCase();
}

/*
 * Riconcilia il NER dell'LLM con ciò che appare davvero nella pergamena.
 * I tag [[Nome]] e gli estremi dei fili vengono sempre trasformati in
 * cartellini, anche se il provider dimentica di duplicarli in `entita`.
 */
function reconcileEntities(data: OracleResult): { name: string; kind: EntityKind }[] {
  const byName = new Map<string, { name: string; kind: EntityKind }>();
  for (const e of data.entities ?? []) {
    const name = e.name.trim();
    if (name) byName.set(name.toLocaleLowerCase("it"), { name, kind: inferEntityKind(name, e.kind) });
  }

  const tagged = /\[\[([^\]|]{2,64})\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = tagged.exec(data.text)) !== null) {
    const name = match[1].trim();
    const key = name.toLocaleLowerCase("it");
    if (name && !byName.has(key)) byName.set(key, { name, kind: inferEntityKind(name) });
  }

  for (const rel of data.relations ?? []) {
    for (const name of [rel.from, rel.to]) {
      const clean = name.trim();
      const key = clean.toLocaleLowerCase("it");
      if (clean && !byName.has(key)) byName.set(key, { name: clean, kind: inferEntityKind(clean) });
    }
  }
  return [...byName.values()];
}

function repairPersistedKinds(entities: BoardEntity[]): BoardEntity[] {
  return entities.map((entity) => {
    const kind = inferEntityKind(entity.name, entity.kind);
    return kind === entity.kind ? entity : { ...entity, kind };
  });
}

interface Modal {
  title: string;
  lines: string[];
  tone: "err" | "info" | "confirm";
  confirmLabel?: string;
  onConfirm?: () => void;
}

export default function MythApp() {
  const [phase, setPhase] = useState<"check" | "boot" | "ready">("check");
  const [sid, setSid] = useState<string | null>(null);
  const [hasSave, setHasSave] = useState(false);
  const savedRef = useRef<PersistedState | null>(null);

  const [pages, setPages] = useState<MythPage[]>([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [ents, setEnts] = useState<BoardEntity[]>([]);
  const [rels, setRels] = useState<RelationEdge[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<QueryActionKey | null>(null);
  const [loadingLabel, setLoadingLabel] = useState("");
  /* lock sincrono: impedisce invii duplicati prima del render React */
  const queryLockRef = useRef(false);
  const [modal, setModal] = useState<Modal | null>(null);
  const [lastQuery, setLastQuery] = useState<{ action: QueryActionKey; a?: string; b?: string } | null>(null);
  const [engine, setEngine] = useState("—");
  const [soundOn, setSoundOn] = useState(true);
  const [clock, setClock] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyDialog, setKeyDialog] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const entityKeysRef = useRef(new Set<string>());

  const bootRan = useRef(false);
  const degradedShown = useRef(false);

  /* ------------------------- boot: sessione ------------------------- */
  useEffect(() => {
    if (bootRan.current) return;
    bootRan.current = true;
    let id = window.localStorage.getItem("mythos.sid");
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem("mythos.sid", id);
    }
    setSid(id);
    let cancelled = false;
    /* il controllo del salvataggio sopravvive alla finestra di
       riscaldamento del server: fino a 5 tentativi con backoff */
    fetchJson<{ exists?: boolean; state?: PersistedState }>(
      `/api/state?sid=${encodeURIComponent(id)}`,
      undefined,
      { retries: 5, delayMs: 1100 }
    )
      .then((data) => {
        if (cancelled) return;
        if (data.exists && data.state && data.state.pages.length > 0) {
          savedRef.current = data.state;
          setHasSave(true);
        }
        setPhase("boot");
      })
      .catch(() => {
        if (!cancelled) setPhase("boot");
      });
    return () => { cancelled = true; };
  }, []);

  /* ------------------------- orologio ------------------------- */
  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, []);

  /* ------------------------- merge helpers ------------------------- */
  const mergeEntities = useCallback((incoming: { name: string; kind: EntityKind }[]): number => {
    let discovered = 0;
    for (const inc of incoming) {
      const key = inc.name.toLocaleLowerCase("it");
      if (!entityKeysRef.current.has(key)) {
        entityKeysRef.current.add(key);
        discovered += 1;
      }
    }

    setEnts((prev) => {
      const map = new Map(prev.map((e) => [e.name.toLocaleLowerCase("it"), e]));
      const next = prev.slice();
      const uniqueNew = [...new Set(
        incoming
          .map((e) => e.name.toLocaleLowerCase("it"))
          .filter((key) => !map.has(key))
      )];
      let initialIndex = 0;
      for (const inc of incoming) {
        const key = inc.name.toLocaleLowerCase("it");
        const cur = map.get(key);
        if (cur) {
          if (cur.kind === "mortale" && inc.kind !== "mortale") {
            const upd = { ...cur, kind: inc.kind };
            map.set(key, upd);
            next[next.findIndex((e) => e.name.toLocaleLowerCase("it") === key)] = upd;
          }
        } else {
          const pos = prev.length === 0
            ? layoutPos(initialIndex++, uniqueNew.length)
            : freePos(next);
          const ne: BoardEntity = { name: inc.name, kind: inc.kind, x: pos.x, y: pos.y };
          map.set(key, ne);
          next.push(ne);
        }
      }
      return next;
    });
    return discovered;
  }, []);

  const mergeRelations = useCallback((incoming: RelationEdge[]): number => {
    let added = 0;
    setRels((prev) => {
      const set = new Set(prev.map(relationsKey));
      const next = prev.slice();
      for (const r of incoming) {
        const k = relationsKey(r);
        if (!set.has(k) && r.from.toLowerCase() !== r.to.toLowerCase()) {
          set.add(k);
          next.push(r);
          added += 1;
        }
      }
      return next;
    });
    return added;
  }, []);

  /* ------------------------- interrogazione ------------------------- */
  const runQuery = useCallback(
    async (action: QueryActionKey, a?: string, b?: string, opts?: { replaceOpening?: "kernel" | "any" }) => {
      /*
       * Il ref è aggiornato subito, prima del prossimo render: un doppio
       * click non può avviare due richieste concorrenti. `loading` resta
       * lo stato visuale, non più l'unico mutex.
       */
      if (queryLockRef.current) return;
      queryLockRef.current = true;
      setLoading(true);
      setActiveAction(action);
      setLoadingLabel(a ? `${ACTION_LABEL[action]} · ${a}${b ? ` × ${b}` : ""}` : ACTION_LABEL[action]);
      setLastQuery({ action, a, b });
      try {
        const data = await fetchJson<OracleResult & { error?: string }>(
          "/api/query",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, subject: a, subject2: b, sid }),
          },
          { retries: 3, delayMs: 1200 }
        );
        if (data.error) throw new Error(data.error);

        const discoveredEntities = reconcileEntities(data);
        const page: MythPage = {
          id: `p${Date.now()}${Math.floor(Math.random() * 999)}`,
          action,
          subject: a,
          subject2: b,
          title: data.title,
          raw: data.text,
          entities: discoveredEntities,
          relations: data.relations,
          engine: data.engine,
          at: Date.now(),
        };

        const newEntityCount = mergeEntities(discoveredEntities);
        const added = mergeRelations(data.relations);
        if (action === "relation" || action === "relation_deep" || action === "cause") {
          if (a && b) {
            const implicit: RelationEdge = { from: a, to: b, label: ACTION_LABEL[action].toLowerCase() };
            mergeRelations([implicit]);
          }
        }
        if ((newEntityCount > 0 || added > 0) && !flipped) setPulse(true);

        setPages((prev) => {
          if (opts?.replaceOpening) {
            /* Rigenerazione del PASSO 01 (chiave appena inserita o comando
               manuale): sostituisce l'overture SENZA spostare la posizione di
               lettura, SOLO se l'Oracolo ha davvero risposto (non degradato,
               cosi una overture LLM non viene mai sovrascritta dal kernel).
               "kernel" = solo se il passo 01 era procedurale (auto alla chiave);
               "any" = sempre che sia una overture (comando manuale). */
            const isKernelPage = prev[0]?.engine.includes("KERNEL") ?? false;
            const replaceable =
              opts.replaceOpening === "kernel"
                ? isKernelPage
                : true;
            if (
              prev.length > 0 &&
              prev[0].action === "opening" &&
              replaceable &&
              !data.degraded
            ) {
              const replaced = [...prev];
              replaced[0] = page;
              return replaced.slice(-MAX_HISTORY);
            }
            return prev; // niente riscrittura: overture gia viva o oracolo ancora muto
          }
          const truncated = prev.slice(0, idxRef.current + 1);
          const merged = [...truncated, page].slice(-MAX_HISTORY);
          setIdx(merged.length - 1);
          return merged;
        });

        setEngine(data.engine);
        if (data.degraded && !degradedShown.current) {
          degradedShown.current = true;
          setModal({
            tone: "info",
            title: "AVVISO DELL'ORACOLO",
            lines: [
              data.note?.startsWith("Provider LLM")
                ? "LA CHIAVE È STATA LETTA, MA IL PROVIDER HA RIFIUTATO O NON HA COMPLETATO LA RICHIESTA."
                : "NESSUNA CHIAVE LLM RILEVATA NEL SISTEMA.",
              data.note ?? "",
              "L'Oracolo procedurale compone comunque ogni passo.",
              "Apri File → Configura chiave LLM e controlla provider, API key e ID modello. Se è un problema di configurazione, l'errore dettagliato qui sopra indica provider e modello fallito.",
            ],
          });
        }
        sfx("ok");
      } catch (err) {
        sfx("err");
        setModal({
          tone: "err",
          title: "ERRORE DI SISTEMA",
          lines: [
            "LA TRASMISSIONE DELL'ORACOLO SI È INTERROTTA.",
            err instanceof Error ? err.message.toUpperCase() : "ERRORE SCONOSCIUTO",
            "VERIFICA LA CONNESSIONE O RIPROVA.",
          ],
        });
      } finally {
        queryLockRef.current = false;
        setLoading(false);
        setActiveAction(null);
      }
    },
    [flipped, sid, mergeEntities, mergeRelations]
  );

  const idxRef = useRef(0);
  useEffect(() => { idxRef.current = idx; }, [idx]);

  /* ------------------------- avvio ------------------------- */
  const startNew = useCallback(() => {
    if (sid) fetch(`/api/state?sid=${encodeURIComponent(sid)}`, { method: "DELETE" }).catch(() => undefined);
    setPages([]); setIdx(0); setEnts([]); setRels([]); setSelected([]);
    setFlipped(false); setHasSave(false); setModal(null);
    setPhase("ready");
    void runQuery("opening");
  }, [sid, runQuery]);

  const startResume = useCallback(() => {
    const st = savedRef.current;
    if (st) {
      const repairedEntities = repairPersistedKinds(st.entities);
      entityKeysRef.current = new Set(repairedEntities.map((e) => e.name.toLocaleLowerCase("it")));
      setEnts(repairedEntities);
      setRels(st.relations);
      setPages(st.pages);
      setIdx(Math.min(st.idx, st.pages.length - 1));
      setEngine(st.pages[st.pages.length - 1]?.engine ?? "—");
    }
    setPhase("ready");
    if (!st || st.pages.length === 0) void runQuery("opening");
  }, [runQuery]);

  /* conferma retrò per una nuova spedizione */
  const requestNewGame = useCallback(() => {
    sfx("click");
    setModal({
      tone: "confirm",
      title: "NUOVA SPEDIZIONE",
      lines: [
        "La spedizione corrente (pergamene, entità e fili)",
        "verrà cancellata dal registro. La chiave LLM resta.",
        "Vuoi davvero ricominciare dal Caos?",
      ],
      confirmLabel: "Sì, ricomincia",
      onConfirm: () => { setModal(null); startNew(); },
    });
  }, [startNew]);

  /* chiusura del menu File: clic fuori o ESC */
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  /* ------------------------- persistenza ------------------------- */
  useEffect(() => {
    if (phase !== "ready" || !sid) return;
    const t = window.setTimeout(() => {
      fetch(`/api/state?sid=${encodeURIComponent(sid)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entities: ents, relations: rels, pages }),
      }).catch(() => undefined);
    }, 1200);
    return () => window.clearTimeout(t);
  }, [ents, rels, pages, phase, sid]);

  /* ------------------------- interazioni ------------------------- */
  const toggleSelect = useCallback((name: string) => {
    setSelected((prev) => {
      const key = name.toLowerCase();
      if (prev.some((s) => s.toLowerCase() === key)) return prev.filter((s) => s.toLowerCase() !== key);
      if (prev.length >= 2) { sfx("select"); return [prev[1], name]; }
      sfx("select");
      return [...prev, name];
    });
  }, []);

  const known = useMemo(() => {
    const m = new Map<string, EntityKind>();
    for (const e of ents) m.set(e.name.toLowerCase(), e.kind);
    return m;
  }, [ents]);

  const onFlip = useCallback(() => {
    setFlipped((f) => {
      if (!f) setPulse(false);
      return !f;
    });
  }, []);

  const onMove = useCallback((name: string, x: number, y: number) => {
    setEnts((prev) => prev.map((e) => (e.name === name ? { ...e, x, y } : e)));
  }, []);

  const onTidy = useCallback(() => {
    setEnts((prev) => prev.map((e, i) => ({ ...e, ...layoutPos(i, prev.length) })));
  }, []);

  const navigate = useCallback((dir: -1 | 1) => {
    sfx("click");
    setIdx((v) => v + dir);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((v) => {
      setSoundEnabled(!v);
      return !v;
    });
    sfx("click");
  }, []);

  const retry = useCallback(() => {
    setModal(null);
    if (lastQuery) void runQuery(lastQuery.action, lastQuery.a, lastQuery.b);
  }, [lastQuery, runQuery]);

  const page = pages[idx] ?? null;
  const boardTitle = flipped
    ? "MAPPA.EXE — Bacheca investigativa del detective"
    : "ORACOLO.EXE — Pergamena vivente";

  return (
    <div className="relative h-[100dvh] w-full select-none overflow-hidden">
      <div className="desktop-bg" aria-hidden />
      <div className="starfield" aria-hidden />

      {(phase === "boot" || phase === "check") && (
        <BootScreen hasSave={hasSave} saveChecked={phase === "boot"} onNew={startNew} onResume={startResume} />
      )}

      {phase === "ready" && (
        <div className="relative z-10 grid h-full grid-rows-[auto_auto_minmax(0,1fr)_auto_auto]">
          {/* barra del titolo dell'applicazione */}
          <header className="titlebar !m-0 !text-[13px]">
            <span className="tb-dot" aria-hidden />
            <Columns3 size={13} />
            <span className="truncate">ΜΥΘΟΣ·OS — GRANDE ATLANTE INTERATTIVO DELLA MITOLOGIA GRECA</span>
            <span className="ml-auto flex items-center gap-3 font-vt text-[15px]">
              <span className="hidden md:inline">MOTORE: {engine}</span>
              <span>{clock}</span>
            </span>
          </header>

          {/* menubar */}
          <nav className="menubar bg-[#c0c0c0] shadow-[inset_0_-1px_0_#808080,inset_0_1px_0_#ffffff]">
            <div className="relative" ref={menuRef}>
              <button
                className={`menu-item hover:!bg-[#000184] ${menuOpen ? "!bg-[#000184] !text-white" : ""}`}
                onClick={() => { sfx("click"); setMenuOpen((v) => !v); }}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <ScrollText size={14} /> File
                <ChevronDown size={10} strokeWidth={3} className={menuOpen ? "rotate-180" : ""} />
              </button>
              {menuOpen && (
                <div className="menu-pop" role="menu">
                  <button
                    className="menu-pop-row"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); sfx("click"); setKeyDialog(true); }}
                  >
                    <KeyRound size={15} /> Configura chiave LLM…
                    <span className="menu-pop-hint">API KEY</span>
                  </button>
                  {pages.length > 0 && pages[0].action === "opening" && (
                    <>
                      <div className="menu-sep" aria-hidden />
                      <button
                        className="menu-pop-row"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          sfx("click");
                          degradedShown.current = false; // consenti l'avviso se l'oracolo è muto
                          void runQuery("opening", undefined, undefined, { replaceOpening: "any" });
                        }}
                      >
                        <ScrollText size={15} /> Rigenera overture…
                        <span className="menu-pop-hint">PASSO 01</span>
                      </button>
                    </>
                  )}
                  <div className="menu-sep" aria-hidden />
                  <button
                    className="menu-pop-row"
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); requestNewGame(); }}
                  >
                    <RotateCcw size={15} /> Nuova spedizione…
                    <span className="menu-pop-hint">RESET</span>
                  </button>
                </div>
              )}
            </div>
            <span className="menu-item">Modifica</span>
            <span className="menu-item">Mitologia</span>
            <button className="menu-item hover:!bg-[#000184]" onClick={() => { sfx("click"); onFlip(); }}>
              <RefreshCw size={14} /> Gira lavagna
            </button>
            <button className="menu-item hover:!bg-[#000184]" onClick={() => { sfx("click"); onTidy(); }}>
              <Shuffle size={14} /> Auto-disponi
            </button>
            <button className="menu-item ml-auto hover:!bg-[#000184]" onClick={toggleSound}>
              {soundOn ? <Volume2 size={14} /> : <VolumeX size={14} />} Audio {soundOn ? "ON" : "OFF"}
            </button>
          </nav>

          {/* area principale */}
          <main className="flex min-h-0 gap-2 px-2 pb-1.5 pt-1.5">
            <WindowFrame title={boardTitle} className="min-w-0 flex-1">
              <div className="flip-stage min-h-0 flex-1">
                <div className={`flip-inner ${flipped ? "flipped" : ""}`}>
                  <div className="flip-face front">
                    <TextWindow
                      page={page}
                      idx={idx}
                      total={pages.length}
                      known={known}
                      selected={selected}
                      loading={loading}
                      loadingLabel={loadingLabel}
                      onEntity={toggleSelect}
                      onBack={() => navigate(-1)}
                      onFwd={() => navigate(1)}
                    />
                  </div>
                  <div className="flip-face back">
                    <Corkboard
                      entities={ents}
                      relations={rels}
                      selected={selected}
                      loading={loading}
                      onMove={onMove}
                      onTidy={onTidy}
                      onNodeQuery={(name) => {
                        setFlipped(false);
                        void runQuery("who", name);
                      }}
                    />
                  </div>
                </div>
              </div>
            </WindowFrame>
            <Atlas entities={ents} relations={rels} selected={selected} onPick={toggleSelect} />
          </main>

          {/* console dei comandi */}
          <QueryConsole
            selected={selected}
            loading={loading}
            activeAction={activeAction}
            flipped={flipped}
            newRelationsPulse={pulse}
            onUnselect={(n) => setSelected((prev) => prev.filter((s) => s.toLowerCase() !== n.toLowerCase()))}
            onClear={() => setSelected([])}
            onCommand={(action) => {
              const needsTwo = action === "relation" || action === "relation_deep" || action === "cause";
              void runQuery(action, selected[0], needsTwo ? selected[1] : undefined);
            }}
            onFlip={onFlip}
          />

          {/* statusbar */}
          <footer className="statusbar">
            <span className={`status-cell sunk flex-1 ${loading ? "text-[#000184]" : ""}`}>
              <Lamp size={13} className={loading ? "flicker text-[#b8860b]" : ""} />
              {loading ? "SINTESI IN CORSO — consulto delle fonti…" : "PRONTO — l'Oracolo ascolta"}
            </span>
            <span className="status-cell sunk">ENTITÀ {ents.length}</span>
            <span className="status-cell sunk">RELAZIONI {rels.length}</span>
            <span className="status-cell sunk hidden sm:inline-flex">{flipped ? "SEZIONE: MAPPA" : "SEZIONE: TESTO"}</span>
            <span className="status-cell sunk hidden md:inline-flex">PASSI {pages.length}</span>
          </footer>
        </div>
      )}

      {/* modale di sistema */}
      {modal && phase === "ready" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog" aria-modal>
          <div className="win w-full max-w-md">
            <header className={`titlebar ${modal.tone === "err" ? "!bg-none !bg-[#8a1010]" : ""}`}>
              <AlertTriangle size={12} />
              <span>{modal.title}</span>
              <span className="tb-btns" aria-hidden><span className="tb-btn"><X size={9} strokeWidth={3} /></span></span>
            </header>
            <div className="win-body">
              <div className="sunk pergam space-y-1 p-3 font-vt text-lg leading-snug">
                {modal.lines.filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
              </div>
              <div className="flex justify-center gap-3 pt-1">
                {modal.tone === "err" && lastQuery && (
                  <button className="btn90" onClick={retry}><RefreshCw size={12} /> Riprova</button>
                )}
                {modal.tone === "confirm" && modal.onConfirm ? (
                  <>
                    <button className="btn90 btn-gold" onClick={() => { sfx("ok"); modal.onConfirm?.(); }}>
                      {modal.confirmLabel ?? "Conferma"}
                    </button>
                    <button className="btn90" onClick={() => { sfx("click"); setModal(null); }}>Annulla</button>
                  </>
                ) : (
                  <button className="btn90" onClick={() => { sfx("click"); setModal(null); }}>OK</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* custode delle chiavi LLM */}
      <ApiKeyDialog
        open={keyDialog && phase === "ready"}
        sid={sid}
        onClose={() => setKeyDialog(false)}
        onSaved={() => {
          degradedShown.current = false;
          setEngine("CHIAVE UTENTE · pronta");
          /* chiave appena inserita: se PASSO 01 e ancora l'overture scritta
             dal kernel procedurale (spedizione iniziata senza chiave),
             la rigeneriamo con l'Oracolo LLM appena entrato in funzione */
          if (pages[0]?.action === "opening" && pages[0].engine.includes("KERNEL")) {
            void runQuery("opening", undefined, undefined, { replaceOpening: "kernel" });
          }
        }}
      />

      <div className="vignette" aria-hidden />
      <div className="crt" aria-hidden />
    </div>
  );
}
