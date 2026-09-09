"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Server, Trash2, Wand2, X } from "lucide-react";
import { sfx } from "@/lib/sound";
import { fetchJson } from "@/lib/api";

interface Cfg {
  env: string[];
  session: { provider: string; keyMask: string; model: string; url: string } | null;
}

const PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: "openrouter", label: "OpenRouter (routing automatico / :online)" },
  { value: "groq", label: "Groq (LPU velocissima · free tier generoso)" },
  { value: "cloudflare", label: "Cloudflare Workers AI (fallback giornaliero gratuito)" },
  { value: "openai", label: "OpenAI GPT (web search)" },
  { value: "perplexity", label: "Perplexity (Sonar · ricerca web live)" },
  { value: "anthropic", label: "Anthropic Claude (web search)" },
  { value: "gemini", label: "Google Gemini (google search)" },
  { value: "custom", label: "Endpoint personalizzato OpenAI-compatibile" },
];

function detectProvider(apiKey: string): string | null {
  const value = apiKey.trim();
  if (/^sk-or-/i.test(value)) return "openrouter";
  if (/^sk-ant-/i.test(value)) return "anthropic";
  if (/^pplx-/i.test(value)) return "perplexity";
  if (/^AIza/i.test(value)) return "gemini";
  if (/^gsk_/i.test(value)) return "groq";
  if (/^sk-(?:proj-|svcacct-|admin-|[A-Za-z0-9])/i.test(value)) return "openai";
  return null;
}

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
  const [provider, setProvider] = useState("openrouter");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [url, setUrl] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (!open || !sid) return;
    setMsg(null);
    fetchJson<Cfg>(`/api/llmkey?sid=${encodeURIComponent(sid)}`, undefined, { retries: 3, delayMs: 900 })
      .then((nextCfg) => {
        setCfg(nextCfg);
        if (nextCfg.session) {
          setProvider(nextCfg.session.provider);
          setModel(nextCfg.session.model);
          setUrl(nextCfg.session.url);
        }
      })
      .catch(() => setCfg({ env: [], session: null }));
  }, [open, sid]);

  if (!open) return null;

  const save = async () => {
    if (!sid || busy) return;
    setBusy(true);
    setMsg(null);
    sfx("click");
    try {
      const data = await fetchJson<{ ok?: boolean; error?: string; keyMask?: string }>(
        `/api/llmkey?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, key, model, url }),
        },
        { retries: 2, delayMs: 900 }
      );
      if (data.error) throw new Error(data.error);
      onSaved();
      setCfg((current) => ({
        env: current?.env ?? [],
        session: { provider, keyMask: data.keyMask ?? "••••••••", model, url },
      }));
      setMsg({ tone: "ok", text: "CHIAVE SALVATA · VERIFICA DEL PROVIDER IN CORSO…" });

      const diagnostic = await fetchJson<{
        test?: { ok?: boolean; engine?: string; note?: string | null; reason?: string };
        error?: string;
      }>(
        `/api/llmkey/test?sid=${encodeURIComponent(sid)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
        { retries: 1, delayMs: 900 }
      );
      if (diagnostic.error) throw new Error(diagnostic.error);
      if (!diagnostic.test?.ok) {
        sfx("err");
        setMsg({
          tone: "err",
          text: `CHIAVE SALVATA, MA PROVIDER OFFLINE · ${diagnostic.test?.note ?? diagnostic.test?.reason ?? "errore sconosciuto"}`.toUpperCase(),
        });
        return;
      }

      sfx("ok");
      setKey("");
      setMsg({ tone: "ok", text: `PROVIDER ONLINE · ${diagnostic.test.engine ?? provider}` });
      window.setTimeout(() => { onClose(); }, 2200);
    } catch (err) {
      sfx("err");
      setMsg({ tone: "err", text: (err instanceof Error ? err.message : "ERRORE").toUpperCase() });
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    if (!sid || testing) return;
    setTesting(true);
    setMsg({ tone: "err", text: "PROVA DEL PROVIDER IN CORSO…" });
    sfx("click");
    interface TestResponse {
      source?: string;
      test?: {
        ok?: boolean;
        engine?: string;
        degraded?: boolean;
        note?: string | null;
        reason?: string;
      };
      error?: string;
    }
    try {
      const data = await fetchJson<TestResponse>(
        `/api/llmkey/test?sid=${encodeURIComponent(sid)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(key.trim() ? { provider, key: key.trim(), model: model.trim(), url: url.trim() } : {}),
        },
        { retries: 2, delayMs: 900 }
      );
      if (data.error) throw new Error(data.error);
      if (data.test?.ok) {
        sfx("ok");
        setMsg({ tone: "ok", text: `PROVIDER ONLINE · ${data.test.engine ?? ""}` });
      } else {
        sfx("err");
        setMsg({
          tone: "err",
          text: (data.test?.note ?? data.test?.reason ?? "Provider non raggiungibile").toUpperCase(),
        });
      }
    } catch (error) {
      sfx("err");
      setMsg({ tone: "err", text: (error instanceof Error ? error.message : "ERRORE DI TEST").toUpperCase() });
    } finally {
      setTesting(false);
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
                    ? `chiave predefinita attiva (${cfg.env.join(", ")})`
                    : "nessuna chiave predefinita"}
                </p>
                {cfg.env.length > 0 && (
                  <p className="font-bold text-[#17621c]">
                    ✓ ORACOLO GIÀ ATTIVO — nessuna configurazione necessaria.
                  </p>
                )}
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
                onChange={(e) => {
                  const value = e.target.value;
                  setKey(value);
                  const detected = detectProvider(value);
                  if (detected) setProvider(detected);
                }}
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
              placeholder={provider === "perplexity" ? "sonar-pro" : provider === "anthropic" ? "claude-sonnet-4-5" : provider === "openai" ? "gpt-4.1" : provider === "gemini" ? "gemini-2.5-flash" : provider === "openrouter" ? "google/gemma-4-31b-it:free" : provider === "cloudflare" ? "@cf/meta/llama-3.3-70b-instruct" : provider === "groq" ? "lascia vuoto: scelta auto dal catalogo" : "nome-modello"}
              autoComplete="off"
              spellCheck={false}
            />
            {provider === "openrouter" && (
              <p className="sunk bg-[#fff4c2] p-2 font-vt text-[17px] leading-snug text-[#4a3400]">
                Usa una chiave account <b>sk-or-v1-…</b> e un ID modello visibile su openrouter.ai/models.
                Se non hai accesso alle varianti :online lascia il campo vuoto: l&apos;app proverà automaticamente anche modelli compatibili.
                Esempi: google/gemini-flash-1.5:online, meta-llama/llama-3.3-70b-instruct:free.
              </p>
            )}

            {provider === "cloudflare" && (
              <>
                <p className="sunk bg-[#e2ecff] p-2 font-vt text-[17px] leading-snug text-[#12275c]">
                  Workers AI offre <b>10.000 Neurons al giorno</b> gratis. Serve un <b>API Token</b>
                  (dash.cloudflare.com → My Profile → API Tokens) e l&apos;<b>ID account</b> mostrato
                  nella barra laterale della dashboard. Modello consigliato: @cf/meta/llama-3.3-70b-instruct.
                </p>
                <label className="field-label">ID account Cloudflare (32 caratteri esadecimali)</label>
                <input
                  className="input90"
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="es. 023e105f4ecef8ad9ca31a8372d0c353"
                  autoComplete="off"
                  spellCheck={false}
                />
              </>
            )}

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

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button className="btn90 btn-gold" onClick={save} disabled={busy || testing || key.trim().length < 8}>
              <KeyRound size={12} /> Salva chiave
            </button>
            <button
              className="btn90"
              onClick={testConnection}
              disabled={testing || busy}
              data-tip="Prova la configurazione senza salvarla"
            >
              <Wand2 size={12} /> {testing ? "Test in corso…" : "Test connessione"}
            </button>
            {cfg?.session && (
              <button className="btn90" onClick={wipe} disabled={busy || testing}>
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
