/**
 * Sibyl — Milestone 4: First Agent-to-Agent Payment
 *
 * What this proves:
 *   • x402 Payment Required protocol — Analyst advertises a price, Trader
 *     parses it and executes accordingly (not just scripted token transfer)
 *   • Kite AA userOp — Trader submits a real ERC-4337 userOp through Kite's
 *     bundler; the on-chain tx is verifiable by anyone on KiteScan
 *   • On-chain payment verification — Analyst reads the Kite L1 tx receipt
 *     and checks the Transfer event before releasing the signal; zero trust
 *   • Agent autonomy — zero human interaction after the script starts
 *
 * Run: pnpm day1:x402
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import chalk from 'chalk';
import { startAnalystServer } from '../services/analyst/server.js';
import { buySignal } from '../services/trader/buyer.js';
import { getAgent } from '../services/kite/registry.js';
import { AGENT_ROLES } from '../services/kite/identities.js';
import type { TradingSignal } from '../services/analyst/signal.js';

const ANALYST_URL = 'http://localhost:8099';
const PAIR = 'BTCUSD';

// ─── Formatting helpers ───────────────────────────────────────────────────────

function renderSignal(s: TradingSignal): void {
  const actionColor =
    s.action === 'BUY'
      ? chalk.bold.green
      : s.action === 'SELL'
        ? chalk.bold.red
        : chalk.bold.yellow;

  console.log('');
  console.log(chalk.bold('  ┌─ Signal received ─────────────────────────────────────'));
  console.log(`  │  pair       ${chalk.bold(s.pair)}`);
  console.log(`  │  action     ${actionColor(s.action)}`);
  console.log(`  │  confidence ${chalk.bold(s.confidence + '%')}`);
  console.log(`  │  entry      $${s.entryPrice.toLocaleString()}`);
  console.log(`  │  target     $${s.targetPrice.toLocaleString()}`);
  console.log(`  │  stop       $${s.stopLoss.toLocaleString()}`);
  console.log(`  │  horizon    ${s.timeHorizon}`);
  console.log(`  │  regime     ${s.regime}`);
  console.log(`  │  rationale  ${s.rationale}`);
  console.log(`  │  generated  ${s.generatedAt}`);
  console.log('  └───────────────────────────────────────────────────────');
  console.log('');
}

function renderTimings(t: { payment_ms: number; signal_ms: number; total_ms: number }): void {
  console.log(
    chalk.dim(
      `  ⏱  payment: ${t.payment_ms}ms  |  signal delivery: ${t.signal_ms}ms  |  total: ${t.total_ms}ms`
    )
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.bold('\n━━━ Sibyl — Milestone 4: First Agent-to-Agent Payment ━━━\n'));

  // Load agent registry — use aaAddress (not .address)
  const analyst = getAgent(AGENT_ROLES.ANALYST);
  const trader = getAgent(AGENT_ROLES.TRADER);

  if (!analyst || !trader) {
    console.error(chalk.red('✗ Agent registry missing. Run pnpm day1:passport first.'));
    process.exit(1);
  }

  const rpcUrl = process.env.KITE_RPC_URL!;
  const bundlerUrl = process.env.KITE_BUNDLER_URL!;
  const usdtAddress = process.env.KITE_USDT_ADDRESS!;
  const privateKey = process.env.HACKATHON_PRIVATE_KEY!;

  console.log(`  Analyst AA:   ${chalk.cyan(analyst.aaAddress)}`);
  console.log(`  Trader AA:    ${chalk.cyan(trader.aaAddress)}`);
  console.log(`  Kite chain:   2368`);
  console.log(`  Pair:         ${PAIR}`);
  console.log('');

  // Start Analyst server
  console.log(chalk.bold('▸ Starting Analyst x402 server...'));
  const stopServer = await startAnalystServer({
    analystAddress: analyst.aaAddress,
    usdtAddress,
    rpcUrl,
  });

  // Give the server a moment to fully bind
  await new Promise((r) => setTimeout(r, 300));

  let exitCode = 0;

  try {
    console.log('');
    console.log(chalk.bold(`▸ Trader buying signal for ${PAIR}...`));
    console.log('');

    const result = await buySignal(ANALYST_URL, PAIR, {
      traderAAAddress: trader.aaAddress,
      analystAAAddress: analyst.aaAddress,
      usdtAddress,
      rpcUrl,
      bundlerUrl,
      signerPrivateKey: privateKey,
    });

    renderSignal(result.signal);

    console.log(chalk.bold('▸ Payment settled on Kite L1'));
    console.log(`  tx hash:  ${chalk.cyan(result.paymentTxHash)}`);
    console.log(
      `  kitescan: ${chalk.underline.blue('https://testnet.kitescan.ai/tx/' + result.paymentTxHash)}`
    );
    console.log('');

    console.log(chalk.bold('▸ Balance deltas (USDT)'));
    console.log(`  Trader   ${result.traderBalanceBefore}  →  ${result.traderBalanceAfter}`);
    console.log(`  Analyst  ${result.analystBalanceBefore}  →  ${result.analystBalanceAfter}`);
    console.log('');

    renderTimings(result.timings);

    console.log('');
    console.log(chalk.bold.green('✓ Milestone 4 complete'));
    console.log(chalk.dim('  First autonomous agent-to-agent payment, settled on Kite L1.'));
    console.log(chalk.dim('  Next: pnpm day1:attest — Milestone 5: Attestation'));
  } catch (err: any) {
    console.log('');
    console.log(chalk.bold.red('✗ Fatal error:'), err.message || err);
    console.log('');
    if (err.stack) {
      console.log(chalk.dim('  Stack:'), err.stack.split('\n').slice(0, 5).join('\n  '));
    }
    exitCode = 1;
  }

  console.log('');
  console.log(chalk.dim('▸ Stopping Analyst server...'));
  await stopServer();

  process.exit(exitCode);
}

main().catch((err) => {
  console.error(chalk.red('\n✗ Top-level crash:'), err);
  process.exit(1);
});
