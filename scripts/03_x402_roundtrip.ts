/**
 * Sibyl — Day 1 Milestone 4: First agent-to-agent x402 Payment
 *
 * This is the big one. Runs a complete economic round-trip:
 *
 *   1. Start Analyst's x402 server on localhost:8099
 *   2. Trader hits Analyst without payment → receives 402 Payment Required
 *   3. Trader builds EIP-712 TransferWithAuthorization, signs it with EOA
 *   4. Trader resends with X-Payment header
 *   5. Analyst verifies, calls Pieverse facilitator /v2/settle
 *   6. Facilitator executes on-chain USDT transfer (Trader AA → Analyst AA)
 *   7. Analyst returns the signal payload
 *   8. Trader logs the signal
 *   9. Server shuts down
 *
 * If we see a signal come back with a valid settledTxHash, M4 is cleared.
 *
 * Run with: pnpm day1:x402
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import chalk from 'chalk';
import { formatUnits, Contract, JsonRpcProvider } from 'ethers';
import { getKiteContext, KITE_NETWORK } from '../services/kite/client.ts';
import { AGENT_ROLES } from '../services/kite/identities.ts';
import { getAgent } from '../services/kite/registry.ts';
import { startAnalystServer, stopAnalystServer, ANALYST_URL, PRICE_USDT } from '../services/analyst/server.ts';
import { buySignal } from '../services/trader/buyer.ts';
import { KITE_ADDRESSES } from '../services/kite/kitepass.ts';

const EXPLORER = process.env.KITE_EXPLORER || 'https://testnet.kitescan.ai';

const ERC20_READ_ABI = [
  'function balanceOf(address) view returns (uint256)',
];

async function usdtBalance(address: string): Promise<string> {
  const provider = new JsonRpcProvider(process.env.KITE_RPC_URL!);
  const usdt = new Contract(KITE_ADDRESSES.SETTLEMENT_TOKEN, ERC20_READ_ABI, provider);
  const raw = await usdt.balanceOf(address);
  return formatUnits(raw, 18);
}

async function main() {
  console.log(chalk.bold.cyan('\n━━━ Sibyl — Milestone 4: First Agent-to-Agent Payment ━━━\n'));

  // Load agent records from registry
  const analyst = getAgent(AGENT_ROLES.ANALYST);
  const trader = getAgent(AGENT_ROLES.TRADER);
  if (!analyst) throw new Error('Analyst not registered. Run Milestone 2.');
  if (!trader) throw new Error('Trader not registered. Run Milestone 2.');
  if (!trader.fundedTxHash) {
    throw new Error('Trader AA wallet not funded with USDT. Run Milestone 3.');
  }

  console.log(chalk.gray(`Analyst AA:  ${analyst.aaAddress}`));
  console.log(chalk.gray(`Trader AA:   ${trader.aaAddress}`));
  console.log(chalk.gray(`Kite chain:  ${KITE_NETWORK.chainId}`));
  console.log(chalk.gray(`Facilitator: ${process.env.KITE_FACILITATOR_URL}`));

  // Step 0 — balance check (the "before" snapshot)
  console.log(chalk.bold('\n▸ Balances before:'));
  const balAnalystBefore = await usdtBalance(analyst.aaAddress);
  const balTraderBefore = await usdtBalance(trader.aaAddress);
  console.log(chalk.gray(`  Analyst: ${balAnalystBefore} USDT`));
  console.log(chalk.gray(`  Trader:  ${balTraderBefore} USDT`));

  // Step 1 — start Analyst x402 server
  console.log(chalk.bold('\n▸ Starting Analyst x402 server...'));
  const server = await startAnalystServer(analyst);

  try {
    // Step 2–7 — run the buy flow
    console.log(chalk.bold(`\n▸ Trader buying signal from Analyst for ${PRICE_USDT} USDT...\n`));

    const ctx = await getKiteContext();
    const result = await buySignal({
      serviceUrl: ANALYST_URL,
      endpoint: '/api/signal?pair=BTC/USDT',
      trader,
      signerWallet: ctx.signer,
      chainId: BigInt(KITE_NETWORK.chainId),
    });

    if (!result.success) {
      console.log(chalk.red(`\n✗ buy flow failed: ${result.error}`));
      throw new Error(result.error || 'buy failed');
    }

    // Step 8 — display results
    console.log(chalk.bold.green('\n✓ Signal received!\n'));
    console.log(chalk.bold('  Signal:'));
    console.log(chalk.gray(`    id:         ${result.signal.id}`));
    console.log(chalk.gray(`    pair:       ${result.signal.pair}`));
    const actionColor =
      result.signal.action === 'BUY'
        ? chalk.green
        : result.signal.action === 'SELL'
          ? chalk.red
          : chalk.yellow;
    console.log(`    action:     ${actionColor.bold(result.signal.action)}`);
    console.log(chalk.gray(`    confidence: ${result.signal.confidence}`));
    console.log(chalk.gray(`    target:     $${result.signal.targetPrice}`));
    console.log(chalk.gray(`    stop:       $${result.signal.stopLoss}`));
    console.log(chalk.gray(`    regime:     ${result.signal.regime}`));
    console.log(chalk.gray(`    rationale:  ${result.signal.rationale}`));

    console.log(chalk.bold('\n  Payment:'));
    console.log(chalk.gray(`    amount:     ${result.paidAmount} USDT`));
    if (result.settledTxHash) {
      console.log(chalk.green(`    settled:    ${result.settledTxHash}`));
      console.log(chalk.gray(`    explorer:   ${EXPLORER}/tx/${result.settledTxHash}`));
    } else {
      console.log(chalk.yellow(`    settled:    (tx hash not returned by facilitator)`));
    }

    console.log(chalk.bold('\n  Timings:'));
    console.log(chalk.gray(`    402 fetch:     ${result.timings?.request402Ms}ms`));
    console.log(chalk.gray(`    sign auth:     ${result.timings?.signMs}ms`));
    console.log(chalk.gray(`    paid fetch:    ${result.timings?.requestPaidMs}ms`));
    console.log(chalk.gray(`    total:         ${result.timings?.totalMs}ms`));

    // Step 9 — balance check (the "after" snapshot)
    //  Wait 3s for settlement to propagate to RPC
    await new Promise((r) => setTimeout(r, 3000));
    console.log(chalk.bold('\n▸ Balances after:'));
    const balAnalystAfter = await usdtBalance(analyst.aaAddress);
    const balTraderAfter = await usdtBalance(trader.aaAddress);
    const analystDelta = Number(balAnalystAfter) - Number(balAnalystBefore);
    const traderDelta = Number(balTraderAfter) - Number(balTraderBefore);
    console.log(
      `  Analyst: ${balAnalystBefore} → ${balAnalystAfter} USDT  ${chalk.green(`(+${analystDelta.toFixed(3)})`)}`
    );
    console.log(
      `  Trader:  ${balTraderBefore} → ${balTraderAfter} USDT  ${chalk.red(`(${traderDelta.toFixed(3)})`)}`
    );

    if (Math.abs(analystDelta - Number(PRICE_USDT)) < 0.0001) {
      console.log(chalk.bold.green('\n━━━ Milestone 4 complete ━━━'));
      console.log(chalk.gray('\nOn-chain reality matches the protocol. First agent-to-agent payment shipped.'));
      console.log(chalk.gray('Next: pnpm day1:attest (Milestone 5 — post reputation attestation)\n'));
    } else {
      console.log(chalk.bold.yellow('\n⚠  Milestone 4 partial'));
      console.log(chalk.yellow('Payment flow completed but balance delta does not match expected.'));
      console.log(chalk.yellow('Settlement may still be propagating. Check KiteScan tx manually.\n'));
    }
  } finally {
    // Always tear down the server
    console.log(chalk.gray('\n▸ stopping Analyst server...'));
    await stopAnalystServer(server);
  }
}

main().catch((err) => {
  console.error(chalk.red('\n✗ Fatal error:'), err);
  process.exit(1);
});
