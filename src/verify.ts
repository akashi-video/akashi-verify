import { createPublicClient, http, getAddress, type Hex } from "viem";
import { CHAINS, DEFAULT_API, EAS_ABI, KNOWN_WITNESSES, LOOKUP_CHAINS, schemaUid, type ChainInfo } from "./constants.js";
import { decodeProof, recoverCreator, ZERO_ADDRESS, type ProofData } from "./codec.js";
import { isHash, normalizeHash } from "./hash.js";

export type VerifyStatus =
  | "verified" // on-chain record matches the file, signed by a trusted Akashi witness
  | "not_found" // no Akashi proof is known for this fingerprint
  | "mismatch" // an attestation exists but its fingerprint differs from the file
  | "untrusted" // the attestation was not made by a trusted witness
  | "revoked"
  | "error";

export interface VerifyOptions {
  /** Akashi instance used ONLY to look up which attestation to check. Truth is read from the chain. */
  api?: string;
  /** Skip the lookup and check this attestation directly. Requires `chain`. */
  uid?: `0x${string}`;
  chain?: string;
  /** Override the RPC URL for the chain. */
  rpc?: string;
  /** Witness addresses you trust. Defaults to those published at {api}/.well-known/akashi.json, else the pinned list. */
  trustedAttesters?: string[];
  /**
   * How to find the attestation for a fingerprint:
   * - "auto" (default): ask Akashi; if Akashi is unreachable, search the public EAS index directly.
   * - "chain": never contact Akashi — search the public EAS index on each chain.
   * - "akashi": only ask Akashi.
   */
  lookup?: "auto" | "chain" | "akashi";
  /** Chains to search in "chain" lookup. Defaults to Base, then Base Sepolia. */
  chains?: string[];
  fetch?: typeof fetch;
}

export interface VerifyResult {
  status: VerifyStatus;
  hash: `0x${string}`;
  message: string;
  chain?: ChainInfo;
  uid?: `0x${string}`;
  attester?: `0x${string}`;
  attestedAt?: Date;
  proof?: ProofData;
  creatorVerified?: boolean; // creator wallet signature recovered and matches
  videoUrl?: string;
  attestationUrl?: string;
}

interface LookupResponse {
  found: boolean;
  chain?: string;
  uid?: `0x${string}`;
  videoId?: string;
  url?: string;
  status?: string;
}

export async function lookupProof(hash: string, opts: VerifyOptions = {}): Promise<LookupResponse> {
  const f = opts.fetch ?? fetch;
  const api = (opts.api ?? DEFAULT_API).replace(/\/$/, "");
  const res = await f(`${api}/api/v1/proofs/${normalizeHash(hash)}`, { headers: { accept: "application/json" } });
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  return (await res.json()) as LookupResponse;
}

/**
 * Find Akashi attestations for a fingerprint without Akashi's server, using the public
 * EAS indexer (easscan GraphQL). The contentHash is the first field of the encoded data,
 * so the attestation data starts with the fingerprint. Results are re-checked on-chain.
 */
export async function lookupOnChain(hash: string, opts: VerifyOptions = {}): Promise<{ chain: string; uid: `0x${string}`; attester: string }[]> {
  const f = opts.fetch ?? fetch;
  const prefix = normalizeHash(hash).toLowerCase();
  const query = `query($schema: String!, $prefix: String!) {
    attestations(where: { schemaId: { equals: $schema }, data: { startsWith: $prefix }, revoked: { equals: false } }, orderBy: [{ time: asc }], take: 20) { id attester }
  }`;
  const found: { chain: string; uid: `0x${string}`; attester: string }[] = [];
  for (const key of opts.chains ?? LOOKUP_CHAINS) {
    const chain = CHAINS[key];
    if (!chain) continue;
    try {
      const res = await f(`${chain.easscan}/graphql`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ query, variables: { schema: schemaUid(), prefix } }),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as { data?: { attestations?: { id: `0x${string}`; attester: string }[] } };
      for (const a of j.data?.attestations ?? []) found.push({ chain: key, uid: a.id, attester: a.attester });
    } catch { /* try the next chain */ }
  }
  return found;
}

export async function trustedWitnesses(opts: VerifyOptions = {}): Promise<string[]> {
  if (opts.trustedAttesters?.length) return opts.trustedAttesters.map((a) => getAddress(a));
  if (opts.lookup === "chain") return KNOWN_WITNESSES.map((a) => getAddress(a));
  const f = opts.fetch ?? fetch;
  const api = (opts.api ?? DEFAULT_API).replace(/\/$/, "");
  try {
    const res = await f(`${api}/.well-known/akashi.json`);
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { witnesses?: string[]; previousWitnesses?: string[] };
    const live = [...(j.witnesses ?? []), ...(j.previousWitnesses ?? [])].map((a) => getAddress(a));
    return [...new Set([...live, ...KNOWN_WITNESSES.map((a) => getAddress(a))])];
  } catch {
    // Akashi unreachable: fall back to the witnesses pinned in this package.
    return KNOWN_WITNESSES.map((a) => getAddress(a));
  }
}

