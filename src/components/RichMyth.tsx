"use client";

import { memo, useMemo } from "react";
import type { CSSProperties } from "react";
import type { EntityKind } from "@/lib/types";

/**
 * Parsing dinamico (NER): il testo dell'Oracolo contiene entità marcate
 * come [[Nome]]. Ogni tag diventa un pulsante interattivo in grassetto.
 *
 * Riserva NER: se la pagina NON ha tag (i modelli free a volte dimenticano
 * la sintassi), i nomi già scoperti nella spedizione diventano cliccabili
 * direttamente nel testo piano, così nessuna pergamena resta mai "morta".
 */
const TAG_SRC = /\[\[([^\]|]{2,64})\]\]|【([^【】|]{2,64})】/;

/* Parole italiane comuni che condividono la forma con nomi mitologici:
   mai renderle pulsanti nella riserva NER (es. "Notte" vs "la notte"). */
const ITALIAN_WORDS = new Set<string>([
  "notte", "giorno", "amore", "morte", "vita", "terra", "cielo", "ombra",
  "luce", "ninfa", "madre", "padre", "figlia", "figlio", "sorella", "fratello",
  "regina", "re", "mare", "tempo", "cuore", "occhio", "voce", "sangue",
]);

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()[\]\\|]/g, "\\$&");

/* Dalla chiave minuscola di `known` genera un pattern che accetta ogni
   combinazione di maiuscole a inizio parola: "pomo della discordia" →
   [Pp]omo[\s'][Dd]ella[\s'][Dd]iscordia */
function flexNamePattern(name: string): string {
  return name
    .trim()
    .split(/[\s']+/)
    .filter(Boolean)
    .map((word) => {
      const lo = word[0].toLowerCase();
      const up = word[0].toUpperCase();
      const head = lo === up ? escapeRe(word[0]) : `[${up}${lo}]`;
      return head + escapeRe(word.slice(1));
    })
    .join("[\\s']");
}

export function buildFallbackRe(
  known: Map<string, EntityKind>,
  raw: string,
): RegExp | null {
  if (/\[\[|【/.test(raw)) return null; // la pagina ha tag veri: usa quelli
  const names = [...known.keys()].filter((n) => {
    if (ITALIAN_WORDS.has(n)) return false;
    return n.includes(" ") ? n.length >= 3 : n.length >= 4;
  });
  if (!names.length) return null;
  names.sort((a, b) => b.length - a.length); // frasi lunghe prima dei singoli nomi
  return new RegExp(names.map(flexNamePattern).join("|"), "u");
}

function kindOf(name: string, known: Map<string, EntityKind>): EntityKind {
  return known.get(name.toLowerCase()) ?? "mortale";
}

function pickName(match: RegExpExecArray): string {
  return (match[1] ?? match[2] ?? match[0]).trim();
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
  const fallbackRe = useMemo(() => buildFallbackRe(known, raw), [known, raw]);

  return (
    <div className="myth-text">
      {paragraphs.map((para, pi) => {
        const nodes: React.ReactNode[] = [];
        // regex locale: nessuno stato `lastIndex` condiviso tra render
        const re = fallbackRe
          ? new RegExp(fallbackRe.source, "gu")
          : new RegExp(TAG_SRC.source, "g");
        let last = 0;
        let m: RegExpExecArray | null;
        let k = 0;
        while ((m = re.exec(para)) !== null) {
          if (m.index > last) nodes.push(<span key={`t${k++}`}>{para.slice(last, m.index)}</span>);
          const name = pickName(m);
          if (!name) continue;
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
