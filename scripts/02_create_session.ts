/**
 * Sibyl — Day 1 Milestone 3: Deploy KitePass Vaults + Configure Sessions
 *
 * For each of the three agents registered in Milestone 2:
 *   1. Deploy a ClientAgentVault ("KitePass") proxy — the on-chain spend vault
 *      owned by the agent's AA wallet
 *   2. Transfer some Test USDT from your EOA to the agent's AA wallet
 *      (Analyst gets nothing — it's receive-only)
 *   3. Configure role-specific spending rules on the KitePass
 *      (Trader: daily + per-tx + analyst-scoped; Guardian: 4h + per-tx)
 *   4. Read back the rules from chain and display them as a sanity check
 *
 * Run with: pnpm day1:session
 *
 * What success looks like:
 *   - Two KitePass proxy addresses (Trader + Guardian) printed and visible on KiteScan
 *     (Analyst has no rules to enforce, so we skip its vault for now)
 *   - USDT transferred from EOA → Trader AA, EOA → Guardian AA
 *   - setSpendingRules txs visible on KiteScan
 *   - Rules read back from chain match what we set
 *   - .sibyl/agents.json updated with kitepass addresses + tx hashes
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import chalk from 'chalk';
import { formatUnits } from 'ethers';
import { getKiteContext, KITE_NETWORK } from '../services/kite/client.ts';
import {
  AGENT_ROLES,
  AGENT_DESCRIPTIONS,
  type AgentRole,
} from '../services/kite/identities.ts';
import { getAgent, upsertAgent, getAllAgents } from '../services/kite/registry.ts';
import {
  deployKitePassForAgent,
  configureSpendingRules,
  viewSpendingRules,
  transferUsdtToAgent,
  KITE_ADDRESSES,
} from '../services/kite/kitepass.ts';
import { buildRulesFor, describeRule } from '../services/kite/rules.ts';

const EXPLORER = process.env.KITE_EXPLORER || 'https://testnet.kitescan.ai';

/** USDT amount to send to Trader and Guardian AA wallets */
const FUNDING_PER_AGENT: Record<AgentRole, string> = {
  analyst: '0',
  trader: '0.5',
  guardian: '0.5',
};

