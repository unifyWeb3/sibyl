/**
 * Deploy SibylAttestationsV2 to Kite testnet.
 *
 * V2 schema adds priceUpdateHash field. V1 stays at its address as historical
 * record. After deploy, .sibyl/contracts.json is updated with v2 address.
 *
 * Usage: pnpm tsx scripts/07_deploy_attestations_v2.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { JsonRpcProvider, Wallet, ContractFactory } from 'ethers';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import solc from 'solc';

const RPC_URL = process.env.KITE_RPC_URL ?? 'https://rpc-testnet.gokite.ai';
const PRIVATE_KEY = process.env.HACKATHON_PRIVATE_KEY!;
if (!PRIVATE_KEY) throw new Error('HACKATHON_PRIVATE_KEY missing in .env.local');

const SOURCE_PATH = 'contracts/SibylAttestationsV2.sol';

async function compile() {
  const source = readFileSync(SOURCE_PATH, 'utf-8');
  const input = {
    language: 'Solidity',
    sources: { 'SibylAttestationsV2.sol': { content: source } },
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
      throw new Error('Solidity compilation failed');
    }
  }
  const c = output.contracts['SibylAttestationsV2.sol']['SibylAttestationsV2'];
  return { abi: c.abi, bytecode: '0x' + c.evm.bytecode.object };
}

async function main() {
  console.log('▸ Compiling SibylAttestationsV2...');
  const { abi, bytecode } = await compile();
  console.log(`  bytecode: ${(bytecode.length / 2 - 1)} bytes`);

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const balance = await provider.getBalance(wallet.address);
  console.log(`  deployer: ${wallet.address}`);
  console.log(`  balance:  ${(Number(balance) / 1e18).toFixed(6)} KITE`);

  console.log('▸ Deploying...');
  const factory = new ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy();
  const tx = contract.deploymentTransaction();
  console.log(`  tx: ${tx?.hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  address: ${address}`);

  // Persist to .sibyl/contracts.json
  const path = '.sibyl/contracts.json';
  let registry: any = { contracts: {} };
  if (existsSync(path)) registry = JSON.parse(readFileSync(path, 'utf-8'));
  if (!registry.contracts) registry.contracts = {};
  registry.contracts.SibylAttestationsV2 = {
    address,
    deployTxHash: tx?.hash,
    deployedAt: new Date().toISOString(),
    note: 'V2 with priceUpdateHash field for Pyth/Hermes verification',
  };
  writeFileSync(path, JSON.stringify(registry, null, 2));
  console.log(`▸ Saved to ${path}`);

  const newBalance = await provider.getBalance(wallet.address);
  const spent = (Number(balance) - Number(newBalance)) / 1e18;
  console.log(`✓ Deploy complete. Spent ${spent.toFixed(6)} KITE.`);
  console.log(`\nNext: pnpm tsx scripts/08_first_pyth_attestation.ts`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
