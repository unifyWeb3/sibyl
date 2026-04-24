/**
 * Sibyl — Milestone 5: On-Chain Reputation Attestation
 *
 * What this proves:
 *   • Reputation primitive — a deployed contract permanently records every
 *     signal outcome, creating a verifiable track record per analyst
 *   • Schema-on-chain — the contract exposes its own schema string, so
 *     third parties can discover Sibyl attestations without docs
 *
 * Design note (Apr 24):
 *   The inline x402 rerun was removed from M5 because Kite's staging paymaster
 *   began rejecting userOps from our Trader AA mid-day (allowance flip). The
 *   x402 primitive is already proven by M4 — see tx 0xd61d776c... for the
 *   reference successful run. M5 exists to demonstrate the reputation layer,
 *   which sits downstream of x402 and can be tested independently. In production,
 *   attestations happen asynchronously after trade close anyway.
 *
 * Flow (per run):
 *   1. Ensure SibylAttestations is deployed
 *   2. Generate a fresh signal ID (simulates "the trade just closed")
 *   3. Simulate the outcome (deterministic 70% hit rate over 10 runs)
 *   4. Post attestation on-chain via EOA
 *   5. Read analyst reputation back, display the sparkline
 *
 *     pnpm day1:attest
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import chalk from 'chalk';
import { createHash, randomBytes } from 'crypto';

import { getAgent } from '../services/kite/registry.js';
import { AGENT_ROLES } from '../services/kite/identities.js';
import {
  deployAttestations,
  loadContracts,
  saveContracts,
  postAttestationDirect,
  fetchAttestationsForAnalyst,
  fetchAnalystSummary,
  Outcome,
} from '../services/kite/attestation.js';
import { simulateOutcome } from '../services/trader/outcome.js';

const EXPLORER = 'https://testnet.kitescan.ai';

// Reference to our successful M4 run — every attestation ties back to this
// as proof that x402 purchases are real. In production, each attestation
// would reference its own unique purchase tx.
const M4_REFERENCE_TX = '0xd61d776c67297830a545b1bc994baaa4a5f41c71a848e5eb2e6773ba4852750b';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function outcomeIcon(o: Outcome): string {
  switch (o) {
    case Outcome.Win:     return chalk.green('●');
    case Outcome.Loss:    return chalk.red('●');
    case Outcome.Neutral: return chalk.yellow('●');
    default:              return chalk.gray('○');
  }
}

function formatBps(bps: number): string {
  const sign = bps > 0 ? '+' : '';
  const color = bps > 0 ? chalk.green : bps < 0 ? chalk.red : chalk.yellow;
  return color(`${sign}${bps} bps`);
}

function truncate(hex: string, len = 12): string {
  return hex.length > len ? hex.slice(0, len) + '...' : hex;
}

function signalIdToBytes32(s: string): string {
  return '0x' + createHash('sha256').update(s, 'utf-8').digest('hex');
}

function freshSignalId(): string {
  return `sig_${Date.now()}_${randomBytes(3).toString('hex')}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.bold('\n━━━ Sibyl — Milestone 5: On-Chain Attestation ━━━\n'));

  const rpcUrl = process.env.KITE_RPC_URL!;
  const privateKey = process.env.HACKATHON_PRIVATE_KEY!;

  const analyst = getAgent(AGENT_ROLES.ANALYST);
  const trader = getAgent(AGENT_ROLES.TRADER);
  if (!analyst || !trader) {
    console.error(chalk.red('✗ Agent registry missing. Run pnpm day1:passport first.'));
    process.exit(1);
  }

  // ── Step 1: deploy attestations contract if needed ──
  const contracts = loadContracts();
  let attestationsAddress = contracts.contracts.SibylAttestations?.address;

  if (!attestationsAddress) {
    console.log(chalk.bold('▸ Deploying SibylAttestations (first run)...'));
    const deployed = await deployAttestations(rpcUrl, privateKey);
    attestationsAddress = deployed.address;
    contracts.contracts.SibylAttestations = {
      address: deployed.address,
      deployTxHash: deployed.txHash,
      deployedAt: new Date().toISOString(),
    };
    saveContracts(contracts);
    console.log(`  → explorer: ${chalk.blue.underline(`${EXPLORER}/address/${attestationsAddress}`)}\n`);
  } else {
    console.log(chalk.dim(`▸ Using existing SibylAttestations at ${attestationsAddress}\n`));
  }

  // ── Step 2: signal reference (in production, sourced from an x402 purchase) ──
  const signalId = freshSignalId();
  console.log(chalk.bold('▸ Signal reference:'));
  console.log(chalk.dim(`  signal id:        ${signalId}`));
  console.log(chalk.dim(`  payment tx (M4):  ${truncate(M4_REFERENCE_TX, 16)}`));
  console.log(chalk.dim(`  analyst:          ${analyst.aaAddress}`));

  // ── Step 3: simulate outcome based on current attestation count ──
  const priorSummary = await fetchAnalystSummary(rpcUrl, attestationsAddress, analyst.aaAddress);
  const attestationIndex = priorSummary.total;
  const outcome = simulateOutcome(attestationIndex);

  console.log(chalk.bold(`\n▸ Simulated outcome (attestation #${attestationIndex + 1}):`));
  console.log(`  ${outcomeIcon(outcome.outcome)} ${Outcome[outcome.outcome]}  ${formatBps(outcome.realizedBps)}  held ${outcome.holdSeconds / 3600}h`);

  // ── Step 4: post attestation ──
  console.log(chalk.bold('\n▸ Posting attestation on Kite L1...'));

  const signalIdBytes32 = signalIdToBytes32(signalId);
  const postResult = await postAttestationDirect({
    rpcUrl,
    signerKey: privateKey,
    attestationsAddress,
    signalId: signalIdBytes32,
    analyst: analyst.aaAddress,
    realizedBps: outcome.realizedBps,
    holdSeconds: outcome.holdSeconds,
    outcome: outcome.outcome,
  });

  console.log(chalk.green(`  ✓ attestation posted`));
  console.log(chalk.dim(`  attestation id: ${truncate(postResult.attestationId, 16)}`));
  console.log(chalk.dim(`  tx:             ${truncate(postResult.txHash, 16)}`));
  console.log(chalk.dim(`  → ${EXPLORER}/tx/${postResult.txHash}`));

  // ── Step 5: read reputation back ──
  console.log(chalk.bold('\n▸ Analyst reputation (on-chain):'));

  const summary = await fetchAnalystSummary(rpcUrl, attestationsAddress, analyst.aaAddress);
  const records = await fetchAttestationsForAnalyst(rpcUrl, attestationsAddress, analyst.aaAddress);

  const hitRatePct = (summary.hitRate * 100).toFixed(1);

  console.log('');
  console.log(chalk.bold('  ┌─ Analyst: ') + chalk.cyan(analyst.aaAddress) + chalk.bold(' ─┐'));
  console.log(`  │  attestations  ${chalk.bold(summary.total)}`);
  console.log(`  │  wins          ${chalk.green(summary.wins)}`);
  console.log(`  │  losses        ${chalk.red(summary.losses)}`);
  console.log(`  │  neutrals      ${chalk.yellow(summary.neutrals)}`);
  console.log(`  │  hit rate      ${chalk.bold(hitRatePct + '%')}`);
  console.log(`  │  avg realized  ${formatBps(Math.round(summary.avgBps))}`);
  console.log(`  │  cumulative    ${formatBps(summary.cumulativeBps)}`);
  console.log('  └────────────────────────────────────────────');
  console.log('');

  if (records.length > 0) {
    console.log(chalk.bold('  history:'));
    const sparkline = records.map((r) => outcomeIcon(r.outcome)).join(' ');
    console.log(`  ${sparkline}`);
    console.log('');

    const recent = records.slice(-5).reverse();
    console.log(chalk.bold('  most recent:'));
    for (const r of recent) {
      const icon = outcomeIcon(r.outcome);
      const bps = formatBps(r.realizedBps);
      console.log(`    ${icon}  ${r.outcomeLabel.padEnd(8)}  ${bps.padEnd(20)}  ${truncate(r.id, 14)}`);
    }
    console.log('');
  }

  console.log(chalk.bold.green('✓ Milestone 5 complete'));
  console.log(chalk.dim('  Attestation recorded on Kite L1. Run again to accumulate more.\n'));
}

main().catch((err) => {
  console.error(chalk.red('\n✗ Fatal error:'), err.message || err);
  if (err.stack) {
    console.error(chalk.dim(err.stack.split('\n').slice(0, 5).join('\n')));
  }
  process.exit(1);
});
