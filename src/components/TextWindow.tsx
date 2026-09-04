"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Hourglass, ScrollText } from "lucide-react";
import type { EntityKind, MythPage } from "@/lib/types";
import { ACTION_LABEL } from "@/lib/types";
import RichMyth from "./RichMyth";
import { GreekBand, MarqueeLoader } from "./Retro";

const FLAVOR = [
  "INTERROGO L'ARCHIVIO DI DELFI…",
  "CONFRONTO OMERO · ESIDO · APOLLODORO…",
  "DECODIFICA PAPIRI DI OXYRHYNCHUS…",
  "TRADUZIONE DAL GRECO ANTICO…",
  "VERIFICA INCROCIATA DELLE VARIANTI REGIONALI…",
  "CONSULTO STUDI FILOLOGICI · EN · DE · FR…",
  "SINTESI EPICA E NER IN CORSO…",
];

function OracleLoader({ label }: { label: string }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setLine((v) => (v + 1) % FLAVOR.length), 1500);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#0d0c06]/90 p-6 text-center">
      <Hourglass className="hourglass-spin text-[#ffe58a]" size={34} />
      <div className="font-silk text-[11px] tracking-[0.18em] text-[#ffe58a] uppercase">
        {label}
      </div>
      <div className="h-6 font-vt text-xl text-[#9fe8ff]">
        <span className="flicker" key={line}>{FLAVOR[line]}</span>
      </div>
      <div className="w-full max-w-xs">
        <MarqueeLoader />
      </div>
      <div className="font-vt text-lg text-[#6f6a55]">L&apos;Oracolo compone il passo…</div>
    </div>
  );
}

export default function TextWindow({
  page,
  idx,
  total,
  known,
  selected,
  loading,
  loadingLabel,
  onEntity,
  onBack,
  onFwd,
}: {
  page: MythPage | null;
  idx: number;
  total: number;
  known: Map<string, EntityKind>;
  selected: string[];
  loading: boolean;
  loadingLabel: string;
  onEntity: (name: string) => void;
  onBack: () => void;
  onFwd: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [page?.id]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* toolbar del passo */}
      <div className="raised mb-1 flex flex-wrap items-center gap-2 bg-[#c9c9c9] px-2 py-1">
        <button
          className="btn90 !px-2 !py-1"
          onClick={onBack}
          disabled={idx <= 0 || loading}
          data-tip="Indietro nella catena narrativa"
          data-tip-pos="bottom-start"
        >
          <ChevronLeft size={13} /> Indietro
        </button>
        <button
          className="btn90 !px-2 !py-1"
          onClick={onFwd}
          disabled={idx >= total - 1 || loading}
          data-tip="Avanti nella catena narrativa"
          data-tip-pos="bottom-start"
        >
          Avanti <ChevronRight size={13} />
        </button>
        <span className="sunk ml-1 inline-flex items-center gap-2 bg-white px-2 py-0.5 font-vt text-lg">
          <FileText size={13} />
          PASSO {total === 0 ? "—" : String(idx + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
        </span>
        {page && (
          <span className="sunk hidden items-center gap-2 bg-[#1c1c1c] px-2 py-0.5 font-silk text-[9px] tracking-[0.14em] text-[#ffe58a] uppercase md:inline-flex">
            <ScrollText size={11} />
            {ACTION_LABEL[page.action]}
            {page.subject ? ` · ${page.subject}` : ""}
            {page.subject2 ? ` × ${page.subject2}` : ""}
          </span>
        )}
      </div>

      {/* il passo mitologico */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="sunk pergam scroll90 absolute inset-0 overflow-y-auto p-4 md:p-5">
          {page ? (
            <>
              <h2 className="mb-1 font-silk text-[13px] leading-snug font-bold tracking-wide text-[#4a2c06]">
                {page.title}
              </h2>
              <div className="greek-band mb-3" aria-hidden />
              <RichMyth raw={page.raw} known={known} selected={selected} onEntity={onEntity} />
              <div className="mt-5 flex items-center justify-between gap-2 border-t border-dashed border-[#8a6d3b] pt-2 text-[17px] text-[#6b5730]">
                <span>FONTE: {page.engine}</span>
                <span>{new Date(page.at).toLocaleTimeString("it-IT")}</span>
              </div>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-center font-vt text-xl text-[#6b5730]">
              LA PERGAMENA È VUOTA.
              <br />
              L&apos;ORACOLO ATTENDE IL PRIMO COMANDO.
            </div>
          )}
        </div>
        {loading && <OracleLoader label={loadingLabel} />}
      </div>

      <GreekBand />
    </div>
  );
}
