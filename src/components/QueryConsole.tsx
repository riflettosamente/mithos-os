"use client";

import {
  CornerUpLeft, Drama, Factory, HelpCircle, Hourglass, Languages, MessagesSquare, Network, Repeat2, ScrollText, X,
} from "lucide-react";
import type { QueryActionKey } from "@/lib/types";
import { sfx } from "@/lib/sound";
import { WindowFrame } from "./Retro";

interface Cmd {
  key: QueryActionKey;
  needs: number;
  icon: typeof HelpCircle;
  make: (a: string, b: string) => string;
}

const COMMANDS: Cmd[] = [
  { key: "who", needs: 1, icon: HelpCircle, make: (a) => `Racconta chi è: ${a}` },
  { key: "etymology", needs: 1, icon: Languages, make: (a) => `Etimologia di: ${a}` },
  { key: "origin", needs: 1, icon: Factory, make: (a) => `Chi ha costruito / Da dove proviene: ${a}` },
  { key: "anecdote", needs: 1, icon: MessagesSquare, make: (a) => `Racconta un aneddoto mitologico su: ${a}` },
  { key: "episode", needs: 1, icon: ScrollText, make: (a) => `Narra il passo mitologico di: ${a}` },
  { key: "relation", needs: 2, icon: Network, make: (a, b) => `Che relazione ha ${a} con ${b}` },
  { key: "relation_deep", needs: 2, icon: Drama, make: (a, b) => `Approfondisci la relazione tra ${a} e ${b}` },
  { key: "cause", needs: 2, icon: CornerUpLeft, make: (a, b) => `Qual è il nesso causa/effetto tra ${a} e ${b}` },
];

export default function QueryConsole({
  selected,
  loading,
  activeAction,
  flipped,
  newRelationsPulse,
  onUnselect,
  onClear,
  onCommand,
  onFlip,
}: {
  selected: string[];
  loading: boolean;
  activeAction: QueryActionKey | null;
  flipped: boolean;
  newRelationsPulse: boolean;
  onUnselect: (name: string) => void;
  onClear: () => void;
  onCommand: (action: QueryActionKey) => void;
  onFlip: () => void;
}) {
  const a = selected[0] ?? "";
  const b = selected[1] ?? "";
  const count = selected.length;

  return (
    <WindowFrame
      title="INTERROGA.EXE — Pannello dei comandi dell'Oracolo"
      /* altezza invariabile: il caricamento non può spingere ORACOLO.EXE */
      className="h-[clamp(178px,25vh,238px)] max-h-[34vh] flex-none overflow-hidden"
    >
      <div className="scroll90 min-h-0 overflow-y-auto">
        {/* selezione corrente */}
        <div className="raised mb-2 flex flex-wrap items-center gap-2 bg-[#b8b8b8] px-2 py-1.5">
          <span className="font-silk text-[10px] uppercase tracking-[0.12em] text-[#333]">
            Parole scelte:
          </span>
          {count === 0 && (
            <span className="sunk inline-flex items-center bg-[#ececec] px-2 py-0.5 font-vt text-lg text-[#555]">
              — clicca i nomi in grassetto nel testo o nell&apos;Atlante (max 2) —
            </span>
          )}
          {selected.map((s, i) => (
            <button
              key={s}
              className="chip"
              onClick={() => { sfx("click"); onUnselect(s); }}
              data-tip={i === 0 ? "1ª parola · usata dai comandi singoli" : "2ª parola · usata dai comandi di relazione"}
              data-tip-pos="bottom-start"
            >
              <span className="chip-ord">{i + 1}</span>
              {s.toUpperCase()} <X size={11} strokeWidth={3} />
            </button>
          ))}
          {count > 0 && (
            <button
              className="btn90 !px-2 !py-1"
              onClick={() => { sfx("click"); onClear(); }}
              disabled={loading}
            >
              <X size={12} /> Annulla
            </button>
          )}
          <button
            className={`btn90 btn-gold ml-auto ${newRelationsPulse ? "pulse-gold" : ""}`}
            onClick={() => { sfx("flip"); onFlip(); }}
            disabled={loading}
            data-tip="Ruota la lavagna 3D: testo ⟷ mappa investigativa"
            data-tip-pos="bottom-end"
          >
            <Repeat2 size={14} />
            {flipped ? "Gira: torna al Testo" : "Gira: Mappa investigativa"}
          </button>
        </div>

        {/* gli otto comandi */}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {COMMANDS.map((c) => {
            /*
             * I comandi da 1 parola restano attivi anche con due parole
             * scelte: agiscono sulla PRIMA (quella mostrata nell'etichetta).
             * Così un clic non resta mai senza effetto.
             */
            const enabled = !loading && (c.needs === 1 ? !!a : !!a && !!b);
            const active = loading && activeAction === c.key;
            const Icon = c.icon;
            return (
              <button
                key={c.key}
                className={`btn90 justify-start !text-left ${active ? "query-active" : ""}`}
                disabled={!enabled}
                onClick={() => { sfx("ok"); onCommand(c.key); }}
                data-tip={
                  enabled
                    ? c.needs === 1
                      ? `Interroga: ${a}`
                      : `Interroga: ${a} × ${b}`
                    : c.needs === 1
                      ? "Scegli una parola nel testo"
                      : "Servono due parole: scegline una seconda"
                }
              >
                {active ? <Hourglass size={13} className="hourglass-spin flex-none" /> : <Icon size={13} className="flex-none" />}
                <span className="truncate">
                  {active
                    ? c.key === "anecdote"
                      ? `Richiesta ricevuta: aneddoto su ${a}…`
                      : `Richiesta ricevuta: ${c.make(a, b)}…`
                    : c.make(a || "[parola]", b || "[parola]")}
                </span>
              </button>
            );
          })}
          <div className="sunk hidden items-center gap-2 bg-[#1c1c1c] px-3 py-1 font-vt text-lg text-[#9fe8ff] 2xl:flex">
            {loading ? (
              <>
                <Hourglass size={14} className="hourglass-spin text-[#ffe58a]" />
                <span className="flicker">L&apos;ORACOLO STA COMPONENDO…</span>
              </>
            ) : (
              <span className="cursor-blink">▮ IN ATTESA DI COMANDI</span>
            )}
          </div>
        </div>
      </div>
    </WindowFrame>
  );
}
