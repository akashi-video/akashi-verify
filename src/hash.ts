import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

/** Incremental SHA-256 — feed chunks as they arrive (e.g. from MediaRecorder) and finish once. */
export function createHasher() {
  const h = sha256.create();
  let bytes = 0;
  return {
    update(chunk: Uint8Array) {
      h.update(chunk);
      bytes += chunk.byteLength;
    },
    get bytes() {
      return bytes;
    },
    digestHex(): `0x${string}` {
      return `0x${bytesToHex(h.digest())}`;
    },
  };
}

export function hashBytes(data: Uint8Array): `0x${string}` {
  return `0x${bytesToHex(sha256(data))}`;
}

/** Stream-hash a Blob/File in the browser without loading it all into memory. */
export async function hashBlob(blob: Blob, onProgress?: (fraction: number) => void): Promise<`0x${string}`> {
  const hasher = createHasher();
  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    hasher.update(value);
    onProgress?.(blob.size ? hasher.bytes / blob.size : 1);
  }
  return hasher.digestHex();
}

/** Stream-hash any async iterable of bytes (Node streams, fetch bodies). */
export async function hashStream(stream: AsyncIterable<Uint8Array>): Promise<{ hash: `0x${string}`; bytes: number }> {
  const hasher = createHasher();
  for await (const chunk of stream) hasher.update(chunk);
  return { hash: hasher.digestHex(), bytes: hasher.bytes };
}

export const isHash = (s: string): s is `0x${string}` => /^0x[0-9a-fA-F]{64}$/.test(s);
export const normalizeHash = (s: string): `0x${string}` => (s.startsWith("0x") ? s : `0x${s}`).toLowerCase() as `0x${string}`;
