/**
 * Sibyl — Day 1 Milestone 1: Environment Sanity Check
 *
 * Verifies:
 *   1. All required env vars are set
 *   2. Kite testnet RPC is reachable
 *   3. Your wallet key matches your wallet address
 *   4. Wallet has nonzero KITE balance (for gas)
 *
 * Run with: pnpm check:env
 *
 * If this passes, we are ready for Milestone 2 (Passport registration).
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
import { JsonRpcProvider, Wallet, Contract, formatUnits } from 'ethers';
import chalk from 'chalk';

const REQUIRED_VARS = [
  'KITE_RPC_URL',
  'KITE_BUNDLER_URL',
  'KITE_USDT_ADDRESS',
  'KITE_FACILITATOR_URL',
  'HACKATHON_PRIVATE_KEY',
  'HACKATHON_ADDRESS',
] as const;

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

async function main() {
  console.log(chalk.bold.cyan('\n━━━ Sibyl — Environment Check ━━━\n'));

  // Step 1 — env vars
  console.log(chalk.bold('▸ Checking env vars'));
  let allSet = true;
  for (const key of REQUIRED_VARS) {
    const value = process.env[key];
    if (!value) {
      console.log(chalk.red(`  ✗ ${key} is missing`));
      allSet = false;
    } else {
      const display = key.includes('KEY') ? chalk.gray('***set***') : chalk.gray(value);
      console.log(chalk.green(`  ✓ ${key}`), display);
    }
  }
  if (!allSet) {
    console.log(chalk.red('\n✗ Fill in .env.local first.\n'));
    process.exit(1);
  }

  // Step 2 — RPC reachability
  console.log(chalk.bold('\n▸ Pinging Kite testnet RPC'));
  const provider = new JsonRpcProvider(process.env.KITE_RPC_URL!);
  const network = await provider.getNetwork();
  const blockNumber = await provider.getBlockNumber();
  console.log(chalk.green(`  ✓ Connected`));
  console.log(chalk.gray(`    chain id: ${network.chainId}`));
  console.log(chalk.gray(`    current block: ${blockNumber}`));

  // Step 3 — key ↔ address match
  console.log(chalk.bold('\n▸ Verifying wallet key'));
  const wallet = new Wallet(process.env.HACKATHON_PRIVATE_KEY!, provider);
  const derivedAddr = await wallet.getAddress();
  const declaredAddr = process.env.HACKATHON_ADDRESS!;
  if (derivedAddr.toLowerCase() !== declaredAddr.toLowerCase()) {
    console.log(chalk.red(`  ✗ HACKATHON_ADDRESS doesn't match the address derived from your key`));
    console.log(chalk.gray(`    declared: ${declaredAddr}`));
    console.log(chalk.gray(`    derived:  ${derivedAddr}`));
    process.exit(1);
  }
  console.log(chalk.green(`  ✓ Key matches address`));
  console.log(chalk.gray(`    ${derivedAddr}`));

  // Step 4 — KITE balance
  console.log(chalk.bold('\n▸ Checking KITE (gas) balance'));
  const balance = await provider.getBalance(derivedAddr);
  const kiteAmount = formatUnits(balance, 18);
  if (balance === 0n) {
    console.log(chalk.yellow(`  ⚠ Zero KITE. Hit the faucet: https://faucet.gokite.ai/`));
  } else {
    console.log(chalk.green(`  ✓ ${kiteAmount} KITE`));
  }

  // Step 5 — USDT balance
  console.log(chalk.bold('\n▸ Checking Test USDT balance'));
  const usdt = new Contract(process.env.KITE_USDT_ADDRESS!, ERC20_ABI, provider);
  try {
    const [usdtBal, usdtDec, usdtSym] = await Promise.all([
      usdt.balanceOf(derivedAddr),
      usdt.decimals(),
      usdt.symbol(),
    ]);
    const usdtAmount = formatUnits(usdtBal, usdtDec);
    if (usdtBal === 0n) {
      console.log(chalk.yellow(`  ⚠ Zero ${usdtSym}. Faucet it too: https://faucet.gokite.ai/`));
    } else {
      console.log(chalk.green(`  ✓ ${usdtAmount} ${usdtSym}`));
    }
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ Could not read USDT balance (token may not be deployed at given address)`));
  }

  // Summary
  console.log(chalk.bold.green('\n━━━ Environment ready ━━━'));
  console.log(chalk.gray('Next: pnpm day1:passport (once Milestone 2 script is ready)\n'));
}

main().catch((err) => {
  console.error(chalk.red('\n✗ Fatal error:'), err);
  process.exit(1);
});
