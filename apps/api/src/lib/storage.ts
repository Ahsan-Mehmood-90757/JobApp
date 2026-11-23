import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config';

/**
 * Minimal object storage on local disk with S3-style keys and HMAC-signed, expiring URLs.
 * Same interface shape as Supabase Storage (put / signedUrl), so it can be swapped later.
 */
const root = path.resolve(config.STORAGE_DIR);

function safePath(key: string): string {
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new Error('invalid storage key');
  return p;
}

export async function putObject(prefix: string, ext: string, data: Buffer): Promise<string> {
  const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}${ext}`;
  const p = safePath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, data);
  return key;
}

export async function getObject(key: string): Promise<Buffer> {
  return readFile(safePath(key));
}

function sign(key: string, exp: number): string {
  return createHmac('sha256', config.FILE_SIGNING_SECRET).update(`${key}\n${exp}`).digest('base64url');
}

export function signedUrl(key: string, baseUrl = config.PUBLIC_BASE_URL, ttlSeconds = config.SIGNED_URL_TTL_SECONDS): { url: string; expiresAt: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const qs = new URLSearchParams({ key, exp: String(exp), sig: sign(key, exp) });
  return { url: `${baseUrl.replace(/\/$/, '')}/files?${qs}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function verifySignature(key: string, exp: string, sig: string): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(key, e));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
