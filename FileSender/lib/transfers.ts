import { env } from "cloudflare:workers";

const MAX_SIZE = 100_000_000;
const TTL = 24 * 60 * 60 * 1000;
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
type TransferRow = { id: string; code_hash: string; download_token: string; name: string; size: number; status: string; created_at: number; expires_at: number };
class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function storage() {
  const bindings = env as { DB?: D1Database; BUCKET?: R2Bucket };
  if (!bindings.DB || !bindings.BUCKET) throw new ApiError(503, "Úložiště je teď nedostupné. Zkus to prosím za chvíli.");
  return { db: bindings.DB, bucket: bindings.BUCKET };
}
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}
function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error("FileSender storage operation failed", error instanceof Error ? error.message : "unknown");
  return json({ error: "Soubor teď nelze přenést. Zkus to prosím za chvíli znovu." }, 503);
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  // Rejection sampling avoids modulo bias for the human-readable alphabet.
  let code = "";
  while (code.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < Math.floor(256 / ALPHABET.length) * ALPHABET.length) code += ALPHABET[byte % ALPHABET.length];
      if (code.length === 8) break;
    }
  }
  return code;
}
async function limit(request: Request, db: D1Database, action: string, max: number) {
  const window = Math.floor(Date.now() / 600_000);
  const identity = request.headers.get("cf-connecting-ip") || "local";
  const key = await hash(`${action}:${window}:${identity}`);
  const result = await db.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = rate_limits.count + 1 RETURNING count").bind(key, (window + 1) * 600_000).first<{ count: number }>();
  if (result && result.count > max) throw new ApiError(429, "Příliš mnoho pokusů. Zkus to prosím znovu za 10 minut.");
}
async function cleanup(db: D1Database, bucket: R2Bucket) {
  const rows = await db.prepare("SELECT id FROM transfers WHERE expires_at <= ? ORDER BY expires_at LIMIT 20").bind(Date.now()).all<{ id: string }>();
  for (const row of rows.results) {
    await bucket.delete(`transfers/${row.id}`);
    await db.prepare("DELETE FROM transfers WHERE id = ? AND expires_at <= ?").bind(row.id, Date.now()).run();
  }
  await db.prepare("DELETE FROM rate_limits WHERE key IN (SELECT key FROM rate_limits WHERE expires_at <= ? LIMIT 100)").bind(Date.now()).run();
}
function publicTransfer(row: TransferRow) { return { name: row.name, size: row.size, expiresAt: row.expires_at }; }

export async function upload(request: Request) {
  let objectId: string | null = null;
  try {
    const { db, bucket } = storage();
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Soubor odešli přímo ze stránky FileSender.");
    const length = Number(request.headers.get("content-length"));
    const statedSize = Number(request.headers.get("x-file-size"));
    if (!request.headers.has("content-length")) throw new ApiError(411, "Velikost souboru nelze ověřit. Vyber ho prosím znovu.");
    if (!Number.isSafeInteger(length) || length <= 0 || length !== statedSize || !request.body) throw new ApiError(400, "Vyber platný neprázdný soubor.");
    if (length > MAX_SIZE) throw new ApiError(413, "Soubor je příliš velký. Maximum je 100 MB.");
    let name: string;
    try { name = decodeURIComponent(request.headers.get("x-file-name") || ""); } catch { throw new ApiError(400, "Název souboru není platný."); }
    name = name.replace(/[\x00-\x1f\x7f/\\]/g, "_").replace(/[\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 240);
    if (!name || name === "." || name === "..") throw new ApiError(400, "Soubor musí mít platný název.");
    await limit(request, db, "upload", 20);
    await cleanup(db, bucket);
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    let code = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = randomCode();
      const row = await db.prepare("INSERT INTO transfers (id, code_hash, download_token, name, size, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(code_hash) DO NOTHING RETURNING id").bind(id, await hash(candidate), token, name, length, Date.now(), Date.now() + TTL).first();
      if (row) { code = candidate; objectId = id; break; }
    }
    if (!code) throw new ApiError(503, "Kód se nepodařilo vytvořit. Zkus to znovu.");
    // Stream the request straight into R2: never buffer a 100 MB upload in Worker memory.
    const stored = await bucket.put(`transfers/${id}`, request.body, { httpMetadata: { contentType: "application/octet-stream" } });
    if (!stored || stored.size !== length) throw new ApiError(400, "Soubor se nenahrál celý. Zkus ho prosím odeslat znovu.");
    const expiresAt = Date.now() + TTL;
    await db.prepare("UPDATE transfers SET status = 'ready', expires_at = ? WHERE id = ?").bind(expiresAt, id).run();
    objectId = null;
    return json({ code, name, size: length, expiresAt }, 201);
  } catch (error) {
    if (objectId) {
      try { const { db, bucket } = storage(); await bucket.delete(`transfers/${objectId}`); await db.prepare("DELETE FROM transfers WHERE id = ?").bind(objectId).run(); } catch { console.error("FileSender failed upload cleanup deferred"); }
    }
    return failure(error);
  }
}

export async function lookup(request: Request, raw: string) {
  try {
    const { db, bucket } = storage();
    await limit(request, db, "lookup", 40);
    const code = raw.toUpperCase().replace(/[-–\s]/g, "");
    if (!/^[A-Z0-9]{8}$/.test(code)) throw new ApiError(400, "Kód musí mít přesně 8 písmen nebo číslic.");
    const row = await db.prepare("SELECT * FROM transfers WHERE code_hash = ? AND status = 'ready'").bind(await hash(code)).first<TransferRow>();
    if (!row || row.expires_at <= Date.now()) throw new ApiError(404, "Tento kód neexistuje nebo už vypršel. Zkontroluj ho u odesílatele.");
    if (!(await bucket.head(`transfers/${row.id}`))) throw new ApiError(404, "Soubor už není dostupný. Požádej odesílatele o nové nahrání.");
    return json({ ...publicTransfer(row), code, ticket: row.download_token });
  } catch (error) { return failure(error); }
}

export async function download(request: Request, token: string) {
  try {
    const { db, bucket } = storage();
    await limit(request, db, "download", 60);
    if (!/^[0-9a-f-]{36}$/.test(token)) throw new ApiError(404, "Soubor není dostupný.");
    const row = await db.prepare("SELECT * FROM transfers WHERE download_token = ? AND status = 'ready'").bind(token).first<TransferRow>();
    if (!row || row.expires_at <= Date.now()) throw new ApiError(404, "Soubor už není dostupný. Jeho platnost mohla vypršet.");
    const object = await bucket.get(`transfers/${row.id}`);
    if (!object) throw new ApiError(404, "Soubor už není dostupný.");
    const fallback = row.name.replace(/[^a-zA-Z0-9._ -]/g, "_");
    const encoded = encodeURIComponent(row.name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    return new Response(object.body, { headers: {
      "Content-Type": "application/octet-stream", "Content-Length": String(object.size),
      "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer",
    } });
  } catch (error) { return failure(error); }
}
