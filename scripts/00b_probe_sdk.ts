/**
 * Sibyl — SDK Method Probe
 *
 * Run BEFORE pnpm day1:x402 to verify gokite-aa-sdk's createUserOperation
 * signature matches what payment.ts expects.
 *
 * Run: pnpm probe:sdk
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { GokiteAASDK } from 'gokite-aa-sdk';
import { JsonRpcProvider, Wallet, Interface, getBytes, parseUnits } from 'ethers';
import chalk from 'chalk';
import { getAgent } from '../services/kite/registry.js';
import { AGENT_ROLES } from '../services/kite/identities.js';

const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];

async function main() {
  console.log(chalk.bold('\n━━━ Sibyl — SDK Probe ━━━\n'));

  const rpcUrl = process.env.KITE_RPC_URL!;
  const bundlerUrl = process.env.KITE_BUNDLER_URL!;
  const privKey = process.env.HACKATHON_PRIVATE_KEY!;
  const usdt = process.env.KITE_USDT_ADDRESS!;

  const sdk = new GokiteAASDK('kite_testnet', rpcUrl, bundlerUrl);
  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(privKey, provider);

  const trader = getAgent(AGENT_ROLES.TRADER);
  const analyst = getAgent(AGENT_ROLES.ANALYST);

  if (!trader || !analyst) {
    console.log(chalk.red('  ✗ Registry missing. Run pnpm day1:passport first.'));
    process.exit(1);
  }

  const traderAA = trader.aaAddress;
  const analystAA = analyst.aaAddress;

  console.log(`  traderAA:  ${traderAA}`);
  console.log(`  analystAA: ${analystAA}`);
  console.log(`  USDT:      ${usdt}`);

  const iface = new Interface(ERC20_ABI);
  const transferData = iface.encodeFunctionData('transfer', [analystAA, parseUnits('0.001', 18)]);

  const signFn = async (h: string) => signer.signMessage(getBytes(h));

  // ─── Test 1: the 5-arg signature that payment.ts uses
  console.log(chalk.bold('\n  Test 1: createUserOperation(sender, target, value, data, signFn)'));
  try {
    const userOp = await sdk.createUserOperation(
      traderAA,
      usdt,
      BigInt(0),
      transferData,
      signFn
    );
    console.log(chalk.green('    ✓ OK — this is the signature payment.ts uses'));
    console.log(`    nonce:    ${userOp.nonce?.toString() ?? 'undefined'}`);
    console.log(`    callData: ${userOp.callData?.slice(0, 20) ?? 'undefined'}...`);
    console.log(`    sender:   ${userOp.sender ?? 'undefined'}`);
  } catch (e: any) {
    console.log(chalk.red('    ✗ failed:'), e.message);
  }

  // ─── Test 2: the M2 signature that known-works
  console.log(chalk.bold('\n  Test 2: sendUserOperationAndWait (the M2 style, known working)'));
  try {
    const methodExists = typeof (sdk as any).sendUserOperationAndWait === 'function';
    console.log(
      methodExists
        ? chalk.green('    ✓ method exists — fallback path is available if Test 1 fails')
        : chalk.red('    ✗ method missing')
    );
  } catch {
    console.log(chalk.red('    ✗ inspection failed'));
  }

  // ─── Test 3: buildCallData helper
  console.log(chalk.bold('\n  Test 3: buildCallData(target, value, data)'));
  try {
    const callData = await sdk.buildCallData(usdt, BigInt(0), transferData);
    console.log(chalk.green('    ✓ OK'));
    console.log(`    result: ${callData.slice(0, 20)}...`);
  } catch (e: any) {
    console.log(chalk.red('    ✗ failed:'), e.message);
  }

  console.log(chalk.bold('\n  Verdict:'));
  console.log(
    chalk.dim(
      '  If Test 1 passes, payment.ts will work as-is.\n' +
        '  If Test 1 fails but Test 2/3 pass, payment.ts needs to use sendUserOperationAndWait like M2 did.\n'
    )
  );
}

main().catch((err) => {
  console.error(chalk.red('\n✗ Probe crashed:'), err);
  process.exit(1);
});
