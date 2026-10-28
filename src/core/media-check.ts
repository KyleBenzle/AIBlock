import type { Evidence } from '../types';
import { analyzeMetadata } from './detectors/metadata';

const MAX_BYTES = 512 * 1024;
const MAX_CACHE = 500;
const cache = new Map<string, Evidence[]>();

/** Fetches the head of an image (no cookies) and analyzes embedded provenance metadata. */
export async function checkMedia(url: string, f: typeof fetch = (...a) => fetch(...a)): Promise<Evidence[]> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return [];
  }
  if (!/^https?:$/.test(u.protocol)) return [];
  const key = u.href;
  if (cache.has(key)) return cache.get(key)!;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let ev: Evidence[] = [];
  try {
    const res = await f(key, { credentials: 'omit', headers: { Range: `bytes=0-${MAX_BYTES - 1}` }, signal: ctrl.signal, cache: 'force-cache' });
    if (res.ok && res.body && /^image\//.test(res.headers.get('content-type') ?? 'image/')) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      reader.cancel().catch(() => {});
      const bytes = new Uint8Array(Math.min(total, MAX_BYTES));
      let off = 0;
      for (const c of chunks) {
        const part = c.subarray(0, Math.min(c.length, bytes.length - off));
        bytes.set(part, off);
        off += part.length;
        if (off >= bytes.length) break;
      }
      ev = analyzeMetadata(bytes);
    }
  } catch {
    ev = [];
  } finally {
    clearTimeout(timer);
  }
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
  cache.set(key, ev);
  return ev;
}
