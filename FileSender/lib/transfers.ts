import { env } from "cloudflare:workers";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_SIZE = 150_000_000_000;
const TTL = 24 * 60 * 60 * 1000;
const SIGNED_URL_TTL = 60 * 60;
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
type TransferRow = { id: string; code_hash: string; download_token: string; upload_token: string; name: string; size: number; status: string; created_at: number; expires_at: number };
class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function storage() {
  const bindings = env as { DB?: D1Database; BUCKET?: R2Bucket; R2_ACCOUNT_ID?: string; R2_ACCESS_KEY_ID?: string; R2_SECRET_ACCESS_KEY?: string; R2_BUCKET_NAME?: string; CLOUDFLARE_ACCOUNT_ID?: string; BUCKET_NAME?: string };
  if (!bindings.DB || !bindings.BUCKET) throw new ApiError(503, "Storage is unavailable right now. Please try again later.");
  return { db: bindings.DB, bucket: bindings.BUCKET, config: bindings };
}
function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" } });
}
function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  console.error("FileSender storage operation failed", error instanceof Error ? error.message : "unknown");
  return json({ error: "The file cannot be transferred right now. Please try again later." }, 503);
}

function signedUploadConfigMissing(config: { R2_ACCOUNT_ID?: string; CLOUDFLARE_ACCOUNT_ID?: string; R2_ACCESS_KEY_ID?: string; R2_SECRET_ACCESS_KEY?: string; R2_BUCKET_NAME?: string; BUCKET_NAME?: string }) {
  const accountId = config.R2_ACCOUNT_ID || config.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = config.R2_ACCESS_KEY_ID;
  const secretAccessKey = config.R2_SECRET_ACCESS_KEY;
  const bucketName = getR2BucketName(config);
  return !accountId || !accessKeyId || !secretAccessKey || !bucketName;
}
async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
function randomCode() {
  let code = "";
  while (code.length < 8) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      if (byte < Math.floor(256 / ALPHABET.length) * ALPHABET.length) code += ALPHABET[byte % ALPHABET.length];
      if (code.length === 8) break;
    }
  }
  return code;
}
function sanitizeFileName(value: string) {
  return value.replace(/[\x00-\x1f\x7f/\\]/g, "_").replace(/[\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, 240);
}
function getR2BucketName(config: Record<string, string | undefined>) {
  return config.R2_BUCKET_NAME || config.BUCKET_NAME || "filesender-files";
}
function getR2Client(config: { R2_ACCOUNT_ID?: string; CLOUDFLARE_ACCOUNT_ID?: string; R2_ACCESS_KEY_ID?: string; R2_SECRET_ACCESS_KEY?: string; R2_BUCKET_NAME?: string; BUCKET_NAME?: string }) {
  const accountId = config.R2_ACCOUNT_ID || config.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = config.R2_ACCESS_KEY_ID;
  const secretAccessKey = config.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return {
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
    bucketName: getR2BucketName(config),
  };
}
async function generateSignedObjectUrl(objectKey: string, operation: "PUT" | "GET") {
  const { config } = storage();
  if (signedUploadConfigMissing(config as { R2_ACCOUNT_ID?: string; CLOUDFLARE_ACCOUNT_ID?: string; R2_ACCESS_KEY_ID?: string; R2_SECRET_ACCESS_KEY?: string; R2_BUCKET_NAME?: string; BUCKET_NAME?: string })) {
    throw new ApiError(503, "Direct upload is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME in Cloudflare Worker secrets.");
  }
  const client = getR2Client(config as { R2_ACCOUNT_ID?: string; CLOUDFLARE_ACCOUNT_ID?: string; R2_ACCESS_KEY_ID?: string; R2_SECRET_ACCESS_KEY?: string; R2_BUCKET_NAME?: string; BUCKET_NAME?: string });
  if (!client) return null;
  const command = operation === "PUT"
    ? new PutObjectCommand({ Bucket: client.bucketName, Key: objectKey, ContentType: "application/octet-stream" })
    : new GetObjectCommand({ Bucket: client.bucketName, Key: objectKey });
  return getSignedUrl(client.client, command, { expiresIn: SIGNED_URL_TTL });
}
async function limit(request: Request, db: D1Database, action: string, max: number) {
  const window = Math.floor(Date.now() / 600_000);
  const identity = request.headers.get("cf-connecting-ip") || "local";
  const key = await hash(`${action}:${window}:${identity}`);
  const result = await db.prepare("INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = rate_limits.count + 1 RETURNING count").bind(key, (window + 1) * 600_000).first<{ count: number }>();
  if (result && result.count > max) throw new ApiError(429, "Too many attempts. Please try again in 10 minutes.");
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
    const { db, bucket, config } = storage();
    const origin = request.headers.get("origin");
    if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") throw new ApiError(403, "Upload the file directly from the FileSender page.");

    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.json() as { name?: string; size?: number };
      const name = typeof body.name === "string" ? body.name : "";
      const length = Number(body.size);
      if (!Number.isSafeInteger(length) || length <= 0 || length > MAX_SIZE) throw new ApiError(413, "File is too large. Maximum size is 150 GB.");
      const safeName = sanitizeFileName(name);
      if (!safeName || safeName === "." || safeName === "..") throw new ApiError(400, "The file must have a valid name.");
      await limit(request, db, "upload", 20);
      await cleanup(db, bucket);
      const id = crypto.randomUUID();
      const downloadToken = crypto.randomUUID();
      const uploadToken = crypto.randomUUID();
      let code = "";
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = randomCode();
        const row = await db.prepare("INSERT INTO transfers (id, code_hash, download_token, upload_token, name, size, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(code_hash) DO NOTHING RETURNING id").bind(id, await hash(candidate), downloadToken, uploadToken, safeName, length, Date.now(), Date.now() + TTL).first();
        if (row) { code = candidate; objectId = id; break; }
      }
      if (!code) throw new ApiError(503, "The code could not be generated. Please try again.");
      const uploadUrl = await generateSignedObjectUrl(`transfers/${id}`, "PUT");
      if (!uploadUrl) throw new ApiError(503, "Direct upload is not configured. Set the R2 signed credentials first.");
      const expiresAt = Date.now() + TTL;
      return json({ code, name: safeName, size: length, expiresAt, uploadUrl, uploadToken }, 201);
    }

    const length = Number(request.headers.get("content-length"));
    const statedSize = Number(request.headers.get("x-file-size"));
    if (!request.headers.has("content-length")) throw new ApiError(411, "The file size could not be verified. Please select it again.");
    if (!Number.isSafeInteger(length) || length <= 0 || length !== statedSize || !request.body) throw new ApiError(400, "Please choose a valid non-empty file.");
    if (length > MAX_SIZE) throw new ApiError(413, "File is too large. Maximum size is 150 GB.");
    let name: string;
    try { name = decodeURIComponent(request.headers.get("x-file-name") || ""); } catch { throw new ApiError(400, "The file name is invalid."); }
    name = sanitizeFileName(name);
    if (!name || name === "." || name === "..") throw new ApiError(400, "The file must have a valid name.");
    await limit(request, db, "upload", 20);
    await cleanup(db, bucket);
    const id = crypto.randomUUID();
    const downloadToken = crypto.randomUUID();
    const uploadToken = crypto.randomUUID();
    let code = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = randomCode();
      const row = await db.prepare("INSERT INTO transfers (id, code_hash, download_token, upload_token, name, size, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?) ON CONFLICT(code_hash) DO NOTHING RETURNING id").bind(id, await hash(candidate), downloadToken, uploadToken, name, length, Date.now(), Date.now() + TTL).first();
      if (row) { code = candidate; objectId = id; break; }
    }
    if (!code) throw new ApiError(503, "The code could not be generated. Please try again.");
    const stored = await bucket.put(`transfers/${id}`, request.body, { httpMetadata: { contentType: "application/octet-stream" } });
    if (!stored || stored.size !== length) throw new ApiError(400, "The file did not upload completely. Please try sending it again.");
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

