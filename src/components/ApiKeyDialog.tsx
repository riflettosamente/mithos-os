"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Server, Trash2, X } from "lucide-react";
import { sfx } from "@/lib/sound";
import { fetchJson } from "@/lib/api";

interface Cfg {
  env: string[];
  session: { provider: string; keyMask: string; model: string; url: string } | null;
}

const PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: "perplexity", label: "Perplexity (Sonar · ricerca web live)" },
  { value: "anthropic", label: "Anthropic Claude (web search)" },
  { value: "openai", label: "OpenAI GPT (web search)" },
  { value: "gemini", label: "Google Gemini (google search)" },
  { value: "openrouter", label: "OpenRouter (:online)" },
  { value: "custom", label: "Endpoint personalizzato OpenAI-compatibile" },
];

export default function ApiKeyDialog({
  open,
  sid,
  onClose,
  onSaved,
}: {
  open: boolean;
  sid: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [provider, setProvider] = useState("perplexity");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [url, setUrl] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!open || !sid) return;
    setMsg(null);
    fetchJson<Cfg>(`/api/llmkey?sid=${encodeURIComponent(sid)}`, undefined, { retries: 3, delayMs: 900 })
      .then(setCfg)
      .catch(() => setCfg({ env: [], session: null }));
  }, [open, sid]);

  if (!open) return null;

  const save = async () => {
    if (!sid || busy) return;
    setBusy(true);
    setMsg(null);
    sfx("click");
    try {
      const data = await fetchJson<{ ok?: boolean; error?: string }>(
        `/api/llmkey?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, key, model, url }),
        },
        { retries: 2, delayMs: 900 }
      );
      if (data.error) throw new Error(data.error);
      sfx("ok");
      setMsg({ tone: "ok", text: "CHIAVE REGISTRATA — l'Oracolo la userà dalla prossima interrogazione." });
      setKey("");
      onSaved();
      window.setTimeout(() => { onClose(); }, 1400);
    } catch (err) {
      sfx("err");
      setMsg({ tone: "err", text: (err instanceof Error ? err.message : "ERRORE").toUpperCase() });
    } finally {
      setBusy(false);
    }
  };

  const wipe = async () => {
    if (!sid || busy) return;
    setBusy(true);
    sfx("click");
    try {
      await fetch(`/api/llmkey?sid=${encodeURIComponent(sid)}`, { method: "DELETE" });
      setCfg((c) => (c ? { ...c, session: null } : c));
      sfx("ok");
      setMsg({ tone: "ok", text: "CHIAVE RIMOSSA — si usano le chiavi del server o il kernel locale." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog" aria-modal onClick={onClose}>
      <div className="win w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <header className="titlebar">
          <KeyRound size={12} />
          <span>CHIAVE.EXE — Custode delle chiavi dell&apos;Oracolo</span>
          <span className="tb-btns" aria-hidden><span className="tb-btn"><X size={9} strokeWidth={3} /></span></span>
        </header>
        <div className="win-body">
          {/* stato attuale */}
          <div className="sunk pergam space-y-1 p-3 font-vt text-lg leading-snug">
            {cfg === null ? (
              <p>LETTURA DEL REGISTRO…</p>
            ) : (
              <>
                <p>
                  <Server size={13} className="mr-1 inline" />
                  SERVER: {cfg.env.length
                    ? `chiavi d'ambiente attive (${cfg.env.join(", ")})`
                    : "nessuna chiave d'ambiente"}
                </p>
                <p>
                  <KeyRound size={13} className="mr-1 inline" />
                  UTENTE: {cfg.session
                    ? <span className="mono-mask font-bold">{cfg.session.provider} · {cfg.session.keyMask}{cfg.session.model ? ` · ${cfg.session.model}` : ""}</span>
                    : "nessuna chiave registrata (kernel locale attivo)"}
                </p>
              </>
            )}
          </div>

          {/* form */}
          <div className="space-y-2 pt-1">
            <label className="field-label">Provider del modello</label>
            <select className="select90" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {PROVIDER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <label className="field-label">API Key</label>
            <div className="flex gap-1.5">
              <input
                className="input90"
                type={show ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="incolla qui la chiave…"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                className="btn90 !px-2.5"
                onClick={() => { sfx("click"); setShow((v) => !v); }}
                data-tip={show ? "Nascondi chiave" : "Mostra chiave"}
              >
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>

            <label className="field-label">Modello (opzionale — altrimenti predefinito)</label>
            <input
              className="input90"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={provider === "perplexity" ? "sonar-pro" : provider === "anthropic" ? "claude-sonnet-4-5" : provider === "openai" ? "gpt-4.1" : provider === "gemini" ? "gemini-2.0-flash" : provider === "openrouter" ? "openai/gpt-4o-mini:online" : "nome-modello"}
              autoComplete="off"
              spellCheck={false}
            />

            {provider === "custom" && (
              <>
                <label className="field-label">URL endpoint (https)</label>
                <input
                  className="input90"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…/v1/chat/completions"
                  autoComplete="off"
                  spellCheck={false}
                />
              </>
            )}
          </div>

          {msg && (
            <div className={`sunk mt-1 flex items-center gap-2 p-2 font-vt text-lg ${msg.tone === "ok" ? "bg-[#dff5df] text-[#145214]" : "bg-[#f5dfdf] text-[#6e1010]"}`}>
              {msg.tone === "ok" ? <CheckCircle2 size={14} /> : <X size={14} strokeWidth={3} />}
              {msg.text}
            </div>
          )}

          <div className="flex justify-center gap-3 pt-2">
            <button className="btn90 btn-gold" onClick={save} disabled={busy || key.trim().length < 8}>
              <KeyRound size={12} /> Salva chiave
            </button>
            {cfg?.session && (
              <button className="btn90" onClick={wipe} disabled={busy}>
                <Trash2 size={12} /> Rimuovi
              </button>
            )}
            <button className="btn90" onClick={() => { sfx("click"); onClose(); }}>Chiudi</button>
          </div>

          <p className="pt-1 text-center font-vt text-[16px] text-[#555]">
            La chiave vive solo nel database di questa spedizione e viaggia esclusivamente server → provider.
          </p>
        </div>
      </div>
    </div>
  );
}
