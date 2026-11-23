# akashi-verify

[![npm](https://img.shields.io/npm/v/akashi-verify.svg)](https://www.npmjs.com/package/akashi-verify) [![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

Independently verify [Akashi](https://akashi.video) screen recordings against their on-chain proof on the [Ethereum Attestation Service](https://attest.org) (EAS). Works in Node 18+ and the browser. MIT licensed.

**You don't have to trust Akashi.** The verifier fingerprints the file locally (SHA-256), reads the attestation straight from the blockchain and checks the schema, the fingerprint, the witness address and the creator's optional EIP-712 co-signature. With `--offline`, it never contacts akashi.video at all — it finds the proof through the public EAS index.

## How Akashi proofs work

1. The recorder computes a SHA-256 fingerprint of the video **while it is being recorded**.
2. Akashi's server re-hashes the stored file; only if both fingerprints match does it continue.
3. The Akashi witness writes an EAS attestation on **Base**: fingerprint, size, duration, timestamp, video ID, and (optionally) the creator's wallet signature.
4. Anyone can re-hash a copy of the file and check it against that attestation. One changed byte → different fingerprint → no match.

The schema (`bytes32 contentHash,uint64 sizeBytes,uint32 durationMs,uint64 recordedAt,string videoId,address creator,bytes creatorSig`) never changes, so old proofs keep verifying forever.

## CLI

```bash
npx akashi-verify ./recording.mp4              # fingerprint the file and verify
npx akashi-verify 0x<sha256-fingerprint>       # verify a fingerprint you already have
npx akashi-verify ./recording.mp4 --offline    # don't contact akashi.video at all
npx akashi-verify ./recording.mp4 --uid 0x<attestation> --chain base --witness 0x<witness>
npx akashi-verify ./recording.mp4 --json       # machine-readable output
```

Exit codes: `0` verified · `1` not verified · `2` error.

## Node

```ts
import { verifyFile } from "akashi-verify/node";

const r = await verifyFile("./recording.mp4");
console.log(r.status, r.message, r.attestationUrl);
```

## Browser

```ts
import { verifyBlob } from "akashi-verify";

const r = await verifyBlob(file, { onProgress: (f) => console.log(Math.round(f * 100) + "%") });
```

## Options

| Option | Meaning |
|---|---|
| `lookup` | `"auto"` (default): ask Akashi which attestation to read, fall back to the public EAS index if Akashi is unreachable. `"chain"`: never contact Akashi. `"akashi"`: only ask Akashi. |
| `uid` + `chain` | Check one attestation directly, skipping lookup. |
| `trustedAttesters` | Witness addresses you trust. Defaults to the list published at `akashi.video/.well-known/akashi.json` plus the addresses pinned in this package. |
| `rpc` | Custom RPC URL for the chain. |
| `chains` | Chains searched in `"chain"` lookup (default: Base, then Base Sepolia). |
| `api` | Akashi host used for lookup (default `https://akashi.video`). |

## Status values

| status | meaning |
|---|---|
| `verified` | The on-chain fingerprint matches the file and a trusted Akashi witness signed it |
| `not_found` | No proof exists for this exact file — it may have been edited, re-encoded or never recorded with Akashi |
| `mismatch` | An attestation exists, but its fingerprint differs from the file |
| `untrusted` | Different schema, or signed by an address that isn't a trusted witness |
| `revoked` | The attestation was revoked |
| `error` | Network or input error |

## API

- `verifyHash(hash, opts)` / `verifyBlob(blob, opts)` / `verifyFile(path, opts)` → `VerifyResult`
- `lookupProof`, `lookupOnChain`, `readAttestation`, `trustedWitnesses`
- `hashBlob`, `hashStream`, `hashFile`, `createHasher` — streaming SHA-256
- `encodeProof`, `decodeProof`, `schemaUid`, `SCHEMA`, `CHAINS`
- `creatorTypedData`, `recoverCreator` — EIP-712 co-signature helpers

## What a proof does — and doesn't — prove

A verified result proves the file is byte-for-byte unchanged since it was registered, when that happened, and which witness (and optionally which wallet) registered it. It does not prove that what the video shows is true or wasn't staged.

## Links

- Verify in the browser: <https://akashi.video/verify>
- Docs: <https://akashi.video/docs>
- Trusted witnesses: <https://akashi.video/.well-known/akashi.json>

## License

MIT © Akashi
