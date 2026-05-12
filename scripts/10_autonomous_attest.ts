/**
 * Sibyl autonomous attestation — manual nonce management.
 *
 * Day 13a v2 fix:
 *   - Kite's RPC lags propagation. Ethers' built-in nonce cache desyncs
 *     after a few sequential sends → 'nonce has already been used' on
 *     transactions 9-10. Manual nonce management fixes this:
 *     fetch once, increment per success, re-fetch on revert.
 *   - Use sendTransaction with explicit nonce field (not contract.method calls
 *     which silently use the provider's cached nonce).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { JsonRpcProvider, Wallet, Contract, Interface, keccak256, toUtf8Bytes } from 'ethers';
import { readFileSync } from 'fs';
import {
  fetchLatestPrice,
  fetchPriceAt,
  realizedBps,
  classifyOutcome,
} from '../services/oracle/hermes';
import {
  derivePersonality,
  type Strategy,
} from '../services/personality';

const RPC_URL = process.env.KITE_RPC_URL ?? 'https://rpc-testnet.gokite.ai';
// Prefer ATTESTER_PRIVATE_KEY (cron/attestation operator wallet).
// Falls back to legacy HACKATHON_PRIVATE_KEY so existing deployments aren't broken.
const PRIVATE_KEY = process.env.ATTESTER_PRIVATE_KEY ?? process.env.HACKATHON_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('FATAL: ATTESTER_PRIVATE_KEY (or HACKATHON_PRIVATE_KEY) missing');
  process.exit(1);
}

const HOLD_SECONDS = 4 * 60 * 60;

function strategyFromIndex(i: number): Strategy {
  return (['Bear', 'Chaser', 'Reverter', 'Custom'] as const)[i] ?? 'Custom';
}

const ANALYSTS_ABI = [
  {
    type: 'function',
    name: 'analystsPaged',
    stateMutability: 'view',
    inputs: [
      { name: 'offset', type: 'uint256' },
      { name: 'limit', type: 'uint256' },
    ],
    outputs: [
      {
        type: 'tuple[]',
        components: [
          { name: 'aa', type: 'address' },
          { name: 'name', type: 'string' },
          { name: 'strategy', type: 'uint8' },
          { name: 'creator', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
        ],
      },
    ],
  },
];

const ATTESTATIONS_V2_ABI = [
  {
    type: 'function',
    name: 'postAttestation',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'signalId', type: 'bytes32' },
      { name: 'analyst', type: 'address' },
      { name: 'trader', type: 'address' },
      { name: 'realizedBps', type: 'int32' },
      { name: 'holdSeconds', type: 'uint32' },
      { name: 'outcome', type: 'uint8' },
      { name: 'priceUpdateHash', type: 'bytes32' },
    ],
    outputs: [{ type: 'bytes32' }],
  },
];

interface AttestResult {
  name: string;
  aa: string;
  status: 'ok' | 'fail';
  bias?: string;
  confidence?: number;
  reasoning?: string;
  bps?: number;
  outcome?: string;
  txHash?: string;
  error?: string;
}

async function main() {
  const startedAt = Date.now();
  console.log(`▸ Sibyl autonomous attestation — ${new Date().toISOString()}`);

  const contracts = JSON.parse(readFileSync('.sibyl/contracts.json', 'utf-8'));
  const v2Addr = contracts.contracts.SibylAttestationsV2?.address;
  const analystsAddr = contracts.contracts.SibylAnalysts?.address;
  if (!v2Addr || !analystsAddr) throw new Error('contracts missing');

  const agentsFile = JSON.parse(readFileSync('.sibyl/agents.json', 'utf-8'));
  const agents = agentsFile.agents ?? agentsFile;
  const traderAa = agents.trader.aaAddress;

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY!, provider);
  console.log(`▸ Posting attestations from operator wallet: ${wallet.address}`);
  const analystsContract = new Contract(analystsAddr, ANALYSTS_ABI, provider);

  // Encode postAttestation calls manually so we control the nonce
  const attestIface = new Interface(ATTESTATIONS_V2_ABI);

  // Pull both prices once
  console.log('\n▸ Fetching outcome price (now)...');
  const outcome = await fetchLatestPrice('BTC_USD');
  const outcomeT = outcome.price.publishTime;
  console.log(`  BTC: $${outcome.priceUsd.toFixed(2)} @ ${outcomeT}`);

  const entryT = outcomeT - HOLD_SECONDS;
  console.log(`▸ Fetching entry price at t=${entryT}...`);
  const entry = await fetchPriceAt(entryT, 'BTC_USD');
  console.log(`  BTC: $${entry.priceUsd.toFixed(2)} @ ${entry.price.publishTime}`);

  const movePct = ((outcome.priceUsd - entry.priceUsd) / entry.priceUsd) * 100;
  console.log(`  4h move: ${movePct.toFixed(3)}%\n`);

  const combinedHash = keccak256(
    toUtf8Bytes(`${entry.updateHash}|${outcome.updateHash}`)
  ) as `0x${string}`;

  console.log('▸ Reading analyst registry...');
  const analysts = (await analystsContract.analystsPaged(0n, 50n)) as readonly any[];
  console.log(`  ${analysts.length} analysts registered`);

  // Fetch starting nonce ONCE — we'll manage it manually from here
  let nonce = await provider.getTransactionCount(wallet.address, 'pending');
  console.log(`  starting nonce: ${nonce}\n`);

  const results: AttestResult[] = [];
  const snapshot = {
    entryUsd: entry.priceUsd,
    outcomeUsd: outcome.priceUsd,
    publishTime: outcomeT,
  };

  for (const a of analysts) {
    const strategy = strategyFromIndex(Number(a.strategy));
    const personality = derivePersonality(a.aa, strategy, snapshot);
    const { direction, bias, confidence, reasoning } = personality;

    const bps = realizedBps(entry.priceUsd, outcome.priceUsd, direction);
    const outcomeEnum = classifyOutcome(bps);
    const outcomeLabel = ['Pending', 'Win', 'Loss', 'Neutral'][outcomeEnum];

    const signalId = keccak256(
      toUtf8Bytes(`${a.aa}:${direction}:${outcomeT}:cron`)
    ) as `0x${string}`;

    console.log(
      `▸ ${a.name.padEnd(22)} ${strategy.padEnd(9)} ${bias.padEnd(7)} conf=${confidence}%  → ${
        bps > 0 ? '+' : ''
      }${bps} bps · ${outcomeLabel}`
    );
    console.log(`  "${reasoning}"`);

    const data = attestIface.encodeFunctionData('postAttestation', [
      signalId,
      a.aa,
      traderAa,
      bps,
      HOLD_SECONDS,
      outcomeEnum,
      combinedHash,
    ]);

    const txOk = await sendWithRetry(wallet, provider, {
      to: v2Addr,
      data,
      nonce,
    });

    if (txOk.success) {
      console.log(`  ✓ ${txOk.hash!.slice(0, 10)}... (nonce ${nonce})`);
      results.push({
        name: a.name,
        aa: a.aa,
        status: 'ok',
        bias,
        confidence,
        reasoning,
        bps,
        outcome: outcomeLabel,
        txHash: txOk.hash,
      });
      nonce++; // success → bump nonce
    } else {
      console.log(`  ✗ ${txOk.error}`);
      results.push({ name: a.name, aa: a.aa, status: 'fail', error: txOk.error });

      // On nonce desync, refresh from chain and retry the SAME analyst once
      if (txOk.error?.toLowerCase().includes('nonce')) {
        console.log(`  ↻ refreshing nonce from chain...`);
        nonce = await provider.getTransactionCount(wallet.address, 'pending');
        console.log(`  ↻ retry with nonce ${nonce}`);
        const retry = await sendWithRetry(wallet, provider, {
          to: v2Addr,
          data,
          nonce,
        });
        if (retry.success) {
          console.log(`  ✓ ${retry.hash!.slice(0, 10)}... (nonce ${nonce}) [retried]`);
          // Replace fail with ok
          results[results.length - 1] = {
            name: a.name,
            aa: a.aa,
            status: 'ok',
            bias,
            confidence,
            reasoning,
            bps,
            outcome: outcomeLabel,
            txHash: retry.hash,
          };
          nonce++;
        } else {
          console.log(`  ✗ retry also failed: ${retry.error}`);
        }
      }
    }

    // Small delay between writes — Kite RPC propagation
    await sleep(800);
  }

  const ok = results.filter((r) => r.status === 'ok').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`\n══════════════════════════════════════════`);
  console.log(`Posted ${ok}/${results.length} attestations · ${fail} failures · ${elapsedSec}s`);
  console.log(`Window: ${entry.priceUsd.toFixed(2)} → ${outcome.priceUsd.toFixed(2)} (${movePct.toFixed(2)}%)`);

  const biasCounts = results.reduce(
    (acc, r) => {
      if (r.bias) acc[r.bias] = (acc[r.bias] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  console.log(`Bias distribution:`, biasCounts);

  if (fail > 0) {
    console.log(`\nFailures:`);
    results.filter((r) => r.status === 'fail').forEach((r) => {
      console.log(`  ${r.name} (${r.aa}): ${r.error}`);
    });
  }

  if (ok === 0 && fail > 0) {
    console.error(`\n✗ All attestations failed — investigate.`);
    process.exit(1);
  }
}

interface SendResult { success: boolean; hash?: string; error?: string; }

async function sendWithRetry(
  wallet: Wallet,
  provider: JsonRpcProvider,
  txReq: { to: string; data: string; nonce: number }
): Promise<SendResult> {
  try {
    const tx = await wallet.sendTransaction({
      to: txReq.to,
      data: txReq.data,
      nonce: txReq.nonce,
    });
    await tx.wait(1);
    return { success: true, hash: tx.hash };
  } catch (err: any) {
    const msg = err?.shortMessage ?? err?.message ?? 'unknown';
    return { success: false, error: msg };
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error('FATAL:', e?.shortMessage ?? e?.message ?? e);
  process.exit(1);
});