export async function finalizeUpload(request: Request, raw: string) {
  try {
    const { db, bucket } = storage();
    const code = raw.toUpperCase().replace(/[-–\s]/g, "");
    if (!/^[A-Z0-9]{8}$/.test(code)) throw new ApiError(400, "The code must contain exactly 8 letters or numbers.");
    const body = await request.json() as { uploadToken?: string };
    if (!body.uploadToken) throw new ApiError(400, "The upload session is invalid.");
    const row = await db.prepare("SELECT * FROM transfers WHERE code_hash = ?").bind(await hash(code)).first<TransferRow>();
    if (!row || row.expires_at <= Date.now()) throw new ApiError(404, "This code does not exist or has expired. Check with the sender.");
    if (row.upload_token !== body.uploadToken) throw new ApiError(403, "The upload session is not valid for this file.");
    if (!(await bucket.head(`transfers/${row.id}`))) throw new ApiError(400, "The upload is not complete yet.");
    const expiresAt = Date.now() + TTL;
    await db.prepare("UPDATE transfers SET status = 'ready', expires_at = ? WHERE id = ?").bind(expiresAt, row.id).run();
    const downloadUrl = await generateSignedObjectUrl(`transfers/${row.id}`, "GET");
    return json({ code, name: row.name, size: row.size, expiresAt, downloadUrl, ticket: row.download_token }, 200);
  } catch (error) { return failure(error); }
}

export async function lookup(request: Request, raw: string) {
  try {
    const { db, bucket } = storage();
    await limit(request, db, "lookup", 40);
    const code = raw.toUpperCase().replace(/[-–\s]/g, "");
    if (!/^[A-Z0-9]{8}$/.test(code)) throw new ApiError(400, "The code must contain exactly 8 letters or numbers.");
    const row = await db.prepare("SELECT * FROM transfers WHERE code_hash = ? AND status = 'ready'").bind(await hash(code)).first<TransferRow>();
    if (!row || row.expires_at <= Date.now()) throw new ApiError(404, "This code does not exist or has expired. Check with the sender.");
    if (!(await bucket.head(`transfers/${row.id}`))) throw new ApiError(404, "The file is no longer available. Ask the sender to upload it again.");
    const downloadUrl = await generateSignedObjectUrl(`transfers/${row.id}`, "GET");
    return json({ ...publicTransfer(row), code, ticket: row.download_token, downloadUrl: downloadUrl ?? undefined });
  } catch (error) { return failure(error); }
}

export async function download(request: Request, token: string) {
  try {
    const { db, bucket } = storage();
    await limit(request, db, "download", 60);
    if (!/^[0-9a-f-]{36}$/.test(token)) throw new ApiError(404, "The file is not available.");
    const row = await db.prepare("SELECT * FROM transfers WHERE download_token = ? AND status = 'ready'").bind(token).first<TransferRow>();
    if (!row || row.expires_at <= Date.now()) throw new ApiError(404, "The file is no longer available. Its validity may have expired.");
    const object = await bucket.get(`transfers/${row.id}`);
    if (!object) throw new ApiError(404, "The file is no longer available.");
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
