export * from "./constants.js";
export * from "./hash.js";
export * from "./codec.js";
export * from "./verify.js";

import { hashBlob } from "./hash.js";
import { verifyHash, type VerifyOptions, type VerifyResult } from "./verify.js";

/** Browser helper: hash a File/Blob and verify it in one call. */
export async function verifyBlob(blob: Blob, opts: VerifyOptions & { onProgress?: (f: number) => void } = {}): Promise<VerifyResult> {
  const hash = await hashBlob(blob, opts.onProgress);
  return verifyHash(hash, opts);
}