async function processAgent(
  role: AgentRole,
  ctx: Awaited<ReturnType<typeof getKiteContext>>
): Promise<void> {
  const agent = getAgent(role);
  if (!agent) {
    throw new Error(`Agent ${role} not in registry. Run Milestone 2 first.`);
  }

  console.log(chalk.bold.cyan(`\n━━━ ${role.toUpperCase()} ━━━`));
  console.log(chalk.gray(`  ${AGENT_DESCRIPTIONS[role]}`));
  console.log(chalk.gray(`  AA wallet:  ${agent.aaAddress}`));

  // Step 1 — Transfer USDT to AA wallet (skip analyst, which is receive-only)
  const fundingAmount = FUNDING_PER_AGENT[role];
  if (fundingAmount !== '0') {
    if (agent.fundedTxHash) {
      console.log(chalk.yellow(`  ⚠  Already funded (tx: ${agent.fundedTxHash.slice(0, 12)}...)`));
    } else {
      console.log(chalk.gray(`\n  ▸ Funding AA wallet with ${fundingAmount} Test USDT...`));
      const fundResult = await transferUsdtToAgent(
        ctx.signer,
        agent.aaAddress,
        fundingAmount
      );
      if (!fundResult.success) {
        throw new Error(`Funding ${role} failed: ${fundResult.error}`);
      }
      console.log(chalk.green(`    ✓ Funded`));
      console.log(chalk.gray(`    tx: ${EXPLORER}/tx/${fundResult.txHash}`));
      upsertAgent(role, {
        fundedUsdtAmount: fundingAmount,
        fundedTxHash: fundResult.txHash,
      });
    }
  } else {
    console.log(chalk.gray(`  (receive-only role; no funding needed)`));
  }

  // Analyst has no spending rules to configure. Skip the KitePass deploy step.
  const rules = buildRulesFor(role);
  if (rules.length === 0) {
    console.log(chalk.gray(`\n  (no spending rules for ${role}; skipping KitePass deploy)`));
    return;
  }

  // Step 2 — Deploy KitePass proxy (idempotent: skip if already deployed)
  let kitepassAddress = agent.kitepassAddress;
  if (kitepassAddress) {
    console.log(chalk.yellow(`\n  ⚠  KitePass already deployed: ${kitepassAddress}`));
  } else {
    console.log(chalk.gray(`\n  ▸ Deploying KitePass vault (~20-40s)...`));
    const deployResult = await deployKitePassForAgent(
      ctx.sdk,
      ctx.signerAddress,
      agent.aaAddress,
      BigInt(agent.salt),
      ctx.signFunction
    );
    if (!deployResult.success || !deployResult.proxyAddress) {
      throw new Error(`KitePass deploy for ${role} failed: ${deployResult.error}`);
    }
    kitepassAddress = deployResult.proxyAddress;
    console.log(chalk.green(`    ✓ KitePass deployed`));
    console.log(chalk.gray(`    address: ${kitepassAddress}`));
    console.log(chalk.gray(`    tx:      ${EXPLORER}/tx/${deployResult.txHash}`));
    console.log(chalk.gray(`    view:    ${EXPLORER}/address/${kitepassAddress}`));
    upsertAgent(role, {
      kitepassAddress,
      kitepassDeployTxHash: deployResult.txHash,
    });
  }

  // Step 3 — Configure spending rules (skip if already configured)
  if (agent.rulesConfiguredTxHash) {
    console.log(
      chalk.yellow(`  ⚠  Rules already configured (tx: ${agent.rulesConfiguredTxHash.slice(0, 12)}...)`)
    );
  } else {
    console.log(chalk.gray(`\n  ▸ Configuring ${rules.length} spending rule(s)...`));
    for (const rule of rules) {
      console.log(chalk.gray(`    • ${describeRule(rule)}`));
    }
    const rulesResult = await configureSpendingRules(
      ctx.sdk,
      ctx.signerAddress,
      agent.aaAddress,
      BigInt(agent.salt),
      kitepassAddress,
      rules,
      ctx.signFunction
    );
    if (!rulesResult.success) {
      throw new Error(`Rules config for ${role} failed: ${rulesResult.error}`);
    }
    console.log(chalk.green(`    ✓ Rules configured`));
    console.log(chalk.gray(`    tx: ${EXPLORER}/tx/${rulesResult.txHash}`));
    upsertAgent(role, { rulesConfiguredTxHash: rulesResult.txHash });
  }

  // Step 4 — Read back rules from chain for verification
  console.log(chalk.gray(`\n  ▸ Reading rules back from chain...`));
  const readback = await viewSpendingRules(kitepassAddress);
  if (!readback.success) {
    console.log(chalk.yellow(`    ⚠  Could not read rules: ${readback.error}`));
  } else {
    console.log(chalk.green(`    ✓ ${readback.rules.length} rule(s) on-chain:`));
    for (const entry of readback.rules) {
      const budget = formatUnits(entry.rule.budget, 18);
      const used = formatUnits(entry.usage.amountUsed, 18);
      console.log(chalk.gray(`      budget $${budget}  used $${used}  window ${entry.rule.timeWindow}s`));
    }
  }
}

async function main() {
  console.log(chalk.bold.cyan('\n━━━ Sibyl — Milestone 3: KitePass Vaults + Sessions ━━━\n'));

  const ctx = await getKiteContext();
  console.log(chalk.gray(`EOA signer:    ${ctx.signerAddress}`));
  console.log(chalk.gray(`Network:       kite_testnet (chain ${KITE_NETWORK.chainId})`));
  console.log(chalk.gray(`Vault impl:    ${KITE_ADDRESSES.CLIENT_AGENT_VAULT_IMPL}`));
  console.log(chalk.gray(`USDT token:    ${KITE_ADDRESSES.SETTLEMENT_TOKEN}`));

  const roles: AgentRole[] = [
    AGENT_ROLES.ANALYST,
    AGENT_ROLES.TRADER,
    AGENT_ROLES.GUARDIAN,
  ];

  for (const role of roles) {
    await processAgent(role, ctx);
  }

  // Summary
  console.log(chalk.bold.green('\n\n━━━ Milestone 3 complete ━━━\n'));
  console.log(chalk.bold('Agent vaults:'));
  for (const agent of getAllAgents()) {
    const vaultStatus = agent.kitepassAddress
      ? chalk.green(agent.kitepassAddress)
      : chalk.gray('(none — receive-only)');
    console.log(`  ${chalk.cyan(agent.role.padEnd(10))} ${vaultStatus}`);
  }
  console.log(chalk.gray(`\nRegistry saved to: .sibyl/agents.json`));
  console.log(chalk.gray(`Next: pnpm day1:x402 (Milestone 4 — first agent-to-agent payment)\n`));
}

main().catch((err) => {
  console.error(chalk.red('\n✗ Fatal error:'), err);
  process.exit(1);
});
