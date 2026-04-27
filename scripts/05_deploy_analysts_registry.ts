/**
 * Sibyl — Day 3: Deploy SibylAnalysts registry + back-register existing analyst
 *
 * Idempotent — running twice is safe:
 *   • If contract already deployed (in .sibyl/contracts.json), skips deploy
 *   • If existing analyst already registered, skips registration
 *
 * Usage: pnpm day3:registry
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import chalk from 'chalk';
import { JsonRpcProvider, Wallet, ContractFactory, Contract, Interface } from 'ethers';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

import { getAgent } from '../services/kite/registry.js';
import { AGENT_ROLES } from '../services/kite/identities.js';

const CONTRACTS_REGISTRY_PATH = '.sibyl/contracts.json';
const EXPLORER = 'https://testnet.kitescan.ai';

// Strategy enum mirror (matches Solidity)
enum Strategy {
  Bear = 0,
  Chaser = 1,
  Reverter = 2,
  Custom = 3,
}

const STRATEGY_NAMES: Record<number, string> = {
  0: 'Bear',
  1: 'Chaser',
  2: 'Reverter',
  3: 'Custom',
};

// ─── Compile ─────────────────────────────────────────────────────────────────

async function compileAnalysts(): Promise<{ abi: any[]; bytecode: string }> {
  const solcModule = await import('solc');
  const solc: any = (solcModule as any).default ?? solcModule;
  const source = readFileSync('contracts/SibylAnalysts.sol', 'utf-8');

  const input = {
    language: 'Solidity',
    sources: { 'SibylAnalysts.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const fatal = output.errors.filter((e: any) => e.severity === 'error');
    if (fatal.length) {
      throw new Error(
        'Compilation failed:\n' + fatal.map((e: any) => e.formattedMessage).join('\n')
      );
    }
  }

  const c = output.contracts['SibylAnalysts.sol']['SibylAnalysts'];
  return {
    abi: c.abi,
    bytecode: '0x' + c.evm.bytecode.object,
  };
}

// ─── Registry persistence ───────────────────────────────────────────────────

interface ContractRegistry {
  network: string;
  chainId: number;
  contracts: Record<string, { address: string; deployTxHash: string; deployedAt: string }>;
}

function loadContracts(): ContractRegistry {
  if (!existsSync(CONTRACTS_REGISTRY_PATH)) {
    return { network: 'kite_testnet', chainId: 2368, contracts: {} };
  }
  const raw = JSON.parse(readFileSync(CONTRACTS_REGISTRY_PATH, 'utf-8'));
  // Migrate old shape if needed
  if (!raw.contracts) raw.contracts = {};
  return raw;
}

function saveContracts(registry: ContractRegistry): void {
  const dir = dirname(CONTRACTS_REGISTRY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CONTRACTS_REGISTRY_PATH, JSON.stringify(registry, null, 2));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.bold('\n━━━ Sibyl — Day 3: Analyst Registry ━━━\n'));

  const rpcUrl = process.env.KITE_RPC_URL!;
  const privateKey = process.env.HACKATHON_PRIVATE_KEY!;

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  console.log(`  signer: ${wallet.address}`);

  const balance = await provider.getBalance(wallet.address);
  console.log(`  balance: ${(Number(balance) / 1e18).toFixed(6)} KITE\n`);

  // ── Step 1: deploy SibylAnalysts (idempotent) ──
  let contracts = loadContracts();
  let analystsAddress = contracts.contracts.SibylAnalysts?.address;
  let abi: any[];

  if (analystsAddress) {
    console.log(chalk.dim(`▸ SibylAnalysts already deployed at ${analystsAddress}\n`));
    abi = (await compileAnalysts()).abi;
  } else {
    console.log(chalk.bold('▸ Deploying SibylAnalysts...'));
    const compiled = await compileAnalysts();
    abi = compiled.abi;

    const factory = new ContractFactory(compiled.abi, compiled.bytecode, wallet);
    const contract = await factory.deploy();
    const tx = contract.deploymentTransaction();
    if (!tx) throw new Error('no deployment tx');
    console.log(chalk.dim(`  deploy tx: ${tx.hash}`));

    await contract.waitForDeployment();
    analystsAddress = await contract.getAddress();

    contracts.contracts.SibylAnalysts = {
      address: analystsAddress,
      deployTxHash: tx.hash,
      deployedAt: new Date().toISOString(),
    };
    saveContracts(contracts);

    console.log(chalk.green(`  ✓ deployed at ${analystsAddress}`));
    console.log(chalk.dim(`  → ${EXPLORER}/address/${analystsAddress}\n`));
  }

  const registry = new Contract(analystsAddress, abi, wallet);

  // ── Step 2: back-register existing Analyst (idempotent) ──
  const existingAnalyst = getAgent(AGENT_ROLES.ANALYST);
  if (!existingAnalyst) {
    console.log(chalk.yellow('  ⚠ no existing analyst in .sibyl/agents.json — skipping back-register'));
  } else {
    const isReg = await registry.isRegistered(existingAnalyst.aaAddress);
    if (isReg) {
      console.log(chalk.dim(`▸ The Oracle already registered\n`));
    } else {
      console.log(chalk.bold(`▸ Back-registering "The Oracle" (${existingAnalyst.aaAddress})...`));
      const tx = await registry.registerExisting(
        existingAnalyst.aaAddress,
        'The Oracle',
        Strategy.Bear,
        wallet.address
      );
      console.log(chalk.dim(`  tx: ${tx.hash}`));
      await tx.wait();
      console.log(chalk.green(`  ✓ registered as #001 · The Oracle · Bear\n`));
    }
  }

  // ── Step 3: print final state ──
  const total = await registry.totalAnalysts();
  console.log(chalk.bold(`▸ Registry state: ${total} analyst(s) registered\n`));

  if (Number(total) > 0) {
    const all = await registry.allAnalysts();
    for (let i = 0; i < all.length; i++) {
      const a = await registry.getAnalyst(all[i]);
      console.log(`  #${String(i + 1).padStart(3, '0')}  ${a.name.padEnd(20)} ${STRATEGY_NAMES[Number(a.strategy)]}  ${a.aa}`);
    }
    console.log('');
  }

  console.log(chalk.bold.green('✓ Day 3 registry complete'));
  console.log(chalk.dim('  Next: pnpm day3:seed (deploy benchmark analysts)\n'));
}

main().catch((err) => {
  console.error(chalk.red('\n✗ Fatal error:'), err.message || err);
  if (err.stack) {
    console.error(chalk.dim(err.stack.split('\n').slice(0, 5).join('\n')));
  }
  process.exit(1);
});