export async function readAttestation(chainKey: string, uid: `0x${string}`, rpc?: string) {
  const chain = CHAINS[chainKey];
  if (!chain) throw new Error(`Unknown chain "${chainKey}"`);
  const client = createPublicClient({ transport: http(rpc ?? chain.rpc) });
  const a = await client.readContract({ address: chain.eas, abi: EAS_ABI, functionName: "getAttestation", args: [uid] });
  return { chain, attestation: a };
}

/**
 * Verify a fingerprint against the chain.
 * 1) find the attestation (Akashi lookup, or `uid` you supply), 2) read it from EAS on-chain,
 * 3) check schema, fingerprint, attester and (if present) the creator's wallet signature.
 */
export async function verifyHash(input: string, opts: VerifyOptions = {}): Promise<VerifyResult> {
  if (!isHash(normalizeHash(input))) return { status: "error", hash: input as `0x${string}`, message: "Not a SHA-256 fingerprint" };
  const hash = normalizeHash(input);
  try {
    let uid = opts.uid;
    let chainKey = opts.chain;
    let videoUrl: string | undefined;
    if (!uid) {
      const mode = opts.lookup ?? "auto";
      let viaAkashi: LookupResponse | null = null;
      if (mode !== "chain") {
        try { viaAkashi = await lookupProof(hash, opts); }
        catch (e) { if (mode === "akashi") throw e; }
      }
      if (viaAkashi) {
        if (!viaAkashi.found || !viaAkashi.uid || !viaAkashi.chain) {
          return { status: "not_found", hash, message: viaAkashi.found ? "This recording is known but its proof has not been anchored yet." : "No Akashi proof exists for this file. It may have been edited, re-encoded or never recorded with Akashi." };
        }
        uid = viaAkashi.uid;
        chainKey = viaAkashi.chain;
        videoUrl = viaAkashi.url;
      } else {
        // Trustless path: search the public EAS index, prefer an attestation from a trusted witness.
        const candidates = await lookupOnChain(hash, opts);
        const trusted = await trustedWitnesses(opts);
        const pick = candidates.find((c) => trusted.includes(getAddress(c.attester))) ?? candidates[0];
        if (!pick) return { status: "not_found", hash, message: "No Akashi proof was found on-chain for this file. It may have been edited, re-encoded or never recorded with Akashi." };
        uid = pick.uid;
        chainKey = pick.chain;
      }
    }
    if (!chainKey) throw new Error("`chain` is required when passing `uid`");

    const { chain, attestation } = await readAttestation(chainKey, uid, opts.rpc);
    const base = { hash, chain, uid, videoUrl, attestationUrl: `${chain.easscan}/attestation/view/${uid}` };
    if (attestation.uid === "0x0000000000000000000000000000000000000000000000000000000000000000") {
      return { ...base, status: "not_found", message: "The attestation does not exist on-chain." };
    }
    if (attestation.schema.toLowerCase() !== schemaUid().toLowerCase()) {
      return { ...base, status: "untrusted", message: "The attestation uses a different schema than Akashi's." };
    }
    const proof = decodeProof(attestation.data as Hex);
    const attester = getAddress(attestation.attester);
    const attestedAt = new Date(Number(attestation.time) * 1000);
    if (attestation.revocationTime > 0n) return { ...base, proof, attester, attestedAt, status: "revoked", message: "This attestation was revoked." };
    if (proof.contentHash !== hash) return { ...base, proof, attester, attestedAt, status: "mismatch", message: "The on-chain fingerprint does not match this file." };

    const trusted = await trustedWitnesses(opts);
    if (!trusted.includes(attester)) return { ...base, proof, attester, attestedAt, status: "untrusted", message: `Attested by ${attester}, which is not a trusted Akashi witness.` };

    let creatorVerified: boolean | undefined;
    if (proof.creator !== ZERO_ADDRESS && proof.creatorSig && proof.creatorSig !== "0x") {
      const recovered = await recoverCreator(
        { contentHash: proof.contentHash, sizeBytes: proof.sizeBytes, durationMs: proof.durationMs, recordedAt: proof.recordedAt, videoId: proof.videoId },
        proof.creatorSig,
      );
      creatorVerified = !!recovered && getAddress(recovered) === proof.creator;
    }
    return {
      ...base, proof, attester, attestedAt, creatorVerified, status: "verified",
      message: creatorVerified ? `Verified. Witnessed by Akashi and co-signed by ${proof.creator}.` : "Verified. Witnessed by Akashi — unchanged since recording.",
    };
  } catch (e) {
    return { status: "error", hash, message: e instanceof Error ? e.message : String(e) };
  }
}
