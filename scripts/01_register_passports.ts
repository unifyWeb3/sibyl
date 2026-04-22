/**
 * Sibyl — Day 1 Milestone 2: Register Agent Passports
 *
 * Deploys three ERC-4337 AA wallets on Kite testnet, one per agent role.
 * Each AA wallet IS the "Agent Passport" at the contract layer — a stable,
 * verifiable on-chain identity for Analyst, Trader, and Guardian.
 *
 * Flow:
 *   1. For each role, compute the deterministic AA address via getAccountAddress
 *      (salt-based — reruns produce same addresses)
 *   2. Check if already deployed (isAccountDeloyed); skip if yes
 *   3. Deploy by sending a trivial userOp (e.g., self-call to 0x)
 *      — the SDK wraps deployment + initCode into the first userOp automatically
 *   4. Persist addresses + tx hashes to .sibyl/agents.json
 *
 * Run with: pnpm day1:passport
 *
 * What success looks like:
 *   - Three AA addresses printed
 *   - Three txs visible on https://testnet.kitescan.ai
 *   - .sibyl/agents.json populated with all three records
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import chalk from 'chalk';
import { ZeroAddress } from 'ethers';
import { getKiteContext, KITE_NETWORK } from '../services/kite/client.ts';
import {
  AGENT_ROLES,
  AGENT_SALTS,
  AGENT_DESCRIPTIONS,
  type AgentRole,
} from '../services/kite/identities.ts';
import { loadRegistry, createAgent, type AgentRecord } from '../services/kite/registry.ts';

const EXPLORER = process.env.KITE_EXPLORER || 'https://testnet.kitescan.ai';

async function registerAgent(
  role: AgentRole,
  ctx: Awaited<ReturnType<typeof getKiteContext>>
): Promise<AgentRecord> {
  const { sdk, signerAddress, signFunction } = ctx;
  const salt = AGENT_SALTS[role];

  console.log(chalk.bold(`\n▸ ${role.toUpperCase()}`));
  console.log(chalk.gray(`  ${AGENT_DESCRIPTIONS[role]}`));

  // Step 1 — compute deterministic AA address
  const aaAddress = await sdk.getAccountAddress(signerAddress, salt);
  console.log(chalk.gray(`  AA address: ${aaAddress}`));
  console.log(chalk.gray(`  salt:       ${salt}`));

  // Step 2 — already deployed?
  const alreadyDeployed = await sdk.isAccountDeloyed(aaAddress);
  if (alreadyDeployed) {
    console.log(chalk.yellow(`  ⚠  Already deployed — skipping`));
    const existing = loadRegistry().agents[role];
    const record: AgentRecord = {
      role,
      eoaSigner: signerAddress,
      aaAddress,
      salt: salt.toString(),
      deployed: true,
      deployedAt: existing?.deployedAt || new Date().toISOString(),
      deployTxHash: existing?.deployTxHash,
    };
    createAgent(role, record);
    return record;
  }

  // Step 3 — deploy by sending a no-op userOp to itself.
  // This forces the factory to deploy the AA wallet via initCode.
  console.log(chalk.gray(`  deploying (may take ~10-20s)...`));

  const request = {
    target: aaAddress,   // self-call, trivial
    value: 0n,
    callData: '0x',
  };

  const result = await sdk.sendUserOperationAndWait(
    signerAddress,
    request,
    signFunction,
    salt
  );

  if (result.status?.status !== 'success') {
    const reason = result.status?.reason || 'unknown';
    throw new Error(`Deployment failed for ${role}: ${reason}`);
  }

  const txHash = result.status.transactionHash;
  console.log(chalk.green(`  ✓ Deployed`));
  console.log(chalk.gray(`  tx:         ${txHash}`));
  console.log(chalk.gray(`  explorer:   ${EXPLORER}/tx/${txHash}`));

  const record: AgentRecord = {
    role,
    eoaSigner: signerAddress,
    aaAddress,
    salt: salt.toString(),
    deployed: true,
    deployedAt: new Date().toISOString(),
    deployTxHash: txHash,
  };
  createAgent(role, record);
  return record;
}

async function main() {
  console.log(chalk.bold.cyan('\n━━━ Sibyl — Milestone 2: Register Passports ━━━\n'));

  const ctx = await getKiteContext();
  console.log(chalk.gray(`EOA signer:   ${ctx.signerAddress}`));
  console.log(chalk.gray(`Network:      kite_testnet (chain ${KITE_NETWORK.chainId})`));
  console.log(chalk.gray(`Factory:      ${KITE_NETWORK.accountFactory}`));

  const roles: AgentRole[] = [
    AGENT_ROLES.ANALYST,
    AGENT_ROLES.TRADER,
    AGENT_ROLES.GUARDIAN,
  ];

  const records: AgentRecord[] = [];
  for (const role of roles) {
    const record = await registerAgent(role, ctx);
    records.push(record);
  }

  // Summary
  console.log(chalk.bold.green('\n━━━ Milestone 2 complete ━━━\n'));
  console.log(chalk.bold('Registered agents:'));
  for (const r of records) {
    console.log(
      `  ${chalk.cyan(r.role.padEnd(10))} ${r.aaAddress}  ${chalk.gray(`(deployed: ${r.deployed})`)}`
    );
  }
  console.log(chalk.gray(`\nRegistry saved to: .sibyl/agents.json`));
  console.log(chalk.gray(`Next: pnpm day1:session (Milestone 3)\n`));
}

main().catch((err) => {
  console.error(chalk.red('\n✗ Fatal error:'), err);
  process.exit(1);
});
