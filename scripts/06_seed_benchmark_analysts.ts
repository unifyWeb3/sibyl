/**
 * Sibyl — Day 3 Step 2: Seed Benchmark Analysts
 *
 * Deploys two more AA wallets with personalities:
 *   • salt 2001 → "Momentum Mike"        · Chaser
 *   • salt 2002 → "Mean Reversion Mary"  · Reverter
 *
 * Each gets:
 *   • Deployed AA passport (M2 pattern)
 *   • Funded with 0.05 KITE (for native gas in future userOps)
 *   • Registered in SibylAnalysts contract via registerSelf()
 *   • Persisted to .sibyl/agents.json under benchmarks{}
 *
 * Idempotent — re-running skips already-deployed/registered analysts.
 *
 * Usage: pnpm day3:seed
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import chalk from 'chalk';
import { JsonRpcProvider, Wallet, Contract, getBytes, parseEther } from 'ethers';
import { GokiteAASDK } from 'gokite-aa-sdk';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const AGENTS_REGISTRY_PATH = '.sibyl/agents.json';
const CONTRACTS_REGISTRY_PATH = '.sibyl/contracts.json';
const EXPLORER = 'https://testnet.kitescan.ai';

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

interface BenchmarkSpec {
  key: string;
  salt: bigint;
  name: string;
  strategy: Strategy;
  fundKite: string;
}

const BENCHMARKS: BenchmarkSpec[] = [
  {
    key: 'momentum_mike',
    salt: 2001n,
    name: 'Momentum Mike',
    strategy: Strategy.Chaser,
    fundKite: '0.05',
  },
  {
    key: 'mean_reversion_mary',
    salt: 2002n,
    name: 'Mean Reversion Mary',
    strategy: Strategy.Reverter,
    fundKite: '0.05',
  },
];

// ─── Local registry helpers ──────────────────────────────────────────────────

interface AgentsRegistry {
  network: string;
  chainId: number;
  createdAt: string;
  agents: Record<string, any>;
  benchmarks?: Record<string, any>;
}

function loadAgents(): AgentsRegistry {
  if (!existsSync(AGENTS_REGISTRY_PATH)) {
    throw new Error('.sibyl/agents.json not found — run pnpm day1:passport first');
  }
  const raw = JSON.parse(readFileSync(AGENTS_REGISTRY_PATH, 'utf-8'));
  if (!raw.benchmarks) raw.benchmarks = {};
  return raw;
}

function saveAgents(reg: AgentsRegistry): void {
  const dir = dirname(AGENTS_REGISTRY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(AGENTS_REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

function loadAnalystsRegistryAddress(): string {
  if (!existsSync(CONTRACTS_REGISTRY_PATH)) {
    throw new Error('.sibyl/contracts.json missing — run pnpm day3:registry first');
  }
  const raw = JSON.parse(readFileSync(CONTRACTS_REGISTRY_PATH, 'utf-8'));
  const addr = raw.contracts?.SibylAnalysts?.address;
  if (!addr) {
    throw new Error('SibylAnalysts not in registry — run pnpm day3:registry first');
  }
  return addr;
}

async function compileAnalystsAbi(): Promise<any[]> {
  const solcModule = await import('solc');
  const solc: any = (solcModule as any).default ?? solcModule;
  const source = readFileSync('contracts/SibylAnalysts.sol', 'utf-8');
  const input = {
    language: 'Solidity',
    sources: { 'SibylAnalysts.sol': { content: source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  return output.contracts['SibylAnalysts.sol']['SibylAnalysts'].abi;
}

// ─── Retry wrapper for flaky Kite RPC ────────────────────────────────────────

async function retry<T>(label: string, fn: () => Promise<T>, attempts = 3, delayMs = 2000): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (i < attempts) {
        console.log(chalk.dim(`  retry ${i}/${attempts} on ${label}: ${(err.message || err).toString().slice(0, 80)}`));
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(chalk.bold('\n━━━ Sibyl — Day 3 Step 2: Seed Benchmark Analysts ━━━\n'));

  const rpcUrl = process.env.KITE_RPC_URL!;
  const bundlerUrl = process.env.KITE_BUNDLER_URL!;
  const privateKey = process.env.HACKATHON_PRIVATE_KEY!;

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const sdk = new GokiteAASDK('kite_testnet', rpcUrl, bundlerUrl);

  const balanceStart = await provider.getBalance(wallet.address);
  console.log(`  signer:   ${wallet.address}`);
  console.log(`  balance:  ${(Number(balanceStart) / 1e18).toFixed(6)} KITE\n`);

  const analystsRegistryAddress = loadAnalystsRegistryAddress();
  console.log(`  registry: ${analystsRegistryAddress}\n`);

  const abi = await compileAnalystsAbi();
  const registry = new Contract(analystsRegistryAddress, abi, wallet);

  let agents = loadAgents();

  for (const spec of BENCHMARKS) {
    console.log(chalk.bold(`▸ ${spec.name} (salt ${spec.salt})`));

    const existing = agents.benchmarks?.[spec.key];

    // ── Step A: ensure AA is deployed ──
    let aaAddress: string;
    if (existing?.deployed && existing?.aaAddress) {
      aaAddress = existing.aaAddress;
      console.log(chalk.dim(`  AA already in local registry: ${aaAddress}`));
    } else {
      const computedAddress = await sdk.getAccountAddress(wallet.address, spec.salt);

      // Check if bytecode already exists (idempotency for partial runs)
      const code = await retry('getCode', () => provider.getCode(computedAddress));

      if (code !== '0x' && code !== '0x0') {
        aaAddress = computedAddress;
        console.log(chalk.dim(`  AA bytecode already on-chain at ${aaAddress}`));
      } else {
        const signFunction = async (h: string) => wallet.signMessage(getBytes(h));
        console.log(chalk.dim(`  deploying AA via userOp (15-25s)...`));
        const result = await sdk.sendUserOperationAndWait(
          wallet.address,
          { target: computedAddress, value: 0n, callData: '0x' },
          signFunction,
          spec.salt
        );
        if (!result.status || result.status.status !== 'success') {
          throw new Error(`AA deploy failed: ${result.status?.reason || 'unknown'}`);
        }
        aaAddress = computedAddress;
        console.log(chalk.green(`  ✓ AA deployed at ${aaAddress}`));
        console.log(chalk.dim(`  → ${EXPLORER}/tx/${result.status.transactionHash}`));
      }

      agents.benchmarks![spec.key] = {
        key: spec.key,
        name: spec.name,
        strategy: STRATEGY_NAMES[spec.strategy],
        eoaSigner: wallet.address,
        aaAddress,
        salt: String(spec.salt),
        deployed: true,
        deployedAt: new Date().toISOString(),
      };
      saveAgents(agents);
    }

    // ── Step B: fund AA with KITE ──
    const aaBalance = await retry('getBalance', () => provider.getBalance(aaAddress));
    const targetWei = parseEther(spec.fundKite);
    if (aaBalance < targetWei / 2n) {
      console.log(chalk.dim(`  funding AA with ${spec.fundKite} KITE...`));
      const fundTx = await wallet.sendTransaction({
        to: aaAddress,
        value: targetWei,
      });
      await fundTx.wait();
      console.log(chalk.green(`  ✓ funded · tx ${fundTx.hash.slice(0, 18)}...`));
      agents.benchmarks![spec.key].fundedKiteAmount = spec.fundKite;
      agents.benchmarks![spec.key].fundedTxHash = fundTx.hash;
      saveAgents(agents);
    } else {
      console.log(chalk.dim(`  AA already funded (${(Number(aaBalance) / 1e18).toFixed(4)} KITE)`));
    }

    // ── Step C: register in SibylAnalysts ──
    const isReg = await retry('isRegistered', () => registry.isRegistered(aaAddress));
    if (isReg) {
      console.log(chalk.dim(`  already registered in SibylAnalysts`));
    } else {
      console.log(chalk.dim(`  registering in SibylAnalysts...`));
      const tx = await registry.registerSelf(aaAddress, spec.name, spec.strategy);
      await tx.wait();
      console.log(chalk.green(`  ✓ registered · tx ${tx.hash.slice(0, 18)}...`));
      agents.benchmarks![spec.key].registeredTxHash = tx.hash;
      saveAgents(agents);
    }

    console.log('');
  }

  // ── Final state summary ──
  const total = await registry.totalAnalysts();
  console.log(chalk.bold(`▸ Registry state: ${total} analyst(s)\n`));

  const all = await registry.allAnalysts();
  for (let i = 0; i < all.length; i++) {
    const a = await registry.getAnalyst(all[i]);
    console.log(
      `  #${String(i + 1).padStart(3, '0')}  ${a.name.padEnd(22)} ${STRATEGY_NAMES[Number(a.strategy)].padEnd(10)} ${a.aa}`
    );
  }

  const balanceEnd = await provider.getBalance(wallet.address);
  const burned = balanceStart - balanceEnd;
  console.log('');
  console.log(chalk.dim(`  Gas + funding burn: ${(Number(burned) / 1e18).toFixed(6)} KITE`));
  console.log(chalk.dim(`  Remaining EOA balance: ${(Number(balanceEnd) / 1e18).toFixed(6)} KITE`));

  console.log('');
  console.log(chalk.bold.green('✓ Day 3 step 2 complete'));
  console.log(chalk.dim('  Three analysts registered. Leaderboard now has competition.'));
  console.log(chalk.dim('  Next: update apps/web/lib/kite.ts + landing page leaderboard\n'));
}

main().catch((err) => {
  console.error(chalk.red('\n✗ Fatal error:'), err.message || err);
  if (err.stack) {
    console.error(chalk.dim(err.stack.split('\n').slice(0, 5).join('\n')));
  }
  process.exit(1);
});
