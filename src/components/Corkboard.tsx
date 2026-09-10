"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronUp,
  Crosshair, Crown, Gem, Landmark, Maximize2, MapPin, Minus, Move, Plus, Shuffle, Skull, Sparkles, Swords, User,
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
const MIN_K = 0.22;
const MAX_K = 2.2;
const COMMIT_DEBOUNCE = 150; // ms: l'unico costo React a fine gestura

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* Unica fonte di verità per la rotazione della targhetta e del suo pin. */
function noteRotation(name: string): number {
  return ((hashOf(name) % 7) - 3) * 0.9;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

interface DrawnEdge {
  a: BoardEntity;
  b: BoardEntity;
  labels: string[];
  key: string;
}

interface View {
  k: number;
  tx: number;
  ty: number;
}

/*
 * Bacheca a viewport trasformato: zoom (rotellina, pinch ctrl+wheel, pulsanti,
 * tastiera) e pan (trascinamento dello sfondo) scrivono SOLO il transform del
 * mondo — nessun re-render, nessun ricalcolo dei fili a ogni frame.
 * Il drag di una scheda è anch'esso imperativo: la targhetta si muove con la
 * proprietà CSS `translate` (componibile col rotate di .note) e solo i fili
 * INCIDENTI vengono aggiornati via DOM; a fine drag onMove() impegna la nuova
 * posizione nello stato, e il ricalcolo completo dei path avviene UNA volta.
 */
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
  const stageRef = useRef<HTMLDivElement>(null);
  const worldElRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ vw: 900, vh: 520 });
  const [drag, setDrag] = useState<string | null>(null);
  const [hotEdge, setHotEdge] = useState<string | null>(null);
  const [freshNames, setFreshNames] = useState<Set<string>>(new Set());
  const seenNamesRef = useRef(new Set<string>());
  const freshTimerRef = useRef<number | null>(null);

  /* vista impegnata (solo per UI: %, pulsanti) e vista viva nei ref */
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const viewRef = useRef<View>({ k: 1, tx: 0, ty: 0 });
  /* Il "contenuto" e la vera tela: cresce con le schede, anche oltre i bordi
   * del mondo base. Il clamp del pan e l'adatta usano questi estremi, cosi'
   * una scheda trascinata fuori non diventa irraggiungibile. */
  const metricsRef = useRef({
    vw: 900,
    vh: 520,
    box: { minX: 0, minY: 0, maxX: 900, maxY: 520 },
  });
  const interactingRef = useRef(false);
  const fittedRef = useRef(false);
  const animRafRef = useRef(0);
  const commitTimerRef = useRef<number | null>(null);

  const dragInfo = useRef<{
    name: string; lower: string;
    startClientX: number; startClientY: number;
    startPinX: number; startPinY: number;
    curX: number; curY: number;
    el: HTMLElement;
  } | null>(null);
  const panInfo = useRef<{ x0: number; y0: number; tx0: number; ty0: number } | null>(null);

  /* registri DOM per l'aggiornamento imperativo dei fili */
  const edgeReg = useRef(new Map<string, SVGGElement>());

  /*
   * Dimensione LOGICA del mondo, dipendente solo dal numero di cartellini.
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

  const world = useMemo(
    () => ({ w: Math.max(dims.vw, baseW), h: Math.max(dims.vh, baseH) }),
    [dims, baseW, baseH]
  );

  /*
   * Estremi reali del CONTENUTO in pixel logici: parte dalla tela base e si
   * allarga quanto serve per contenere ogni scheda, anche trascinata oltre i
   * bordi. E' la sola misura usata da clamp del pan e da "Adatta": la lavagna
   * si comporta come una tela infinita.
   */
  const contentBox = useMemo(() => {
    const box = { minX: 0, minY: 0, maxX: world.w, maxY: world.h };
    for (const e of entities) {
      const x = (e.x / 100) * world.w;
      const y = (e.y / 100) * world.h;
      if (x - 180 < box.minX) box.minX = x - 180;
      if (x + 180 > box.maxX) box.maxX = x + 180;
      if (y - 60 < box.minY) box.minY = y - 60;
      if (y + 140 > box.maxY) box.maxY = y + 140;
    }
    return box;
  }, [entities, world]);

  /* misura il palco (mai la tela: il transform non cambia il layout) */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(() => {
        const w = Math.round(el.clientWidth);
        const h = Math.round(el.clientHeight);
        setDims((old) => (old.vw === w && old.vh === h ? old : { vw: w, vh: h }));
      });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => {
      ro.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, []);

  const applyView = useCallback(() => {
    const v = viewRef.current;
    const el = worldElRef.current;
    if (el) el.style.transform = `translate3d(${v.tx.toFixed(2)}px, ${v.ty.toFixed(2)}px, 0) scale(${v.k.toFixed(4)})`;
  }, []);

  const clampV = useCallback((v: View): View => {
    const m = metricsRef.current;
    const b = m.box;
    const l = b.minX * v.k;
    const r = b.maxX * v.k;
    const t = b.minY * v.k;
    const bo = b.maxY * v.k;
    const cw = r - l;
    const ch = bo - t;
    const margin = 160;
    let { tx, ty } = v;
    tx = cw <= m.vw ? (m.vw - cw) / 2 - l : clamp(tx, m.vw - r - margin, -l + margin);
    ty = ch <= m.vh ? (m.vh - ch) / 2 - t : clamp(ty, m.vh - bo - margin, -t + margin);
    return { k: v.k, tx, ty };
  }, []);

  const syncView = useCallback(() => {
    const c = clampV(viewRef.current);
    viewRef.current = c;
    applyView();
    setView((old) =>
      Math.abs(old.k - c.k) < 0.001 && Math.abs(old.tx - c.tx) < 0.5 && Math.abs(old.ty - c.ty) < 0.5 ? old : c
    );
  }, [applyView, clampV]);

  const scheduleCommit = useCallback(() => {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      syncView();
    }, COMMIT_DEBOUNCE);
  }, [syncView]);

  const tweenTo = useCallback((to: View, dur = 260) => {
    window.cancelAnimationFrame(animRafRef.current);
    const from = { ...viewRef.current };
    const target = clampV(to);
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3); // ease-out cubica
      viewRef.current = {
        k: from.k + (target.k - from.k) * e,
        tx: from.tx + (target.tx - from.tx) * e,
        ty: from.ty + (target.ty - from.ty) * e,
      };
      applyView();
      if (p < 1) animRafRef.current = window.requestAnimationFrame(step);
      else syncView();
    };
    animRafRef.current = window.requestAnimationFrame(step);
  }, [applyView, clampV, syncView]);

  const computeFit = useCallback((): View => {
    const m = metricsRef.current;
    const b = m.box;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const k = clamp(Math.min(m.vw / w, m.vh / h) * 0.97, MIN_K, 1);
    return { k, tx: (m.vw - w * k) / 2 - b.minX * k, ty: (m.vh - h * k) / 2 - b.minY * k };
  }, []);

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const v = viewRef.current;
    const k = clamp(v.k * factor, MIN_K, MAX_K);
    const s = k / v.k;
    viewRef.current = clampV({ k, tx: mx - (mx - v.tx) * s, ty: my - (my - v.ty) * s });
    applyView();
    scheduleCommit();
  }, [applyView, clampV, scheduleCommit]);

  const zoomBy = useCallback((factor: number) => {
    const el = stageRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
  }, [zoomAt]);

  const zoomTo100 = useCallback(() => {
    const m = metricsRef.current;
    const b = m.box;
    tweenTo({
      k: 1,
      tx: m.vw / 2 - ((b.minX + b.maxX) / 2),
      ty: m.vh / 2 - ((b.minY + b.maxY) / 2),
    });
  }, [tweenTo]);

  const fitView = useCallback((animate = true) => {
    const t = computeFit();
    if (animate) tweenTo(t);
    else { viewRef.current = t; applyView(); syncView(); }
  }, [applyView, computeFit, syncView, tweenTo]);

  const center = useCallback(() => {
    const m = metricsRef.current;
    const b = m.box;
    const k = viewRef.current.k;
    tweenTo({
      k,
      tx: m.vw / 2 - ((b.minX + b.maxX) / 2) * k,
      ty: m.vh / 2 - ((b.minY + b.maxY) / 2) * k,
    });
  }, [tweenTo]);

  /* metriche (palco + estremi del contenuto) nei ref per i gestori stabili */
  useEffect(() => {
    metricsRef.current = { vw: dims.vw, vh: dims.vh, box: contentBox };
    if (!fittedRef.current && entities.length > 0 && dims.vw > 0) {
      fittedRef.current = true;
      viewRef.current = clampV(computeFit());
      applyView();
      syncView();
      return;
    }
    if (!interactingRef.current) syncView();
  }, [dims, contentBox, entities.length, applyView, clampV, computeFit, syncView]);

  /* rotellina e pinch: listener nativo passivo=false per poter fare
   * preventDefault (zoom ancorato al cursore; shift+rotellina = pan orizz.) */
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const unit = ev.deltaMode === 1 ? 16 : 1;
      if (ev.shiftKey && !ev.ctrlKey && !ev.metaKey) {
        viewRef.current = clampV({ ...viewRef.current, tx: viewRef.current.tx - ev.deltaY * unit });
        applyView();
        scheduleCommit();
        return;
      }
      const raw = Math.exp(-ev.deltaY * unit * 0.0022);
      const factor = raw > 1 ? Math.min(1.22, raw) : Math.max(0.82, raw);
      zoomAt(ev.clientX, ev.clientY, factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyView, clampV, scheduleCommit, zoomAt]);

  /* ------- pan sullo sfondo (trascinamento) ------- */
  const onStagePointerDown = (ev: React.PointerEvent) => {
    if (dragInfo.current) return; // già trascinamento scheda
    if (ev.button !== 0 && ev.button !== 1) return;
    if ((ev.target as Element).closest(".note")) return;
    if (ev.button === 1) ev.preventDefault();
    interactingRef.current = true;
    const v = viewRef.current;
    panInfo.current = { x0: ev.clientX, y0: ev.clientY, tx0: v.tx, ty0: v.ty };
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ev.currentTarget.classList.add("panning");
  };

  const onStagePointerMove = (ev: React.PointerEvent) => {
    const p = panInfo.current;
    if (!p) return;
    viewRef.current = clampV({ ...viewRef.current, tx: p.tx0 + (ev.clientX - p.x0), ty: p.ty0 + (ev.clientY - p.y0) });
    applyView();
  };

  const onStagePointerUp = (ev: React.PointerEvent) => {
    if (!panInfo.current) return;
    panInfo.current = null;
    interactingRef.current = false;
    ev.currentTarget.classList.remove("panning");
    ev.currentTarget.releasePointerCapture?.(ev.pointerId);
    syncView();
  };

  /* ------- tastiera: accessibilità e controllo fino ------- */
  const onStageKeyDown = (ev: React.KeyboardEvent) => {
    const v = viewRef.current;
    const step = PAN_STEP;
    switch (ev.key) {
      case "ArrowUp": ev.preventDefault(); tweenTo({ ...v, ty: v.ty + step }, 140); break;
      case "ArrowDown": ev.preventDefault(); tweenTo({ ...v, ty: v.ty - step }, 140); break;
      case "ArrowLeft": ev.preventDefault(); tweenTo({ ...v, tx: v.tx + step }, 140); break;
      case "ArrowRight": ev.preventDefault(); tweenTo({ ...v, tx: v.tx - step }, 140); break;
      case "+": case "=": ev.preventDefault(); zoomBy(1.25); break;
      case "-": case "_": ev.preventDefault(); zoomBy(0.8); break;
      case "0": ev.preventDefault(); fitView(); break;
      case "1": ev.preventDefault(); zoomTo100(); break;
    }
  };

  /* ------- geometria dei nodi (coordinate LOGICHE, non touchate dallo zoom) ------- */
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

  /* indice dei fili per nodo: durante il drag aggiorno SOLO questi (culling) */
  const incident = useMemo(() => {
    const m = new Map<string, Array<{ key: string; endpoint: "a" | "b" }>>();
    for (const ed of edges) {
      for (const side of ["a", "b"] as const) {
        const lower = ed[side].name.toLowerCase();
        const arr = m.get(lower) ?? [];
        arr.push({ key: ed.key, endpoint: side });
        m.set(lower, arr);
      }
    }
    return m;
  }, [edges]);

  const selSet = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected]);

  /*
   * Nessun limite: la posizione salvata e' usata tal quale, anche oltre il
   * 100% o in negativo. Gli estremi del contenuto (contentBox) crescono con
   * le schede, quindi pan e "Adatta" le raggiungono sempre.
   */
  const anchorPct = useCallback((e: BoardEntity) => ({ x: e.x, y: e.y }), []);

  /*
   * Punto d'aggancio esatto = origine CSS della targhetta.
   * left/top rappresentano direttamente il centro della puntina, mentre
   * il foglietto ruota intorno a quel punto. Il nodo SVG e la puntina
   * condividono le stesse coordinate per costruzione.
   */
  const toPin = useCallback(
    (e: BoardEntity) => {
      const p = anchorPct(e);
      return { x: (p.x / 100) * world.w, y: (p.y / 100) * world.h };
    },
    [anchorPct, world]
  );

  /*
   * Sincronizzazione visiva ORACOLO → MAPPA: i nomi nuovi vengono centrati
   * nel viewport a prescindere dallo zoom in corso.
   */
  useEffect(() => {
    const next = new Set(entities.map((e) => e.name.toLocaleLowerCase("it")));
    const added = entities.filter((e) => !seenNamesRef.current.has(e.name.toLocaleLowerCase("it")));
    seenNamesRef.current = next;
    if (added.length === 0) return;

    setFreshNames(new Set(added.map((e) => e.name.toLocaleLowerCase("it"))));
    const newest = added[added.length - 1];
    const pin = toPin(newest);
    const m = metricsRef.current;
    const k = viewRef.current.k;
    viewRef.current = clampV({ k, tx: m.vw / 2 - pin.x * k, ty: m.vh / 2 - pin.y * k });
    applyView();
    syncView();
    if (freshTimerRef.current !== null) window.clearTimeout(freshTimerRef.current);
    freshTimerRef.current = window.setTimeout(() => {
      setFreshNames(new Set());
      freshTimerRef.current = null;
    }, 30000);
  }, [entities, toPin, applyView, clampV, syncView]);

  useEffect(() => () => {
    if (freshTimerRef.current !== null) window.clearTimeout(freshTimerRef.current);
    window.cancelAnimationFrame(animRafRef.current);
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current);
  }, []);

  /* ------- drag scheda: imperativo, con commit unico a fine gesto ------- */
  const startDrag = (ev: React.PointerEvent, e: BoardEntity) => {
    if (ev.button !== 0) return;
    const pin = toPin(e);
    interactingRef.current = true;
    dragInfo.current = {
      name: e.name,
      lower: e.name.toLowerCase(),
      startClientX: ev.clientX,
      startClientY: ev.clientY,
      startPinX: pin.x,
      startPinY: pin.y,
      curX: pin.x,
      curY: pin.y,
      el: ev.currentTarget as HTMLElement,
    };
    setDrag(e.name);
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    sfx("drag");
    ev.preventDefault();
    ev.stopPropagation();
  };

  const moveDrag = (ev: React.PointerEvent) => {
    const info = dragInfo.current;
    if (!info) return;
    const k = viewRef.current.k;
    /* delta schermo → delta mondo: la scheda segue il puntatore senza
       alcun muro, anche oltre i bordi della tela base */
    const x = info.startPinX + (ev.clientX - info.startClientX) / k;
    const y = info.startPinY + (ev.clientY - info.startClientY) / k;
    info.curX = x;
    info.curY = y;

    /* la vista insegue la scheda quando esce dal margine: la tela si
       comporta come infinita e la scheda non resta mai fuori schermo */
    const m = metricsRef.current;
    const sx = x * k + viewRef.current.tx;
    const sy = y * k + viewRef.current.ty;
    const EDGE = 110;
    let ntx = viewRef.current.tx;
    let nty = viewRef.current.ty;
    if (sx > m.vw - EDGE) ntx = m.vw - EDGE - x * k;
    else if (sx < EDGE) ntx = EDGE - x * k;
    if (sy > m.vh - EDGE) nty = m.vh - EDGE - y * k;
    else if (sy < EDGE) nty = EDGE - y * k;
    if (ntx !== viewRef.current.tx || nty !== viewRef.current.ty) {
      viewRef.current = { k, tx: ntx, ty: nty };
      applyView();
    }

    /* la targhetta si sposta con la proprietà `translate` (niente reflow) */
    info.el.style.translate = `${(x - info.startPinX).toFixed(1)}px ${(y - info.startPinY).toFixed(1)}px`;

    /* solo i fili incidenti: endpoint e cappio seguono il dito, frame per frame */
    const links = incident.get(info.lower);
    if (links) {
      for (const { key, endpoint } of links) {
        const g = edgeReg.current.get(key);
        if (!g) continue;
        const line = g.querySelector("line");
        if (!line) continue;
        line.setAttribute(endpoint === "a" ? "x1" : "x2", String(x));
        line.setAttribute(endpoint === "a" ? "y1" : "y2", String(y));
        const knots = g.querySelectorAll("circle");
        const knot = knots[endpoint === "a" ? 0 : 1];
        if (knot) {
          knot.setAttribute("cx", String(x));
          knot.setAttribute("cy", String(y));
        }
        const text = g.querySelector("text");
        if (text && knots.length >= 2) {
          const otherX = Number(endpoint === "a" ? knots[1].getAttribute("cx") : knots[0].getAttribute("cx"));
          const otherY = Number(endpoint === "a" ? knots[1].getAttribute("cy") : knots[0].getAttribute("cy"));
          text.setAttribute("x", String((x + otherX) / 2));
          text.setAttribute("y", String((y + otherY) / 2 - 6));
        }
      }
    }
  };

  const endDrag = (ev: React.PointerEvent) => {
    const info = dragInfo.current;
    if (!info) return;
    info.el.releasePointerCapture?.(ev.pointerId);
    dragInfo.current = null;
    interactingRef.current = false;
    setDrag(null);
    /* UNICO ricalcolo React dei path, a fine drag */
    onMove(info.name, (info.curX / world.w) * 100, (info.curY / world.h) * 100);
    /* l'offset live si spegne solo dopo il commit di React: mai un frame di
       sovrapposizione fra vecchia left/top e translate azzerata */
    const el = info.el;
    window.requestAnimationFrame(() => {
      if (el.isConnected) el.style.translate = "";
    });
    /* gli estremi del contenuto sono cambiati: riaggancia il clamp del pan
       alla nuova estensione (il commit di React deve essere gia avvenuto) */
    window.setTimeout(() => syncView(), 90);
  };

  const dblZoom = (ev: React.MouseEvent) => {
    if ((ev.target as Element).closest(".note")) return;
    sfx("click");
    zoomAt(ev.clientX, ev.clientY, 1.35);
  };

  const kPct = Math.round(view.k * 100);
  const canX = (contentBox.maxX - contentBox.minX) * view.k > dims.vw + 4;
  const canY = (contentBox.maxY - contentBox.minY) * view.k > dims.vh + 4;

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {/* toolbar della bacheca */}
      <div className="raised mb-1 flex flex-wrap items-center gap-2 bg-[#c9c9c9] px-2 py-1">
        <span
          className="sunk inline-flex items-center gap-2 bg-[#3a2c12] px-2 py-0.5 font-silk text-[9px] tracking-[0.14em] text-[#ffd7a0] uppercase"
          data-tip="rotellina o ± : zoom · trascina lo sfondo o le frecce : sposta la visuale · doppio clic sullo sfondo : avvicina"
          data-tip-pos="bottom-start"
        >
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
          <span
            className="sunk hidden items-center bg-white px-2 py-0.5 font-vt text-lg sm:inline-flex"
            data-tip="Estensione della tela: cresce quando trascini le schede oltre i bordi"
            data-tip-pos="bottom"
          >
            AREA {Math.round(contentBox.maxX - contentBox.minX)}×{Math.round(contentBox.maxY - contentBox.minY)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* cluster zoom */}
          <div className="sunk flex items-center bg-[#d4d4d4]" data-tip="Zoom: rotellina sul punto da inquadrare" data-tip-pos="bottom">
            <button
              className="px-1.5 py-1 font-silk text-[11px] hover:bg-[#e8e8e8] active:bg-[#b8b8b8]"
              onClick={() => { sfx("click"); zoomBy(0.8); }}
              aria-label="Riduci zoom"
            >
              <Minus size={12} />
            </button>
            <button
              className="min-w-[54px] px-1 py-1 font-vt text-lg leading-none tabular-nums hover:bg-[#e8e8e8] active:bg-[#b8b8b8]"
              onClick={() => { sfx("click"); zoomTo100(); }}
              data-tip="Torna a scala reale (100%)"
              data-tip-pos="bottom"
            >
              {kPct}%
            </button>
            <button
              className="px-1.5 py-1 font-silk text-[11px] hover:bg-[#e8e8e8] active:bg-[#b8b8b8]"
              onClick={() => { sfx("click"); zoomBy(1.25); }}
              aria-label="Aumenta zoom"
            >
              <Plus size={12} />
            </button>
          </div>
          <button className="btn90 !px-2 !py-1" onClick={() => { sfx("flip"); fitView(); }} data-tip="Inquadra tutta la lavagna (tasto 0)" data-tip-pos="bottom">
            <Maximize2 size={13} /> Adatta
          </button>
          <button className="btn90 !px-2 !py-1" onClick={() => { sfx("flip"); center(); }} data-tip="Centra la visuale sulla lavagna" data-tip-pos="bottom">
            <Crosshair size={13} /> Centra
          </button>
          <button
            className="btn90 !px-2 !py-1"
            onClick={() => {
              sfx("flip");
              onTidy();
              /* i clan possono occupare piu' tela della griglia di prima:
                 dopo il riposizionamento inquadra tutto il contenuto */
              window.setTimeout(() => fitView(), 300);
            }}
            data-tip="Raggruppa le entità per famiglie, cicli mitologici e relazioni"
            data-tip-pos="bottom-end"
          >
            <Shuffle size={13} /> Auto-disponi
          </button>
        </div>
      </div>

      {/* palco: viewport a transform, niente scrollbar native */}
      <div className="sunk relative min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          ref={stageRef}
          className="board-stage"
          role="application"
          aria-label="Bacheca investigativa: zoom con la rotellina, pan trascinando lo sfondo"
          tabIndex={0}
          onPointerDown={onStagePointerDown}
          onPointerMove={onStagePointerMove}
          onPointerUp={onStagePointerUp}
          onPointerCancel={onStagePointerUp}
          onDoubleClick={dblZoom}
          onKeyDown={onStageKeyDown}
          onDragStart={(e) => e.preventDefault()}
        >
          <div
            ref={worldElRef}
            className="corkboard board-world"
            style={{ width: world.w, height: world.h }}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            aria-label="tela della bacheca"
          >
            <div className="cork-grid" aria-hidden />

            {/* fili SVG — ogni <g> si registra per l'aggiornamento live */}
            <svg
              className="yarn-layer"
              width={world.w}
              height={world.h}
              viewBox={`0 0 ${world.w} ${world.h}`}
              preserveAspectRatio="none"
            >
              {edges.map((ed) => {
                const pa = toPin(ed.a);
                const pb = toPin(ed.b);
                const hot = hotEdge === ed.key;
                const mx = (pa.x + pb.x) / 2;
                const my = (pa.y + pb.y) / 2;
                return (
                  <g
                    key={ed.key}
                    ref={(el) => {
                      if (el) edgeReg.current.set(ed.key, el);
                      else edgeReg.current.delete(ed.key);
                    }}
                  >
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

        {/* targhetta del dossier — ancorata al palco */}
        <div className="board-badge left-2 top-2 px-2 py-1 font-silk text-[9px] tracking-[0.2em] uppercase">
          F.R. 110 a.C. — DOSSIER MITO
        </div>

        {/* scorciatoia di pan verticale, quando serve */}
        {canY && (
          <button
            className="pan-btn pan-u"
            onClick={() => { sfx("click"); tweenTo({ ...viewRef.current, ty: viewRef.current.ty + PAN_STEP }, 160); }}
            disabled={view.ty > -2}
            data-tip="Scorri in alto"
            data-tip-pos="bottom"
          >
            <ChevronUp size={16} strokeWidth={3} />
          </button>
        )}

        {/* leggenda — ancorata al palco */}
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
