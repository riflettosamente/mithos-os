import type { BoardEntity, RelationEdge } from "./types";

/* ==================================================================
 *  AUTO-DISPONI PER CLAN MITOLOGICI
 *
 *  Le entita' vengono raggruppate in componenti connesse del grafo
 *  delle relazioni: ogni componente e' un "clan" (una famiglia, un
 *  ciclo epico, un'alleanza o una faida). All'interno di ogni clan
 *  il nodo con piu' relazioni va al centro e gli altri si dispongono
 *  in anelli attorno, cosi' la stirpe di Crono, il ciclo troiano o
 *  la discendenza di Echidna si riconoscono a colpo d'occhio e i
 *  fili restano corti. I clan vengono poi impacchettati in righe;
 *  le entita' senza relazioni finiscono in coda, come "indizi isolati".
 * ================================================================== */

interface Pt {
  x: number;
  y: number;
}

/* ingombro del cartellino in px logici (larghezza 128 + margine) */
const NODE_RX = 108;
const NODE_RY = 82;
/* passo minimo fra gli anelli di un clan */
const RING_STEP = 126;
/* spazio lungo la circonferenza riservato a ogni cartellino */
const NODE_ARC = 152;
/* respiro fra clan adiacenti e dai bordi */
const CLAN_GAP = 46;
const MARGIN = 46;
/* sotto questo fattore non comprimiamo oltre: meglio debordare
   (la tela e' infinita e "Adatta" inquadra tutto) che sovrapporre */
const MIN_SCALE = 0.75;

function ensureMap<K, V>(m: Map<K, V>, k: K, make: () => V): V {
  let v = m.get(k);
  if (!v) {
    v = make();
    m.set(k, v);
  }
  return v;
}

/* stesse proporzioni della tela usata dalla bacheca */
function worldBase(count: number): { w: number; h: number } {
  const cols = Math.max(3, Math.ceil(Math.sqrt(Math.max(count, 1) * 1.6)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { w: Math.max(760, cols * 200), h: Math.max(480, rows * 140) };
}

interface Clan {
  pos: Map<string, Pt>;
  rx: number;
  ry: number;
}

function layoutClan(members: string[], adj: Map<string, Set<string>>): Clan {
  const deg = (k: string) => adj.get(k)?.size ?? 0;

  /* centro = il nodo con piu' relazioni (il "capofamiglia" del clan) */
  let center = members[0];
  let bestDeg = -1;
  for (const m of members) {
    const d = deg(m);
    if (d > bestDeg) {
      bestDeg = d;
      center = m;
    }
  }

  /* anelli = distanza dal centro nel grafo (BFS) */
  const level = new Map<string, number>([[center, 0]]);
  const queue: string[] = [center];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nb of adj.get(cur) ?? []) {
      if (level.has(nb)) continue;
      level.set(nb, (level.get(cur) ?? 0) + 1);
      queue.push(nb);
    }
  }

  const rings = new Map<number, string[]>();
  for (const m of members) {
    const l = level.get(m) ?? 0;
    ensureMap(rings, l, () => []).push(m);
  }
  /* i piu' connessi prima, cosi' gli anelli restano compatti */
  for (const arr of rings.values()) arr.sort((a, b) => deg(b) - deg(a));

  const pos = new Map<string, Pt>();
  let rx = NODE_RX;
  let ry = NODE_RY;

  for (const [l, arr] of rings) {
    if (l === 0) {
      pos.set(arr[0], { x: 0, y: 0 });
      continue;
    }
    const n = arr.length;
    /* raggio sufficiente a non accavallare i cartellini dell'anello */
    const need = (n * NODE_ARC) / (2 * Math.PI);
    const r = Math.max(RING_STEP * l, need);
    for (let i = 0; i < n; i++) {
      /* sfalsamento per anello: niente colonne radiali innaturali */
      const a = (i / n) * Math.PI * 2 + l * 0.45;
      pos.set(arr[i], { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7 });
    }
    rx = Math.max(rx, r + NODE_RX);
    ry = Math.max(ry, r * 0.72 + NODE_RY);
  }
  return { pos, rx, ry };
}

