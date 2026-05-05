/**
 * Deploy SibylSubscriptions to Kite testnet.
 *
 * Usage: pnpm tsx scripts/11_deploy_subscriptions.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import solc from 'solc';

const RPC_URL = process.env.KITE_RPC_URL ?? 'https://rpc-testnet.gokite.ai';
const USDT = process.env.KITE_USDT_ADDRESS ?? '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63';
const PRIVATE_KEY = process.env.HACKATHON_PRIVATE_KEY!;
if (!PRIVATE_KEY) throw new Error('HACKATHON_PRIVATE_KEY missing in .env.local');

const SOURCE = 'contracts/SibylSubscriptions.sol';

async function compile() {
  const source = readFileSync(SOURCE, 'utf-8');
  const input = {
    language: 'Solidity',
    sources: { 'SibylSubscriptions.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors) {
    const fatal = output.errors.filter((e: any) => e.severity === 'error');
    if (fatal.length) {
      console.error(fatal.map((e: any) => e.formattedMessage).join('\n'));
      throw new Error('Compilation failed');
    }
  }
  const c = output.contracts['SibylSubscriptions.sol']['SibylSubscriptions'];
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

async function main() {
  console.log('▸ Compiling SibylSubscriptions...');
  const { abi, bytecode } = await compile();
  console.log(`  bytecode: ${(bytecode.length / 2 - 1)} bytes`);

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log(`  deployer: ${wallet.address}`);
  console.log(`  balance:  ${(Number(balance) / 1e18).toFixed(6)} KITE`);
  console.log(`  USDT:     ${USDT}`);

  console.log('▸ Deploying...');
  const factory = new ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(USDT);
  const tx = contract.deploymentTransaction();
  console.log(`  tx: ${tx?.hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  address: ${address}`);

  // Persist
  const path = '.sibyl/contracts.json';
  let registry: any = { contracts: {} };
  if (existsSync(path)) registry = JSON.parse(readFileSync(path, 'utf-8'));
  if (!registry.contracts) registry.contracts = {};
  registry.contracts.SibylSubscriptions = {
    address,
    deployTxHash: tx?.hash,
    deployedAt: new Date().toISOString(),
    note: 'Subscription marketplace. 0.5 USDT per 30-day period per analyst.',
    pricePerPeriodWei: '500000000000000000', // 0.5 * 10^18
    periodSeconds: 30 * 24 * 3600,
  };
  writeFileSync(path, JSON.stringify(registry, null, 2));
  console.log(`▸ Saved to ${path}`);

  const newBalance = await provider.getBalance(wallet.address);
  const spent = (Number(balance) - Number(newBalance)) / 1e18;
  console.log(`✓ Deploy complete. Spent ${spent.toFixed(6)} KITE.`);
  console.log(`\nNext: pnpm tsx scripts/12_test_subscribe.ts to smoke-test the flow.`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
