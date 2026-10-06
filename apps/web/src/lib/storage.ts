import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { generateToken } from "@/lib/auth/tokens";

/**
 * Private file storage (payment proofs, documents). S3 when S3_BUCKET is set,
 * otherwise a local folder for development. Files are always served through an
 * authorised route handler, never by public URL.
 */
export type StoredFile = { body: Uint8Array; contentType: string };

const LOCAL_DIR = path.resolve(process.cwd(), process.env.LOCAL_STORAGE_DIR ?? ".uploads");
const bucket = process.env.S3_BUCKET;
let s3: S3Client | undefined;
const client = () => (s3 ??= new S3Client({}));

export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function validateUpload(file: File): string | null {
  if (file.size === 0) return null;
  if (file.size > MAX_UPLOAD_BYTES) return "Files must be 5 MB or smaller.";
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return "Upload a photo (JPG, PNG, WebP) or PDF.";
  return null;
}

function safeKey(key: string) {
  if (!/^[\w/-]+(\.\w+)?$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
  return key;
}

/** Stores a file under `prefix/` with a random name and returns its key. */
export async function putFile(prefix: string, file: File): Promise<string> {
  const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" }[file.type] ?? "";
  const key = safeKey(`${prefix}/${generateToken(16)}${ext}`);
  const body = new Uint8Array(await file.arrayBuffer());
  if (bucket) {
    await client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: file.type, ServerSideEncryption: "AES256" }));
  } else {
    const full = path.join(LOCAL_DIR, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    await writeFile(`${full}.type`, file.type);
  }
  return key;
}

export async function getFile(key: string): Promise<StoredFile | null> {
  safeKey(key);
  try {
    if (bucket) {
      const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!res.Body) return null;
      return { body: await res.Body.transformToByteArray(), contentType: res.ContentType ?? "application/octet-stream" };
    }
    const full = path.join(LOCAL_DIR, key);
    return { body: new Uint8Array(await readFile(full)), contentType: (await readFile(`${full}.type`, "utf8")).trim() };
  } catch {
    return null;
  }
}
