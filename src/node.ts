import { createReadStream } from "node:fs";
import { hashStream } from "./hash.js";
import { verifyHash, type VerifyOptions, type VerifyResult } from "./verify.js";

export * from "./index.js";

/** Node helper: stream-hash a file from disk. */
export async function hashFile(path: string): Promise<`0x${string}`> {
  const { hash } = await hashStream(createReadStream(path) as AsyncIterable<Uint8Array>);
  return hash;
}

export async function verifyFile(path: string, opts: VerifyOptions = {}): Promise<VerifyResult> {
  return verifyHash(await hashFile(path), opts);
}
