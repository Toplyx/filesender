"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowDown, Upload, Download, File, X, Check, Copy, Loader2, Clock3, ShieldCheck, ArrowRight, RotateCcw, CircleHelp } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

type Transfer = { code: string; name: string; size: number; expiresAt: number };
const MAX_SIZE = 100_000_000;
const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const prettyCode = (code: string) => `${code.slice(0, 4)}–${code.slice(4)}`;
const sizeLabel = (size: number) => size < 1000 ? `${size} B` : size < 1_000_000 ? `${(size / 1000).toLocaleString("cs", { maximumFractionDigits: 1 })} kB` : `${(size / 1_000_000).toLocaleString("cs", { maximumFractionDigits: 1 })} MB`;
const expiry = (time: number) => new Date(time).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

export default function Home() {
  const [file, setFile] = useState<globalThis.File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [sent, setSent] = useState<Transfer | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [code, setCode] = useState("");
  const [receiveError, setReceiveError] = useState("");
  const [receiving, setReceiving] = useState(false);
  const [received, setReceived] = useState<Transfer | null>(null);
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const dragDepth = useRef(0);
  const receiveLock = useRef(false);
  const help = useRef<HTMLDetailsElement>(null);

  useEffect(() => () => xhr.current?.abort(), []);

  function chooseFile(files: FileList | globalThis.File[] | null) {
    if (!files?.length) return;
    setUploadError("");
    if (files.length !== 1) { setUploadError("Vyber prosím jeden soubor. Více souborů můžeš nejdřív zabalit do ZIPu."); return; }
    const selected = files[0];
    if (selected.size > MAX_SIZE) { setUploadError("Soubor je příliš velký. Maximální velikost je 100 MB."); return; }
    if (selected.size === 0) { setUploadError("Tento soubor je prázdný. Vyber jiný soubor."); return; }
    setFile(selected); setSent(null); setProgress(0);
  }

  function uploadFile() {
    if (!file || uploading || xhr.current) return;
    setUploadError(""); setUploading(true); setProgress(0);
    const request = new XMLHttpRequest(); xhr.current = request;
    request.open("POST", "/api/transfers");
    request.setRequestHeader("Content-Type", "application/octet-stream");
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    request.setRequestHeader("X-File-Size", String(file.size));
    request.timeout = 15 * 60 * 1000;
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
    const finish = () => { setUploading(false); xhr.current = null; };
    request.onload = () => {
      finish();
      let data; try { data = JSON.parse(request.responseText); } catch { setUploadError("Nahrání se nepodařilo potvrdit. Zkus to prosím znovu."); return; }
      if (request.status >= 200 && request.status < 300) { setSent(data); setFile(null); toast.success("Soubor je připravený ke sdílení."); }
      else setUploadError(data.error || "Soubor se nepodařilo nahrát. Zkus to znovu.");
    };
    request.onerror = () => { finish(); setUploadError("Spojení se přerušilo. Soubor máš stále vybraný, zkus ho odeslat znovu."); };
    request.ontimeout = () => { finish(); setUploadError("Nahrávání trvalo příliš dlouho. Zkontroluj připojení a zkus to znovu."); };
    request.onabort = () => { finish(); setProgress(0); toast("Nahrávání bylo zrušeno."); };
    request.send(file);
  }

  const receiveFile = useCallback(async (raw: string) => {
    const entered = normalize(raw);
    if (entered.length !== 8) { setReceiveError("Zadej všech 8 znaků kódu."); return { error: "Zadej všech 8 znaků kódu." }; }
    if (receiveLock.current) return { error: "Přenos už se připravuje." };
    receiveLock.current = true;
    setCode(entered); setReceiveError(""); setReceived(null); setReceiving(true);
    try {
      const response = await fetch(`/api/transfers/${entered}`, { cache: "no-store" });
      let data: Transfer & { ticket: string; error?: string }; try { data = await response.json() as Transfer & { ticket: string; error?: string }; } catch { throw new Error("Služba teď neodpovídá. Zkus to prosím znovu."); }
      if (!response.ok) throw new Error(data.error || "Soubor se nepodařilo najít.");
      const link = document.createElement("a");
      link.href = `/api/download/${encodeURIComponent(data.ticket)}`;
      link.download = data.name;
      document.body.appendChild(link); link.click(); link.remove();
      setReceived(data);
      return { name: data.name, size: data.size, downloadStarted: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Zkontroluj připojení a zkus to znovu.";
      setReceiveError(message); return { error: message };
    } finally { setReceiving(false); receiveLock.current = false; }
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(context.registerTool({ name: "download_file_with_code", title: "Stáhnout soubor pomocí kódu", description: "Zadá kód do FileSenderu a spustí stažení sdíleného souboru. Vyžaduje kód od odesílatele.", inputSchema: { type: "object", properties: { code: { type: "string", description: "Osm znaků kódu souboru." } }, required: ["code"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: (value: unknown) => {
        if (!value || typeof value !== "object" || !("code" in value) || typeof value.code !== "string" || !/^[A-Za-z0-9]{4}[-– ]?[A-Za-z0-9]{4}$/.test(value.code.trim())) return { error: "Neplatný formát kódu." };
        return receiveFile(value.code);
      } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional browser capability. */ }
    return () => lifecycle.abort();
  }, [receiveFile]);

  async function copyCode() {
    if (!sent) return;
    try { await navigator.clipboard.writeText(`${sent.code.slice(0, 4)}-${sent.code.slice(4)}`); setCopied(true); toast.success("Kód zkopírován."); window.setTimeout(() => setCopied(false), 2200); }
    catch { toast.error("Kód se nepodařilo zkopírovat. Označ ho a zkopíruj ručně."); }
  }

  return (
    <div className="app-shell">
      <Toaster position="bottom-center" theme="light" />
      <header className="site-header">
        <a href="/" className="brand" aria-label="FileSender, úvodní stránka"><span className="brand-mark"><ArrowUpRight size={25} strokeWidth={2.8} /></span>file<span className="brand-light">sender</span><span className="brand-period">.</span></a>
        <button className="help-button" onClick={() => { if (help.current) { help.current.open = !help.current.open; if (help.current.open) help.current.scrollIntoView({ behavior: "smooth", block: "center" }); } }}><CircleHelp size={17} /><span>Jak to funguje</span></button>
      </header>
      <main>
        <div className="page-heading"><span className="eyebrow">Z JEDNOHO ZAŘÍZENÍ NA DRUHÉ</span><h1>Pošli soubor. <span>Stačí kód.</span></h1><p>Žádné e-mailové přílohy. Nahraj, předej kód a máš hotovo.</p></div>
        <div className="transfer-grid">
          <section className="send-panel" aria-labelledby="send-title">
            <div className="panel-top"><span className="panel-icon send-icon"><Upload size={22} /></span><span className="step-label">01 / ODESLAT</span></div>
            <h2 id="send-title">{sent ? "Soubor je na cestě." : "Co chceš poslat?"}</h2>
            <p className="panel-description">{sent ? "Předej kód příjemci. O zbytek se postaráme." : "Fotku, video, dokument. Jeden soubor, pár kliknutí."}</p>
            {sent ? <div className="sent-state" aria-live="polite">
              <div className="success-tag"><Check size={15} /> PŘIPRAVENO KE STAŽENÍ</div>
              <div className="code-ticket"><span>KÓD TVÉHO SOUBORU</span><strong>{prettyCode(sent.code)}</strong><button className="copy-button" onClick={copyCode}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Zkopírováno" : "Kopírovat kód"}</button></div>
              <div className="file-row compact"><span className="file-symbol"><File size={21} /></span><div><strong>{sent.name}</strong><span>{sizeLabel(sent.size)} · Dostupné do {expiry(sent.expiresAt)}</span></div><Check className="file-check" size={20} /></div>
              <button className="reset-button" onClick={() => { setSent(null); setFile(null); setUploadError(""); setCopied(false); }}><RotateCcw size={16} /> Odeslat další soubor</button>
            </div> : <>
              <input ref={input} type="file" className="sr-only" aria-label="Vybrat soubor k odeslání" disabled={uploading} onChange={(event) => { chooseFile(event.target.files); event.target.value = ""; }} />
              <div className={`dropzone ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (!uploading) { dragDepth.current++; setDragging(true); } }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) setDragging(false); }} onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); if (!uploading) chooseFile(event.dataTransfer.files); }}>
                {file ? <div className="selected-file"><span className="upload-glyph"><File size={31} strokeWidth={1.6} /></span><strong>{file.name}</strong><span>{sizeLabel(file.size)}</span>{!uploading && <button className="remove-file" onClick={() => { setFile(null); setUploadError(""); }} aria-label="Odebrat vybraný soubor"><X size={18} /></button>}{!uploading && <button className="browse-link" onClick={() => input.current?.click()}>Vybrat jiný soubor</button>}</div> : <button className="drop-trigger" onClick={() => input.current?.click()}><span className="upload-glyph"><Upload size={29} strokeWidth={1.7} /></span><strong>{dragging ? "Tady ho pusť" : "Přetáhni soubor sem"}</strong><span>nebo <b>vyber ze zařízení <ArrowUpRight size={14} /></b></span><small>Všechny typy souborů · až 100 MB</small></button>}
              </div>
              {uploading && <div className="progress-block" aria-live="polite"><div><span>{progress === 100 ? "Dokončujeme uložení…" : "Nahráváme tvůj soubor…"}</span><strong>{progress} %</strong></div><Progress value={progress} aria-label="Průběh nahrávání" /><button onClick={() => xhr.current?.abort()}>Zrušit nahrávání</button></div>}
              {uploadError && <p className="error-message" role="alert">{uploadError}</p>}
              <button className="primary-button" onClick={uploadFile} disabled={!file || uploading}>{uploading ? <><Loader2 size={19} className="spin" />{progress === 100 ? "Ukládání souboru" : "Nahrávání"}</> : <>Odeslat soubor <ArrowUpRight size={20} /></>}</button>
              <div className="panel-footnote"><Clock3 size={15} /> Soubor bude dostupný 24 hodin</div>
            </>}
          </section>
          <section className="receive-panel" aria-labelledby="receive-title">
            <div className="panel-top"><span className="panel-icon receive-icon"><Download size={22} /></span><span className="step-label">02 / PŘIJMOUT</span></div>
            <h2 id="receive-title">Máš kód?</h2><p className="panel-description">Zadej ho sem. Soubor je už skoro u tebe.</p>
            <form onSubmit={(event) => { event.preventDefault(); void receiveFile(code); }} className="receive-form">
              <label htmlFor="receive-code">Kód od odesílatele</label>
              <InputOTP id="receive-code" maxLength={8} pattern="^[A-Za-z0-9]*$" inputMode="text" autoComplete="off" spellCheck={false} autoCapitalize="characters" value={code} onChange={(value) => { setCode(normalize(value)); setReceiveError(""); setReceived(null); }} pasteTransformer={normalize} disabled={receiving} aria-describedby="code-hint" aria-invalid={!!receiveError} containerClassName="code-input">
                <InputOTPGroup className="code-group">{[0, 1, 2, 3].map((i) => <InputOTPSlot className="code-slot" key={i} index={i} />)}</InputOTPGroup><span className="code-divider">–</span><InputOTPGroup className="code-group">{[4, 5, 6, 7].map((i) => <InputOTPSlot className="code-slot" key={i} index={i} />)}</InputOTPGroup>
              </InputOTP>
              <p id="code-hint" className="code-hint">8 znaků, které spojují vás dva.</p>
              {receiveError && <p className="error-message dark-error" role="alert">{receiveError}</p>}
              <button className="receive-button" type="submit" disabled={code.length !== 8 || receiving}>{receiving ? <><Loader2 size={19} className="spin" /> Hledáme soubor…</> : <>Stáhnout soubor <ArrowDown size={19} /></>}</button>
            </form>
            {received ? <div className="download-result" aria-live="polite"><span className="download-success"><Check size={17} /> Stahování bylo spuštěno</span><strong>{received.name}</strong><span>{sizeLabel(received.size)} · Zkontroluj stažené soubory.</span><button onClick={() => void receiveFile(code)}>Stáhnout znovu <RotateCcw size={13} /></button></div> : <div className="receive-note"><span className="note-symbol"><ShieldCheck size={21} /></span><div><strong>Kód je tvůj klíč.</strong><p>Soubor stáhne každý, kdo má jeho kód. Sdílej ho jen s příjemcem.</p></div></div>}
            <div className="receive-bottom"><span>Jeden kód.</span><ArrowRight size={15} /><span>Jeden soubor.</span></div>
          </section>
        </div>
        <div className="details-strip"><span><File size={16} /> Až 100 MB na soubor</span><span><Clock3 size={16} /> Dostupné 24 hodin</span><span><ShieldCheck size={16} /> Přenos přes HTTPS</span></div>
        <details className="how-it-works" ref={help}><summary>Jak FileSender funguje? <span>+</span></summary><div className="help-content"><p><strong>1. Vyber a odešli soubor.</strong> Po dokončení nahrávání dostaneš osmimístný kód. Potom můžeš stránku zavřít.</p><p><strong>2. Předej kód příjemci.</strong> Na stejném webu ho zadá do panelu „Máš kód?“ a klikne na „Stáhnout soubor“. Funguje to i na jiném zařízení.</p><p>Soubor je dostupný 24 hodin a může se stáhnout opakovaně. Po vypršení platnosti kód přestane fungovat. Pro více souborů vytvoř ZIP do 100 MB. Přenos používá HTTPS; soubory nejsou koncově šifrované.</p></div></details>
      </main>
      <footer><a className="footer-brand" href="/">filesender.</a><span>Z tvého zařízení. Kamkoliv.</span><span className="footer-language">Čeština <span>CZ</span></span></footer>
    </div>
  );
}