/**
 * Restituisce la posizione (in percentuale della tela) di ogni entità,
 * raggruppata per clan mitologico. Le chiavi della mappa sono i nomi in
 * minuscolo.
 */
export function clanLayout(
  entities: BoardEntity[],
  relations: RelationEdge[]
): Map<string, Pt> {
  const out = new Map<string, Pt>();
  if (entities.length === 0) return out;

  const lower = (s: string) => s.toLowerCase();
  const known = new Set(entities.map((e) => lower(e.name)));

  /* grafo non orientato fra le sole entità presenti in bacheca */
  const adj = new Map<string, Set<string>>();
  for (const e of entities) ensureMap(adj, lower(e.name), () => new Set());
  for (const r of relations) {
    const a = lower(r.from);
    const b = lower(r.to);
    if (a === b || !known.has(a) || !known.has(b)) continue;
    ensureMap(adj, a, () => new Set()).add(b);
    ensureMap(adj, b, () => new Set()).add(a);
  }

  /* componenti connesse = clan */
  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const e of entities) {
    const k = lower(e.name);
    if (seen.has(k)) continue;
    const comp: string[] = [];
    const queue: string[] = [k];
    seen.add(k);
    while (queue.length) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const nb of adj.get(cur) ?? []) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        queue.push(nb);
      }
    }
    comps.push(comp);
  }
  /* prima i clan piu' grandi: i protagonisti in alto a sinistra,
     gli indizi isolati (clan da 1) naturalmente in coda */
  comps.sort((a, b) => b.length - a.length);

  const base = worldBase(entities.length);
  const clans = comps.map((c) => layoutClan(c, adj));

  /*
   * Impacchettamento: invece di andare a capo a larghezza fissa (che
   * allunga molto in altezza), si prova ogni numero di colonne e si sceglie
   * quello che riempie meglio le proporzioni della tela.
   */
  const pack = (maxPerRow: number) => {
    let cursorX = 0;
    let rowTop = 0;
    let rowBottom = 0;
    let needW = 1;
    let inRow = 0;
    const placed: Array<{ clan: Clan; cx: number; cy: number }> = [];
    for (const clan of clans) {
      if (inRow >= maxPerRow) {
        cursorX = 0;
        rowTop = rowBottom + CLAN_GAP;
        rowBottom = rowTop;
        inRow = 0;
      }
      placed.push({ clan, cx: cursorX + clan.rx, cy: rowTop + clan.ry });
      cursorX += clan.rx * 2 + CLAN_GAP;
      rowBottom = Math.max(rowBottom, rowTop + clan.ry * 2);
      needW = Math.max(needW, cursorX - CLAN_GAP);
      inRow += 1;
    }
    return { placed, needW, needH: Math.max(1, rowBottom) };
  };

  const availW = Math.max(1, base.w - MARGIN * 2);
  const availH = Math.max(1, base.h - MARGIN * 2);

  let best = pack(1);
  let bestRatio = Math.max(best.needW / availW, best.needH / availH);
  for (let k = 2; k <= clans.length; k++) {
    const cand = pack(k);
    const ratio = Math.max(cand.needW / availW, cand.needH / availH);
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = cand;
    }
  }

  /* rientra nella tela base quando possibile; altrimenti lascia
     debordare piuttosto che schiacciare i cartellini */
  const scale = Math.min(1, Math.max(MIN_SCALE, 1 / bestRatio));

  for (const { clan, cx, cy } of best.placed) {
    for (const [k, p] of clan.pos) {
      out.set(k, {
        x: ((MARGIN + (cx + p.x) * scale) / base.w) * 100,
        y: ((MARGIN + (cy + p.y) * scale) / base.h) * 100,
      });
    }
  }
  return out;
}
