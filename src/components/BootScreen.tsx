"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3, Play, RotateCcw, Sparkles } from "lucide-react";
import { sfx } from "@/lib/sound";

const BOOT_LINES = [
  "MYTHOS BIOS v2.11 ............ OK",
  "MEMORIA EPICA 640K ........... OK",
  "CARTUCCIA: MITOLOGIA GRECA ... INSERITA",
  "COLLEGAMENTO FONTI PRIMARIE .. OXYRHYNCHUS · DUBLINO · HEIDELBERG",
  "RICERCA MULTILINGUA .......... GR · EN · DE · FR · IT",
  "SINCRONIZZAZIONE ORACOLO ..... PRONTA",
];

export default function BootScreen({
  hasSave,
  saveChecked,
  onNew,
  onResume,
}: {
  hasSave: boolean;
  saveChecked: boolean;
  onNew: () => void;
  onResume: () => void;
}) {
  const [shown, setShown] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setShown(i);
      sfx("click");
      if (i >= BOOT_LINES.length) window.clearInterval(t);
    }, 340);
    return () => window.clearInterval(t);
  }, []);

  const ready = shown >= BOOT_LINES.length && saveChecked;

  return (
    <div className="boot fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="scan-hard" aria-hidden />
      <div className="w-full max-w-3xl">
        <div className="rise-in mb-8 text-center">
          <div className="boot-title flicker text-[clamp(2.4rem,9vw,5.4rem)] leading-none">
            ΜΥΘΟΣ·OS
          </div>
          <div className="mt-3 flex items-center justify-center gap-2 text-[#ffe58a]">
            <Columns3 size={16} />
            <span className="font-silk text-[10px] tracking-[0.3em] uppercase">
              Grande atlante interattivo della mitologia greca
            </span>
            <Columns3 size={16} />
          </div>
        </div>

        <div className="sunk mx-auto min-h-44 max-w-xl bg-[#070a07] p-4">
          {BOOT_LINES.slice(0, shown).map((l) => (
            <div key={l} className="boot-line">{l}</div>
          ))}
          <span className="boot-line cursor-blink">█</span>
        </div>

        {ready && (
          <div className="rise-in mt-8 flex flex-wrap items-center justify-center gap-4">
            {hasSave && (
              <button
                className="btn90 btn-gold"
                onClick={() => { sfx("boot"); onResume(); }}
              >
                <Play size={13} /> Riprendi la spedizione
              </button>
            )}
            <button
              className={`btn90 ${hasSave ? "" : "btn-gold"}`}
              onClick={() => { sfx("boot"); onNew(); }}
            >
              {hasSave ? <RotateCcw size={13} /> : <Sparkles size={13} />}
              {hasSave ? "Nuova spedizione" : "Avvia il sistema"}
            </button>
          </div>
        )}

        <div className="mt-10 text-center font-silk text-[9px] tracking-[0.25em] text-[#2ea84f] uppercase">
          (C) 1994 MYTHOS SYSTEMS — TUTTI I MITI RISERVATI
        </div>
      </div>
    </div>
  );
}
