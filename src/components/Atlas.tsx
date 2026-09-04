"use client";

import { useMemo, useState } from "react";
import { BookOpen, Fingerprint } from "lucide-react";
import type { BoardEntity, RelationEdge } from "@/lib/types";
import { KIND_META } from "@/lib/types";
import { KIND_ICON } from "./Corkboard";
import { WindowFrame } from "./Retro";

export default function Atlas({
  entities,
  relations,
  selected,
  onPick,
}: {
  entities: BoardEntity[];
  relations: RelationEdge[];
  selected: string[];
  onPick: (name: string) => void;
}) {
  const [tab, setTab] = useState<"ent" | "rel">("ent");
  const selSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);

  const sorted = useMemo(
    () => entities.slice().sort((a, b) => a.name.localeCompare(b.name, "it")),
    [entities]
  );

  return (
    <WindowFrame
      title="ATLANTE.EXE — Registro delle scoperte"
      className="hidden h-full w-[292px] flex-none xl:flex"
    >
      <div className="flex gap-0" role="tablist">
        <button
          role="tab"
          aria-selected={tab === "ent"}
          className={`tab-btn ${tab === "ent" ? "active" : ""}`}
          onClick={() => setTab("ent")}
        >
          Entità ({entities.length})
        </button>
        <button
          role="tab"
          aria-selected={tab === "rel"}
          className={`tab-btn ${tab === "rel" ? "active" : ""}`}
          onClick={() => setTab("rel")}
        >
          Relazioni ({relations.length})
        </button>
      </div>

      <div className="scroll90 sunk min-h-0 flex-1 overflow-y-auto bg-[#f3ecd9] p-1">
        {tab === "ent" ? (
          sorted.length === 0 ? (
            <p className="p-2 font-vt text-lg text-[#6b5730]">Nessuna entità schedata.</p>
          ) : (
            sorted.map((e) => {
              const Icon = KIND_ICON[e.kind];
              const meta = KIND_META[e.kind];
              const sel = selSet.has(e.name.toLowerCase());
              return (
                <button
                  key={e.name}
                  className={`atlas-row ${sel ? "sel" : ""}`}
                  onClick={() => onPick(e.name)}
                  data-tip={`${meta.label} · seleziona per interrogare`}
                >
                  <Icon size={13} style={{ color: sel ? "#ffe58a" : meta.color, flex: "none" }} />
                  <span className="truncate font-bold">{e.name}</span>
                  <span className="ml-auto font-silk text-[8px] opacity-60">{meta.label}</span>
                </button>
              );
            })
          )
        ) : relations.length === 0 ? (
          <p className="p-2 font-vt text-lg text-[#6b5730]">Nessun filo tessuto.</p>
        ) : (
          relations.map((r, i) => (
            <div key={`${r.from}|${r.to}|${r.label}|${i}`} className="rel-row">
              <span className="font-bold text-[#10106a]">{r.from}</span>
              <span className="mx-1 font-silk text-[8px] uppercase tracking-wide text-[#8a1010]">
                ▸ {r.label} ▸
              </span>
              <span className="font-bold text-[#10106a]">{r.to}</span>
            </div>
          ))
        )}
      </div>

      <div className="greek-band" aria-hidden />
      <div className="flex items-center gap-2 px-2 py-1 font-vt text-[16px] text-[#333]">
        <Fingerprint size={13} />
        <span>{tab === "ent" ? "Clic sul nome = selezione" : "Fili svelati dall'Oracolo"}</span>
        <BookOpen size={13} className="ml-auto" />
      </div>
    </WindowFrame>
  );
}
