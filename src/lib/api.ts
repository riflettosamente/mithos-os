"use client";

/* ======================================================================
 * fetchJson tollerante — durante riavvio/riscaldamento del server (o del
 * proxy di anteprima) una fetch può ricevere una pagina HTML di errore
 * al posto del JSON. In quel caso non si deve esplodere con
 * "Unexpected token '<'…": si riprova con backoff e, solo alla fine,
 * si solleva un errore leggibile in italiano.
 * ====================================================================== */

interface RetryOpts {
  retries?: number;   // tentativi aggiuntivi oltre al primo
  delayMs?: number;   // attesa base, cresce a ogni tentativo
}

const HTML_HINT = "IL SERVER DELL'ORACOLO SI STA RIAVVIANDO — RIPROVA TRA UN ISTANTE.";

function looksLikeHtml(body: string): boolean {
  const t = body.trimStart().slice(0, 64).toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.startsWith("<");
}

export async function fetchJson<T = unknown>(
  input: string,
  init?: RequestInit,
  opts?: RetryOpts
): Promise<T> {
  const retries = opts?.retries ?? 2;
  const delay = opts?.delayMs ?? 900;
  let lastErr: Error = new Error("errore di rete sconosciuto");

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(input, init);
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();

      if (!ct.includes("application/json")) {
        const body = await res.text().catch(() => "");
        if (looksLikeHtml(body)) {
          // pagina di riavvio/warm-up del proxy o errore server: ritentiamo
          throw new Error(HTML_HINT);
        }
        throw new Error(`RISPOSTA NON VALIDA DAL SERVER (HTTP ${res.status})`);
      }

      return (await res.json()) as T;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error("ERRORE DI RETE");
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, delay * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}
