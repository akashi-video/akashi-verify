import { decodeAbiParameters, encodeAbiParameters, recoverTypedDataAddress, getAddress, type Hex } from "viem";
import { CREATOR_DOMAIN, CREATOR_TYPES, SCHEMA_PARAMS } from "./constants.js";

export interface ProofData {
  contentHash: `0x${string}`;
  sizeBytes: bigint;
  durationMs: number;
  recordedAt: bigint; // unix seconds
  videoId: string;
  creator: `0x${string}`; // zero address if the creator did not co-sign
  creatorSig: Hex; // "0x" if absent
}

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export function encodeProof(p: ProofData): Hex {
  return encodeAbiParameters(SCHEMA_PARAMS, [p.contentHash, p.sizeBytes, p.durationMs, p.recordedAt, p.videoId, p.creator, p.creatorSig]);
}

export function decodeProof(data: Hex): ProofData {
  const [contentHash, sizeBytes, durationMs, recordedAt, videoId, creator, creatorSig] = decodeAbiParameters(SCHEMA_PARAMS, data);
  return {
    contentHash: contentHash.toLowerCase() as `0x${string}`,
    sizeBytes,
    durationMs: Number(durationMs),
    recordedAt,
    videoId,
    creator: getAddress(creator),
    creatorSig,
  };
}

export interface RecordingClaim {
  contentHash: `0x${string}`;
  sizeBytes: bigint;
  durationMs: number;
  recordedAt: bigint;
  videoId: string;
}

export const creatorTypedData = (claim: RecordingClaim) =>
  ({ domain: CREATOR_DOMAIN, types: CREATOR_TYPES, primaryType: "Recording", message: claim }) as const;

/** Returns the address that produced `signature` over the claim, or null if malformed. */
export async function recoverCreator(claim: RecordingClaim, signature: Hex): Promise<`0x${string}` | null> {
  if (!signature || signature === "0x") return null;
  try {
    return await recoverTypedDataAddress({ ...creatorTypedData(claim), signature });
  } catch {
    return null;
  }
}
