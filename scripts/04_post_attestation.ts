// Load env FIRST
import { config } from 'dotenv';
config({ path: '.env.local' });

import { JsonRpcProvider, Wallet } from 'ethers';
import { readFileSync } from 'fs';
import { fetchBtcPrice, computeRealizedBps } from '../services/oracle/hermes';
import { getAgent, AGENT_ROLES } from '../services/kite/identities';
import { postAttestationDirectV2, fetchAnalystSummary } from '../services/kite/attestation';

function loadContracts() {
  return JSON.parse(readFileSync('.sibyl/contracts.json', 'utf-8')).contracts;
}

async function main() {
  // Validate private key BEFORE creating Wallet
  const privateKey = process.env.HACKATHON_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith('0x') || privateKey.length !== 66) {
    throw new Error(`Invalid HACKATHON_PRIVATE_KEY in .env.local:
  - Must start with 0x
  - Must be 64 hex chars + 0x prefix (66 total)
  - Current value: ${privateKey ? privateKey.slice(0, 10) + '...' : 'undefined'}`);
  }

  const provider = new JsonRpcProvider(process.env.KITE_RPC_URL!);
  const signer = new Wallet(privateKey, provider);

  const contracts = loadContracts();
  if (!contracts.SibylAttestationsV2) throw new Error('Deploy v2 first via pnpm day3:v2');
  const v2Addr = contracts.SibylAttestationsV2.address;

  const analyst = getAgent(AGENT_ROLES.ANALYST)!;
  console.log(`━━━ Sibyl — Milestone 5 (Pyth V2) ━━━`);
  console.log(`Contract: ${v2Addr}`);

  const entry = await fetchBtcPrice();
  await new Promise(r => setTimeout(r, 2000));
  const exit = await fetchBtcPrice();
  const bps = computeRealizedBps(entry.price, exit.price);
  const isWin = bps >= 0;
  const proofHash = exit.hash;

  console.log(`▸ Posting attestation on Kite L1...`);
  const result = await postAttestationDirectV2(
    signer,
    v2Addr,
    analyst.aaAddress,
    bps,
    14400,
    isWin ? 1 : 2,
    proofHash
  );
  
  console.log(`✓ posted`);
  console.log(`attestation id: ${result.id}`);
  console.log(`tx:             ${result.txHash}`);
  console.log(`→ https://testnet.kitescan.ai/tx/${result.txHash}`);

  const summary = await fetchAnalystSummary(process.env.KITE_RPC_URL!, v2Addr, analyst.aaAddress);
  console.log(`\n▸ Analyst reputation (on-chain):`);
  console.log(`┌─ Analyst: ${analyst.aaAddress} ─┐`);
  console.log(`│  attestations  ${summary.total}`);
  console.log(`│  wins          ${summary.wins}`);
  console.log(`│  losses        ${summary.losses}`);
  console.log(`│  hit rate      ${summary.total > 0 ? (summary.wins / summary.total * 100).toFixed(1) : '0.0'}%`);
  console.log(`│  avg realized  ${summary.avgBps > 0 ? '+' : ''}${summary.avgBps} bps`);
  console.log(`│  cumulative    ${summary.cumulativeBps > 0 ? '+' : ''}${summary.cumulativeBps} bps`);
  console.log(`└─────────────────────────────────┘`);
  console.log(`✓ Milestone 5 complete`);
}

main().catch((e) => { console.error(e); process.exit(1); });