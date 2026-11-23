import { encodePacked, keccak256 } from "viem";

/** The Akashi proof schema, as registered in the EAS SchemaRegistry. */
export const SCHEMA =
  "bytes32 contentHash,uint64 sizeBytes,uint32 durationMs,uint64 recordedAt,string videoId,address creator,bytes creatorSig" as const;
export const SCHEMA_RESOLVER = "0x0000000000000000000000000000000000000000" as const;
export const SCHEMA_REVOCABLE = false;

/** EAS schema UIDs are deterministic: keccak256(abi.encodePacked(schema, resolver, revocable)). */
export function schemaUid(schema: string = SCHEMA, resolver: `0x${string}` = SCHEMA_RESOLVER, revocable = SCHEMA_REVOCABLE): `0x${string}` {
  return keccak256(encodePacked(["string", "address", "bool"], [schema, resolver, revocable]));
}

export const SCHEMA_PARAMS = [
  { name: "contentHash", type: "bytes32" },
  { name: "sizeBytes", type: "uint64" },
  { name: "durationMs", type: "uint32" },
  { name: "recordedAt", type: "uint64" },
  { name: "videoId", type: "string" },
  { name: "creator", type: "address" },
  { name: "creatorSig", type: "bytes" },
] as const;

/** EIP-712 typed data a creator's wallet signs (optional co-signature). */
export const CREATOR_DOMAIN = { name: "Akashi", version: "1" } as const;
export const CREATOR_TYPES = {
  Recording: [
    { name: "contentHash", type: "bytes32" },
    { name: "sizeBytes", type: "uint64" },
    { name: "durationMs", type: "uint32" },
    { name: "recordedAt", type: "uint64" },
    { name: "videoId", type: "string" },
  ],
} as const;

export interface ChainInfo {
  key: string;
  name: string;
  chainId: number;
  rpc: string;
  eas: `0x${string}`;
  easscan: string;
}

const OP_EAS = "0x4200000000000000000000000000000000000021" as const;

/** Chains the verifier knows about. Override any RPC with the `rpc` option. */
export const CHAINS: Record<string, ChainInfo> = {
  "base-sepolia": { key: "base-sepolia", name: "Base Sepolia", chainId: 84532, rpc: "https://sepolia.base.org", eas: OP_EAS, easscan: "https://base-sepolia.easscan.org" },
  base: { key: "base", name: "Base", chainId: 8453, rpc: "https://mainnet.base.org", eas: OP_EAS, easscan: "https://base.easscan.org" },
  "optimism-sepolia": { key: "optimism-sepolia", name: "OP Sepolia", chainId: 11155420, rpc: "https://sepolia.optimism.io", eas: OP_EAS, easscan: "https://optimism-sepolia.easscan.org" },
  optimism: { key: "optimism", name: "Optimism", chainId: 10, rpc: "https://mainnet.optimism.io", eas: OP_EAS, easscan: "https://optimism.easscan.org" },
  sepolia: { key: "sepolia", name: "Ethereum Sepolia", chainId: 11155111, rpc: "https://ethereum-sepolia-rpc.publicnode.com", eas: "0xC2679fBD37d54388Ce493F1DB75320D236e1815e", easscan: "https://sepolia.easscan.org" },
  ethereum: { key: "ethereum", name: "Ethereum", chainId: 1, rpc: "https://ethereum-rpc.publicnode.com", eas: "0xA1207F3BBa224E2c9c3c6D5aF63D0eb1582Ce587", easscan: "https://easscan.org" },
  arbitrum: { key: "arbitrum", name: "Arbitrum One", chainId: 42161, rpc: "https://arb1.arbitrum.io/rpc", eas: "0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458", easscan: "https://arbitrum.easscan.org" },
};

export const DEFAULT_API = "https://akashi.video";

export const EAS_ABI = [
  {
    type: "function",
    name: "getAttestation",
    stateMutability: "view",
    inputs: [{ name: "uid", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "uid", type: "bytes32" },
          { name: "schema", type: "bytes32" },
          { name: "time", type: "uint64" },
          { name: "expirationTime", type: "uint64" },
          { name: "revocationTime", type: "uint64" },
          { name: "refUID", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "attester", type: "address" },
          { name: "revocable", type: "bool" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "attest",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "event",
    name: "Attested",
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "attester", type: "address", indexed: true },
      { name: "uid", type: "bytes32", indexed: false },
      { name: "schemaUID", type: "bytes32", indexed: true },
    ],
  },
] as const;

export const SCHEMA_REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schema", type: "string" },
      { name: "resolver", type: "address" },
      { name: "revocable", type: "bool" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "getSchema",
    stateMutability: "view",
    inputs: [{ name: "uid", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "uid", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "revocable", type: "bool" },
          { name: "schema", type: "string" },
        ],
      },
    ],
  },
] as const;

/**
 * Akashi witness addresses, pinned in this package so verification still works if akashi.video
 * is unreachable. The live list is published at https://akashi.video/.well-known/akashi.json.
 */
export const KNOWN_WITNESSES: readonly `0x${string}`[] = [
  "0x371776D39A598d2Cc56Bc36920FFbD2Bc9622B94",
];

/** Chains searched (newest first) when looking a fingerprint up directly on-chain. */
export const LOOKUP_CHAINS = ["base", "base-sepolia"] as const;
