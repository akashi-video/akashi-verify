#!/usr/bin/env node
import { existsSync } from "node:fs";
import { hashFile, verifyHash, isHash, normalizeHash, type VerifyResult } from "./node.js";

const HELP = `akashi-verify — check an Akashi recording against the blockchain

Usage
  akashi-verify <file | 0xfingerprint> [options]

Options
  --uid <0x…>       check this EAS attestation directly (skips the Akashi lookup)
  --chain <key>     chain of the attestation (base, base-sepolia, optimism, …)
  --rpc <url>       custom RPC URL
  --api <url>       Akashi instance used for lookup (default https://akashi.video)
  --offline         never contact Akashi: find the proof via the public EAS index
                    and trust only the witnesses pinned in this package
  --witness <addr>  trust this witness address (repeatable; default: published list)
  --json            machine-readable output
  -h, --help        show this help

Exit codes: 0 verified · 1 not verified · 2 error`;

function arg(name: string, all = false): string | string[] | undefined {
  const out: string[] = [];
  const a = process.argv;
  for (let i = 0; i < a.length; i++) if (a[i] === name && a[i + 1]) out.push(a[i + 1]!);
  return all ? out : out[0];
}

const c = { g: "\x1b[32m", r: "\x1b[31m", y: "\x1b[33m", d: "\x1b[2m", b: "\x1b[1m", x: "\x1b[0m" };

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes("-h") || argv.includes("--help")) {
    console.log(HELP);
    process.exit(argv.length ? 0 : 2);
  }
  const FLAGS = new Set(["--json", "--offline"]);
  const target = argv.find((x, i) => !x.startsWith("--") && !(argv[i - 1]?.startsWith("--") && !FLAGS.has(argv[i - 1]!)))!;
  const json = argv.includes("--json");
  let hash: `0x${string}`;
  if (existsSync(target)) {
    if (!json) process.stdout.write(`${c.d}Hashing ${target}…${c.x}\n`);
    hash = await hashFile(target);
  } else if (isHash(normalizeHash(target))) {
    hash = normalizeHash(target);
  } else {
    console.error(`Not a file or a 0x… fingerprint: ${target}`);
    process.exit(2);
  }

  const result: VerifyResult = await verifyHash(hash, {
    uid: arg("--uid") as `0x${string}` | undefined,
    chain: arg("--chain") as string | undefined,
    rpc: arg("--rpc") as string | undefined,
    api: arg("--api") as string | undefined,
    trustedAttesters: (arg("--witness", true) as string[]).length ? (arg("--witness", true) as string[]) : undefined,
    lookup: argv.includes("--offline") ? "chain" : "auto",
  });

  if (json) {
    console.log(JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  } else {
    const ok = result.status === "verified";
    console.log(`\n${ok ? c.g + "✔ VERIFIED" : result.status === "error" ? c.y + "! ERROR" : c.r + "✘ NOT VERIFIED"}${c.x}  ${result.message}`);
    console.log(`${c.d}fingerprint${c.x}  ${hash}`);
    if (result.chain) console.log(`${c.d}chain${c.x}        ${result.chain.name}`);
    if (result.uid) console.log(`${c.d}attestation${c.x}  ${result.uid}`);
    if (result.attester) console.log(`${c.d}witness${c.x}      ${result.attester}`);
    if (result.attestedAt) console.log(`${c.d}anchored${c.x}     ${result.attestedAt.toISOString()}`);
    if (result.proof) {
      console.log(`${c.d}recorded${c.x}     ${new Date(Number(result.proof.recordedAt) * 1000).toISOString()}`);
      console.log(`${c.d}duration${c.x}     ${(result.proof.durationMs / 1000).toFixed(1)}s · ${result.proof.sizeBytes} bytes`);
      if (result.creatorVerified !== undefined) console.log(`${c.d}co-signer${c.x}    ${result.proof.creator} ${result.creatorVerified ? c.g + "(signature valid)" : c.r + "(signature INVALID)"}${c.x}`);
    }
    if (result.attestationUrl) console.log(`${c.d}explorer${c.x}     ${result.attestationUrl}`);
    if (result.videoUrl) console.log(`${c.d}video${c.x}        ${result.videoUrl}`);
    console.log("");
  }
  process.exit(result.status === "verified" ? 0 : result.status === "error" ? 2 : 1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
