import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";

/**
 * Attachments go through one tiny interface so self-host can use a disk folder and the cloud an
 * S3-compatible bucket (ADR: disk is the first bottleneck, so S3 from day one). Keys are random, never user input.
 */
export interface Storage {
  put(key: string, body: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  remove(key: string): Promise<void>;
}

class DiskStorage implements Storage {
  constructor(private root: string) {}
  private file(key: string) {
    if (!/^[a-z0-9/-]+$/.test(key)) throw new Error("bad storage key");
    return path.join(this.root, key);
  }
  async put(key: string, body: Uint8Array) {
    const f = this.file(key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }
  async get(key: string) {
    try { return new Uint8Array(await readFile(this.file(key))); } catch { return null; }
  }
  async remove(key: string) {
    await unlink(this.file(key)).catch(() => {});
  }
}

class S3Storage implements Storage {
  private client: AwsClient;
  constructor(private endpoint: string, private bucket: string, accessKeyId: string, secretAccessKey: string, region: string) {
    this.client = new AwsClient({ accessKeyId, secretAccessKey, region, service: "s3" });
  }
  private url(key: string) { return `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${key}`; }
  async put(key: string, body: Uint8Array, mime: string) {
    const r = await this.client.fetch(this.url(key), { method: "PUT", body: body as unknown as BodyInit, headers: { "content-type": mime } });
    if (!r.ok) throw new Error(`S3 put ${r.status}`);
  }
  async get(key: string) {
    const r = await this.client.fetch(this.url(key));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`S3 get ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  }
  async remove(key: string) {
    await this.client.fetch(this.url(key), { method: "DELETE" });
  }
}

let instance: Storage | undefined;
export function storage(): Storage {
  if (instance) return instance;
  const e = process.env;
  instance = e.S3_ENDPOINT && e.S3_BUCKET && e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
    ? new S3Storage(e.S3_ENDPOINT, e.S3_BUCKET, e.S3_ACCESS_KEY_ID, e.S3_SECRET_ACCESS_KEY, e.S3_REGION ?? "auto")
    : new DiskStorage(path.resolve(e.OZVI_STORAGE_DIR ?? "./data/uploads"));
  return instance;
}

// --- validation -----------------------------------------------------------------

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES = 5;

/** Decide the type from the bytes, not from what the browser claims. */
export function sniff(b: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((v, i) => b[i] === v);
  if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
  if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
  if (starts(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (starts(0x25, 0x50, 0x44, 0x46)) return "application/pdf";
  // Plain text / logs: valid UTF-8 without NUL bytes in the first 4 kB.
  const head = b.subarray(0, 4096);
  if (head.includes(0)) return null;
  try { new TextDecoder("utf-8", { fatal: true }).decode(head); return "text/plain"; } catch { return null; }
}

export function safeName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-80);
  return cleaned || "subor";
}
