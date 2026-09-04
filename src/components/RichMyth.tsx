"use client";

import { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import type { EntityKind } from "@/lib/types";

/**
 * Parsing dinamico (NER): il testo dell'Oracolo contiene entità marcate
 * come [[Nome]]. Ogni tag diventa un pulsante interattivo in grassetto.
 */
const TAG_SRC = /\[\[([^\]|]{2,64})\]\]/;

function kindOf(name: string, known: Map<string, EntityKind>): EntityKind {
  return known.get(name.toLowerCase()) ?? "mortale";
}

function RichMyth({
  raw,
  known,
  selected,
  onEntity,
}: {
  raw: string;
  known: Map<string, EntityKind>;
  selected: string[];
  onEntity: (name: string) => void;
}) {
  const paragraphs = useMemo(() => raw.split(/\n{2,}|\n/).filter((p) => p.trim()), [raw]);
  const selSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);

  return (
    <div className="myth-text">
      {paragraphs.map((para, pi) => {
        const nodes: React.ReactNode[] = [];
        // regex locale: nessuno stato `lastIndex` condiviso tra render
        const re = new RegExp(TAG_SRC.source, "g");
        let last = 0;
        let m: RegExpExecArray | null;
        let k = 0;
        while ((m = re.exec(para)) !== null) {
          if (m.index > last) nodes.push(<span key={`t${k++}`}>{para.slice(last, m.index)}</span>);
          const name = m[1].trim();
          const kind = kindOf(name, known);
          const isSel = selSet.has(name.toLowerCase());
          nodes.push(
            <button
              key={`e${k++}`}
              type="button"
              className={`myth-ent k-${kind} ${isSel ? "selected" : ""}`}
              data-tip={`${kind.toUpperCase()} · clicca per interrogare`}
              onClick={() => onEntity(name)}
            >
              <span className="ent-label" style={{ fontWeight: 700 } as CSSProperties}>{name}</span>
            </button>
          );
          last = m.index + m[0].length;
        }
        if (last < para.length) nodes.push(<span key={`t${k++}`}>{para.slice(last)}</span>);
        return <p key={pi} className="rise-in" style={{ animationDelay: `${Math.min(pi * 60, 300)}ms` }}>{nodes}</p>;
      })}
    </div>
  );
}

export default memo(RichMyth);
