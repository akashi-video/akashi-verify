import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { hashBlob, encodeProof, decodeProof, schemaUid, SCHEMA, CHAINS, normalizeHash } from "../dist/index.js";

test("schema UID is stable", () => {
  assert.equal(SCHEMA, "bytes32 contentHash,uint64 sizeBytes,uint32 durationMs,uint64 recordedAt,string videoId,address creator,bytes creatorSig");
  assert.equal(schemaUid(), "0xc13a279bd0e8665d7a669c9f2c62588efc9319bffed2d911bfdd546f7d1e9af4");
});

test("streaming hash matches node:crypto", async () => {
  const bytes = new Uint8Array(3_000_000).map((_, i) => (i * 31) % 256);
  const expected = "0x" + createHash("sha256").update(bytes).digest("hex");
  assert.equal(await hashBlob(new Blob([bytes])), expected);
});

test("proof encodes and decodes losslessly", () => {
  const proof = {
    contentHash: normalizeHash("0x" + "ab".repeat(32)),
    sizeBytes: 123456789n, durationMs: 61000, recordedAt: 1795448409n, videoId: "TXEvY3BDXgu",
    creator: "0x0000000000000000000000000000000000000000", creatorSig: "0x",
  };
  const back = decodeProof(encodeProof(proof));
  assert.equal(back.contentHash, proof.contentHash);
  assert.equal(back.sizeBytes, proof.sizeBytes);
  assert.equal(back.durationMs, proof.durationMs);
  assert.equal(back.videoId, proof.videoId);
});

test("Base is configured with the OP-stack EAS predeploy", () => {
  assert.equal(CHAINS.base.chainId, 8453);
  assert.equal(CHAINS.base.eas.toLowerCase(), "0x4200000000000000000000000000000000000021");
});
