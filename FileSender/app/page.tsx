"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ArrowDown, Upload, Download, File, X, Check, Copy, Loader2, Clock3, ShieldCheck, ArrowRight, RotateCcw, CircleHelp } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Progress } from "@/components/ui/progress";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

type Transfer = { code: string; name: string; size: number; expiresAt: number };
const MAX_SIZE = 150_000_000_000;
const normalize = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
const prettyCode = (code: string) => `${code.slice(0, 4)}–${code.slice(4)}`;
const sizeLabel = (size: number) => {
  if (size < 1000) return `${size} B`;
  if (size < 1_000_000) return `${(size / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} kB`;
  if (size < 1_000_000_000) return `${(size / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })} MB`;
  return `${(size / 1_000_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })} GB`;
};
const expiry = (time: number) => new Date(time).toLocaleString("en-US", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

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
    if (files.length !== 1) { setUploadError("Please select one file. You can zip multiple files first."); return; }
    const selected = files[0];
    if (selected.size > MAX_SIZE) { setUploadError("File is too large. Maximum size is 150 GB."); return; }
    if (selected.size === 0) { setUploadError("This file is empty. Please choose a different one."); return; }
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
      let data; try { data = JSON.parse(request.responseText); } catch { setUploadError("Upload could not be confirmed. Please try again."); return; }
      if (request.status >= 200 && request.status < 300) { setSent(data); setFile(null); toast.success("File is ready to share."); }
      else setUploadError(data.error || "The file could not be uploaded. Please try again.");
    };
    request.onerror = () => { finish(); setUploadError("The connection dropped. Your file is still selected, so you can try sending it again."); };
    request.ontimeout = () => { finish(); setUploadError("Upload took too long. Check your connection and try again."); };
    request.onabort = () => { finish(); setProgress(0); toast("Upload was canceled."); };
    request.send(file);
  }

  const receiveFile = useCallback(async (raw: string) => {
    const entered = normalize(raw);
    if (entered.length !== 8) { setReceiveError("Enter all 8 code characters."); return { error: "Enter all 8 code characters." }; }
    if (receiveLock.current) return { error: "The transfer is already being prepared." };
    receiveLock.current = true;
    setCode(entered); setReceiveError(""); setReceived(null); setReceiving(true);
    try {
      const response = await fetch(`/api/transfers/${entered}`, { cache: "no-store" });
      let data: Transfer & { ticket: string; error?: string }; try { data = await response.json() as Transfer & { ticket: string; error?: string }; } catch { throw new Error("The service is not responding right now. Please try again."); }
      if (!response.ok) throw new Error(data.error || "The file could not be found.");
      const link = document.createElement("a");
      link.href = `/api/download/${encodeURIComponent(data.ticket)}`;
      link.download = data.name;
      document.body.appendChild(link); link.click(); link.remove();
      setReceived(data);
      return { name: data.name, size: data.size, downloadStarted: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check your connection and try again.";
      setReceiveError(message); return { error: message };
    } finally { setReceiving(false); receiveLock.current = false; }
  }, []);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal: AbortSignal }) => unknown } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      Promise.resolve(context.registerTool({ name: "download_file_with_code", title: "Download a file with a code", description: "Enter the code to FileSender and start downloading a shared file. Requires a code from the sender.", inputSchema: { type: "object", properties: { code: { type: "string", description: "The 8-character file code." } }, required: ["code"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true }, execute: (value: unknown) => {
        if (!value || typeof value !== "object" || !("code" in value) || typeof value.code !== "string" || !/^[A-Za-z0-9]{4}[-– ]?[A-Za-z0-9]{4}$/.test(value.code.trim())) return { error: "Invalid code format." };
        return receiveFile(value.code);
      } }, { signal: lifecycle.signal })).catch(() => {});
    } catch { /* Optional browser capability. */ }
    return () => lifecycle.abort();
  }, [receiveFile]);

  async function copyCode() {
    if (!sent) return;
    try { await navigator.clipboard.writeText(`${sent.code.slice(0, 4)}-${sent.code.slice(4)}`); setCopied(true); toast.success("Code copied."); window.setTimeout(() => setCopied(false), 2200); }
    catch { toast.error("The code could not be copied. Highlight it and copy it manually."); }
  }

  return (
    <div className="app-shell">
      <Toaster position="bottom-center" theme="light" />
      <header className="site-header">
        <a href="/" className="brand" aria-label="FileSender home page"><span className="brand-mark"><ArrowUpRight size={25} strokeWidth={2.8} /></span>file<span className="brand-light">sender</span><span className="brand-period">.</span></a>
        <button className="help-button" onClick={() => { if (help.current) { help.current.open = !help.current.open; if (help.current.open) help.current.scrollIntoView({ behavior: "smooth", block: "center" }); } }}><CircleHelp size={17} /><span>How it works</span></button>
      </header>
      <main>
        <div className="page-heading"><span className="eyebrow">FROM ONE DEVICE TO ANOTHER</span><h1>Send a file. <span>One code is enough.</span></h1><p>No email attachments. Upload, pass the code, and you're done.</p></div>
        <div className="transfer-grid">
          <section className="send-panel" aria-labelledby="send-title">
            <div className="panel-top"><span className="panel-icon send-icon"><Upload size={22} /></span><span className="step-label">01 / SEND</span></div>
            <h2 id="send-title">{sent ? "Your file is on the way." : "What do you want to send?"}</h2>
            <p className="panel-description">{sent ? "Send the code to the recipient. We’ll handle the rest." : "Photo, video, document. One file, a few clicks."}</p>
            {sent ? <div className="sent-state" aria-live="polite">
              <div className="success-tag"><Check size={15} /> READY TO DOWNLOAD</div>
              <div className="code-ticket"><span>YOUR FILE CODE</span><strong>{prettyCode(sent.code)}</strong><button className="copy-button" onClick={copyCode}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Copied" : "Copy code"}</button></div>
              <div className="file-row compact"><span className="file-symbol"><File size={21} /></span><div><strong>{sent.name}</strong><span>{sizeLabel(sent.size)} · Available until {expiry(sent.expiresAt)}</span></div><Check className="file-check" size={20} /></div>
              <button className="reset-button" onClick={() => { setSent(null); setFile(null); setUploadError(""); setCopied(false); }}><RotateCcw size={16} /> Send another file</button>
            </div> : <>
              <input ref={input} type="file" className="sr-only" aria-label="Choose a file to upload" disabled={uploading} onChange={(event) => { chooseFile(event.target.files); event.target.value = ""; }} />
              <div className={`dropzone ${dragging ? "is-dragging" : ""} ${file ? "has-file" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (!uploading) { dragDepth.current++; setDragging(true); } }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { event.preventDefault(); dragDepth.current--; if (dragDepth.current <= 0) setDragging(false); }} onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setDragging(false); if (!uploading) chooseFile(event.dataTransfer.files); }}>
                {file ? <div className="selected-file"><span className="upload-glyph"><File size={31} strokeWidth={1.6} /></span><strong>{file.name}</strong><span>{sizeLabel(file.size)}</span>{!uploading && <button className="remove-file" onClick={() => { setFile(null); setUploadError(""); }} aria-label="Remove selected file"><X size={18} /></button>}{!uploading && <button className="browse-link" onClick={() => input.current?.click()}>Choose another file</button>}</div> : <button className="drop-trigger" onClick={() => input.current?.click()}><span className="upload-glyph"><Upload size={29} strokeWidth={1.7} /></span><strong>{dragging ? "Drop it here" : "Drag a file here"}</strong><span>or <b>select from your device <ArrowUpRight size={14} /></b></span><small>Any file type · up to 150 GB</small></button>}
              </div>
              {uploading && <div className="progress-block" aria-live="polite"><div><span>{progress === 100 ? "Finalizing upload…" : "Uploading your file…"}</span><strong>{progress} %</strong></div><Progress value={progress} aria-label="Upload progress" /><button onClick={() => xhr.current?.abort()}>Cancel upload</button></div>}
              {uploadError && <p className="error-message" role="alert">{uploadError}</p>}
              <button className="primary-button" onClick={uploadFile} disabled={!file || uploading}>{uploading ? <><Loader2 size={19} className="spin" />{progress === 100 ? "Saving file" : "Uploading"}</> : <>Send file <ArrowUpRight size={20} /></>}</button>
              <div className="panel-footnote"><Clock3 size={15} /> File will be available for 24 hours</div>
            </>}
          </section>
          <section className="receive-panel" aria-labelledby="receive-title">
            <div className="panel-top"><span className="panel-icon receive-icon"><Download size={22} /></span><span className="step-label">02 / RECEIVE</span></div>
            <h2 id="receive-title">Have a code?</h2><p className="panel-description">Enter it here. Your file is almost with you.</p>
            <form onSubmit={(event) => { event.preventDefault(); void receiveFile(code); }} className="receive-form">
              <label htmlFor="receive-code">Code from sender</label>
              <InputOTP id="receive-code" maxLength={8} pattern="^[A-Za-z0-9]*$" inputMode="text" autoComplete="off" spellCheck={false} autoCapitalize="characters" value={code} onChange={(value) => { setCode(normalize(value)); setReceiveError(""); setReceived(null); }} pasteTransformer={normalize} disabled={receiving} aria-describedby="code-hint" aria-invalid={!!receiveError} containerClassName="code-input">
                <InputOTPGroup className="code-group">{[0, 1, 2, 3].map((i) => <InputOTPSlot className="code-slot" key={i} index={i} />)}</InputOTPGroup><span className="code-divider">–</span><InputOTPGroup className="code-group">{[4, 5, 6, 7].map((i) => <InputOTPSlot className="code-slot" key={i} index={i} />)}</InputOTPGroup>
              </InputOTP>
              <p id="code-hint" className="code-hint">8 characters that connect you two.</p>
              {receiveError && <p className="error-message dark-error" role="alert">{receiveError}</p>}
              <button className="receive-button" type="submit" disabled={code.length !== 8 || receiving}>{receiving ? <><Loader2 size={19} className="spin" /> Looking for file…</> : <>Download file <ArrowDown size={19} /></>}</button>
            </form>
            {received ? <div className="download-result" aria-live="polite"><span className="download-success"><Check size={17} /> Download started</span><strong>{received.name}</strong><span>{sizeLabel(received.size)} · Check your downloaded files.</span><button onClick={() => void receiveFile(code)}>Download again <RotateCcw size={13} /></button></div> : <div className="receive-note"><span className="note-symbol"><ShieldCheck size={21} /></span><div><strong>The code is your key.</strong><p>Anyone with the code can download the file. Share it only with the recipient.</p></div></div>}
            <div className="receive-bottom"><span>One code.</span><ArrowRight size={15} /><span>One file.</span></div>
          </section>
        </div>
        <div className="details-strip"><span><File size={16} /> Up to 150 GB per file</span><span><Clock3 size={16} /> Available for 24 hours</span><span><ShieldCheck size={16} /> Transfer over HTTPS</span></div>
        <details className="how-it-works" ref={help}><summary>How does FileSender work? <span>+</span></summary><div className="help-content"><p><strong>1. Select and send a file.</strong> Once the upload is complete, you get an eight-character code. You can close the page afterward.</p><p><strong>2. Pass the code to the recipient.</strong> On the same site they enter it in the “Have a code?” panel and tap “Download file.” It works on a different device too.</p><p>The file stays available for 24 hours and can be downloaded repeatedly. Once it expires, the code stops working. For multiple files, zip them into one archive up to 150 GB. Transfers use HTTPS; files are not end-to-end encrypted.</p></div></details>
      </main>
      <footer><a className="footer-brand" href="/">filesender.</a><span>From your device. Anywhere.</span><span className="footer-language">English <span>EN</span></span></footer>
    </div>
  );
}
