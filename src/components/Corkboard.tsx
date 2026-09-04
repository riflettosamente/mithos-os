"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronUp,
  Crown, Gem, Landmark, Maximize2, MapPin, Move, Shuffle, Skull, Sparkles, Swords, User,
} from "lucide-react";
import type { BoardEntity, EntityKind, RelationEdge } from "@/lib/types";
import { KIND_META } from "@/lib/types";
import { sfx } from "@/lib/sound";

const KIND_ICON: Record<EntityKind, typeof Crown> = {
  "divinità": Crown,
  titano: Landmark,
  primordiale: Sparkles,
  eroe: Swords,
  creatura: Skull,
  luogo: MapPin,
  oggetto: Gem,
  mortale: User,
};

const PAN_STEP = 240;

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* Unica fonte di verità per la rotazione della targhetta e del suo pin. */
function noteRotation(name: string): number {
  return ((hashOf(name) % 7) - 3) * 0.9;
}

interface DrawnEdge {
  a: BoardEntity;
  b: BoardEntity;
  labels: string[];
  key: string;
}

export default function Corkboard({
  entities,
  relations,
  selected,
  loading,
  onMove,
  onTidy,
  onNodeQuery,
}: {
  entities: BoardEntity[];
  relations: RelationEdge[];
  selected: string[];
  loading: boolean;
  onMove: (name: string, x: number, y: number) => void;
  onTidy: () => void;
  onNodeQuery: (name: string) => void;
}) {
  const vpRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 800, h: 500 });
  const [canPan, setCanPan] = useState({ x: false, y: false });
  const [atTop, setAtTop] = useState(true);
  const atTopRef = useRef(true);
  const [drag, setDrag] = useState<string | null>(null);
  const [hotEdge, setHotEdge] = useState<string | null>(null);
  const [freshNames, setFreshNames] = useState<Set<string>>(new Set());
  const seenNamesRef = useRef(new Set<string>());
  const freshTimerRef = useRef<number | null>(null);
  const dragInfo = useRef<{ name: string; dx: number; dy: number } | null>(null);

  /*
   * Dimensione LOGICA, dipendente solo dal numero di cartellini.
   * Non dipende più dal clientWidth del viewport: la comparsa delle
   * scrollbar non può quindi innescare un ciclo di resize.
   */
  const { baseW, baseH } = useMemo(() => {
    const count = Math.max(entities.length, 1);
    const cols = Math.max(3, Math.ceil(Math.sqrt(count * 1.6)));
    const rows = Math.max(1, Math.ceil(count / cols));
    return {
      baseW: Math.max(760, cols * 200),
      baseH: Math.max(480, rows * 140),
    };
  }, [entities.length]);

  /*
   * Misura la tela renderizzata (che può essere più grande del minimo per
   * riempire MAPPA.EXE). Aggiorna React solo quando i valori cambiano:
   * nessun render per ogni frame di scroll e nessun ResizeObserver loop.
   */
  useEffect(() => {
    const vpEl = vpRef.current;
    const canvasEl = canvasRef.current;
    if (!vpEl || !canvasEl) return;
    let raf = 0;
    const measure = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const w = Math.round(canvasEl.offsetWidth);
        const h = Math.round(canvasEl.offsetHeight);
        setCanvasSize((old) => (old.w === w && old.h === h ? old : { w, h }));
        const nextPan = { x: w > vpEl.clientWidth + 2, y: h > vpEl.clientHeight + 2 };
        setCanPan((old) => old.x === nextPan.x && old.y === nextPan.y ? old : nextPan);
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(vpEl);
    ro.observe(canvasEl);
    measure();
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [baseW, baseH]);

  const cw = canvasSize.w;
  const ch = canvasSize.h;
  const canX = canPan.x;
  const canY = canPan.y;

  /* durante lo scroll si aggiorna solo quando cambia lo stato top/non-top */
  const onScroll = useCallback(() => {
    const el = vpRef.current;
    if (!el) return;
    const next = el.scrollTop <= 2;
    if (next !== atTopRef.current) {
      atTopRef.current = next;
      setAtTop(next);
    }
  }, []);

  const pan = useCallback((dx: number, dy: number) => {
    sfx("click");
    vpRef.current?.scrollBy({ left: dx, top: dy, behavior: "smooth" });
  }, []);

  const center = useCallback(() => {
    sfx("flip");
    const el = vpRef.current;
    if (!el) return;
    el.scrollTo({
      left: Math.max(0, (cw - el.clientWidth) / 2),
      top: Math.max(0, (ch - el.clientHeight) / 2),
      behavior: "smooth",
    });
  }, [cw, ch]);

  const entByLower = useMemo(() => {
    const m = new Map<string, BoardEntity>();
    for (const e of entities) m.set(e.name.toLowerCase(), e);
    return m;
  }, [entities]);

  const edges: DrawnEdge[] = useMemo(() => {
    const acc = new Map<string, DrawnEdge>();
    for (const r of relations) {
      const ea = entByLower.get(r.from.toLowerCase());
      const eb = entByLower.get(r.to.toLowerCase());
      if (!ea || !eb) continue;
      const key = [ea.name.toLowerCase(), eb.name.toLowerCase()].sort().join("§");
      const cur = acc.get(key);
      if (cur) {
        if (!cur.labels.includes(r.label)) cur.labels.push(r.label);
      } else {
        acc.set(key, { a: ea, b: eb, labels: [r.label], key });
      }
    }
    return [...acc.values()];
  }, [relations, entByLower]);

  const selSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);

  /* normalizza anche le vecchie posizioni salvate vicino ai bordi */
  const anchorPct = useCallback(
    (e: BoardEntity) => {
      const minX = (72 / cw) * 100;
      const maxX = 100 - minX;
      const minY = (14 / ch) * 100;
      const maxY = 100 - (90 / ch) * 100;
      return {
        x: Math.min(maxX, Math.max(minX, e.x)),
        y: Math.min(maxY, Math.max(minY, e.y)),
      };
    },
    [cw, ch]
  );

  /*
   * Punto d'aggancio esatto = origine CSS della targhetta.
   * left/top rappresentano direttamente il centro della puntina, mentre
   * il foglietto ruota intorno a quel punto (transform-origin: 50% 0).
   * Il nodo SVG e la puntina condividono quindi le stesse coordinate per
   * costruzione, senza approssimazioni dipendenti da altezza o rotazione.
   */
  const toPin = useCallback(
    (e: BoardEntity) => {
      const p = anchorPct(e);
      return { x: (p.x / 100) * cw, y: (p.y / 100) * ch };
    },
    [anchorPct, cw, ch]
  );

  /*
   * Sincronizzazione visiva ORACOLO → MAPPA:
   * individua solo i nomi realmente nuovi, li evidenzia e prepara il
   * viewport sull'ultima scoperta. Quando l'utente gira la lavagna, il
   * cartellino appena creato è già al centro della finestra MAPPA.EXE.
   */
  useEffect(() => {
    const next = new Set(entities.map((e) => e.name.toLocaleLowerCase("it")));
    const added = entities.filter((e) => !seenNamesRef.current.has(e.name.toLocaleLowerCase("it")));
    seenNamesRef.current = next;
    if (added.length === 0) return;

    setFreshNames(new Set(added.map((e) => e.name.toLocaleLowerCase("it"))));
    const newest = added[added.length - 1];
    const pin = toPin(newest);
    window.requestAnimationFrame(() => {
      const el = vpRef.current;
      if (!el) return;
      el.scrollTo({
        left: Math.max(0, pin.x - el.clientWidth / 2),
        top: Math.max(0, pin.y - el.clientHeight / 2),
        behavior: "auto",
      });
    });
    if (freshTimerRef.current !== null) window.clearTimeout(freshTimerRef.current);
    freshTimerRef.current = window.setTimeout(() => {
      setFreshNames(new Set());
      freshTimerRef.current = null;
    }, 30000);
  }, [entities, toPin]);

  useEffect(() => () => {
    if (freshTimerRef.current !== null) window.clearTimeout(freshTimerRef.current);
  }, []);

  const startDrag = (ev: React.PointerEvent, e: BoardEntity) => {
    if (ev.button !== 0) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const anchor = anchorPct(e);
    dragInfo.current = {
      name: e.name,
      dx: (anchor.x / 100) * rect.width - (ev.clientX - rect.left),
      dy: (anchor.y / 100) * rect.height - (ev.clientY - rect.top),
    };
    setDrag(e.name);
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    sfx("drag");
    ev.preventDefault();
  };

  const moveDrag = (ev: React.PointerEvent) => {
    const info = dragInfo.current;
    if (!info) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const padX = (72 / rect.width) * 100;
    const padTop = (14 / rect.height) * 100;
    const padBottom = (90 / rect.height) * 100;
    const x = ((ev.clientX - rect.left + info.dx) / rect.width) * 100;
    const y = ((ev.clientY - rect.top + info.dy) / rect.height) * 100;
    onMove(
      info.name,
      Math.min(100 - padX, Math.max(padX, x)),
      Math.min(100 - padBottom, Math.max(padTop, y))
    );
  };

  const endDrag = (ev: React.PointerEvent) => {
    if (!dragInfo.current) return;
    (ev.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
    dragInfo.current = null;
    setDrag(null);
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/* toolbar della bacheca */}
      <div className="raised mb-1 flex flex-wrap items-center gap-2 bg-[#c9c9c9] px-2 py-1">
        <span className="sunk inline-flex items-center gap-2 bg-[#3a2c12] px-2 py-0.5 font-silk text-[9px] tracking-[0.14em] text-[#ffd7a0] uppercase">
          <Move size={11} /> Bacheca investigativa
        </span>
        <span className="sunk inline-flex items-center bg-white px-2 py-0.5 font-vt text-lg">
          NODI {entities.length} · FILI {edges.length}
        </span>
        {freshNames.size > 0 && (
          <span className="new-counter sunk inline-flex items-center gap-1 bg-[#fff4a8] px-2 py-0.5 font-silk text-[9px] tracking-wider uppercase">
            <Sparkles size={11} /> +{freshNames.size} nuove schede
          </span>
        )}
        {(canX || canY) && (
          <span className="sunk hidden items-center bg-white px-2 py-0.5 font-vt text-lg sm:inline-flex">
            AREA {cw}×{ch}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {(canX || canY) && (
            <button className="btn90 !px-2 !py-1" onClick={center} data-tip="Centra la visuale sulla lavagna" data-tip-pos="bottom">
              <Maximize2 size={13} /> Centra
            </button>
          )}
          <button className="btn90 !px-2 !py-1" onClick={() => { sfx("flip"); onTidy(); }} data-tip="Riordina i nodi su una griglia leggibile" data-tip-pos="bottom-end">
            <Shuffle size={13} /> Auto-disponi
          </button>
        </div>
      </div>

      {/* viewport con scorrimento interno confinato */}
      <div className="sunk relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div ref={vpRef} className="board-viewport scroll90" onScroll={onScroll}>
          <div
            ref={canvasRef}
            className="corkboard relative"
            style={{
              width: `max(100%, ${baseW}px)`,
              height: `max(100%, ${baseH}px)`,
            }}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
          >
            <div className="cork-grid" aria-hidden />

            {/* fili SVG */}
            <svg
              className="yarn-layer"
              width="100%"
              height="100%"
              viewBox={`0 0 ${cw} ${ch}`}
              preserveAspectRatio="none"
            >
              {edges.map((ed) => {
                const pa = toPin(ed.a);
                const pb = toPin(ed.b);
                const hot = hotEdge === ed.key;
                const mx = (pa.x + pb.x) / 2;
                const my = (pa.y + pb.y) / 2;
                return (
                  <g key={ed.key}>
                    <line
                      className={`yarn ${hot ? "hot" : ""}`}
                      vectorEffect="non-scaling-stroke"
                      x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                      onMouseEnter={() => setHotEdge(ed.key)}
                      onMouseLeave={() => setHotEdge(null)}
                    >
                      <title>{`${ed.a.name} ⟷ ${ed.b.name}: ${ed.labels.join(" · ")}`}</title>
                    </line>
                    <circle className="knot" cx={pa.x} cy={pa.y} r={hot ? 4 : 2.6} />
                    <circle className="knot" cx={pb.x} cy={pb.y} r={hot ? 4 : 2.6} />
                    {hot && (
                      <text className="yarn-label" x={mx} y={my - 6} textAnchor="middle">
                        {ed.labels.join(" · ").slice(0, 64)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {/* nodi */}
            {entities.map((e) => {
              const Icon = KIND_ICON[e.kind] ?? User;
              const rot = noteRotation(e.name);
              const meta = KIND_META[e.kind];
              const isSel = selSet.has(e.name.toLowerCase());
              const isFresh = freshNames.has(e.name.toLocaleLowerCase("it"));
              const anchor = anchorPct(e);
              return (
                <div
                  key={e.name}
                  data-name={e.name}
                  className={`note ${drag === e.name ? "dragging" : ""} ${isFresh ? "note-fresh" : ""}`}
                  style={{
                    left: `${anchor.x}%`,
                    top: `${anchor.y}%`,
                    ["--rot" as string]: `${rot}deg`,
                    outline: isSel ? "2px dashed #10106a" : "none",
                    outlineOffset: 3,
                    zIndex: drag === e.name ? 40 : 10 + (hashOf(e.name) % 9),
                  }}
                  onPointerDown={(ev) => startDrag(ev, e)}
                  onDoubleClick={(ev) => { ev.stopPropagation(); onNodeQuery(e.name); }}
                  data-tip={`${meta.label} · doppio clic: Racconta chi è`}
                >
                  <span className="pin" aria-hidden />
                  <span className="note-stripe" style={{ background: meta.color }} aria-hidden />
                  {isFresh && <span className="fresh-stamp" aria-hidden>NUOVO!</span>}
                  <div className="flex items-start gap-1.5">
                    <Icon size={12} style={{ color: meta.color, flex: "none", marginTop: 1 }} />
                    <span className="note-name">{e.name}</span>
                  </div>
                  <div className="note-kind">{meta.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* targhetta del dossier — ancorata al viewport */}
        <div className="board-badge left-2 top-2 px-2 py-1 font-silk text-[9px] tracking-[0.2em] uppercase">
          F.R. 110 a.C. — DOSSIER MITO
        </div>

        {/* cursore di scorrimento verso l'alto */}
        {canY && (
          <button className="pan-btn pan-u" onClick={() => pan(0, -PAN_STEP)} disabled={atTop} data-tip="Scorri in alto" data-tip-pos="bottom">
            <ChevronUp size={16} strokeWidth={3} />
          </button>
        )}

        {/* leggenda — ancorata al viewport */}
        <div className="board-badge bottom-5 right-5 hidden gap-3 px-2 py-1 md:flex">
          {(Object.keys(KIND_META) as EntityKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1 font-vt text-[15px] leading-none text-[#e8d9b8]">
              <span className="inline-block h-2.5 w-2.5 border border-black/50" style={{ background: KIND_META[k].color }} />
              {KIND_META[k].label}
            </span>
          ))}
        </div>

        {entities.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="note !static !transform-none px-6 py-5 text-center font-vt text-xl text-[#5d5236]" style={{ width: 280 }}>
              LA BACHECA È VUOTA:
              <br />
              OGNI NOME SCOPERTO VERRÀ
              <br />
              APPUNTATO QUI CON UN FILO.
            </div>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#201404]/70">
            <div className="note !static !transform-none px-6 py-4 text-center font-vt text-xl text-[#5d5236]" style={{ width: 300 }}>
              NUOVI INDIZI SUL CASO…
              <br />
              <span className="font-silk text-[10px] tracking-[0.2em]">AGGIORNO LA BACHECA</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { KIND_ICON };
