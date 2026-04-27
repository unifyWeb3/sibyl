/**
 * Server-only logic for deploying a new analyst.
 *
 * Flow (fully idempotent — retries resume from where they left off):
 *   1. Validate name (length, charset, profanity)
 *   2. Pick salt via on-chain count + retry on collision
 *   3. Pre-flight: if AA already registered, return existing (no work)
 *   4. Pre-flight: if AA has bytecode but unregistered, skip deploy step
 *   5. Pre-flight: if AA already funded, skip funding step
 *   6. Otherwise execute deploy → fund → register in sequence
 *
 * IMPORTANT: This file uses HACKATHON_PRIVATE_KEY which MUST live only in
 * server-side env vars. Never import this file from a client component.
 */

import { JsonRpcProvider, Wallet, Contract, getBytes, parseEther, formatEther } from 'ethers';
import { GokiteAASDK } from 'gokite-aa-sdk';
import { SIBYL_ANALYSTS_ABI, SIBYL_CONTRACTS } from './kite';

// ─── Config ──────────────────────────────────────────────────────────────────

// User-deployed analysts. Bumped from 3000 to 4000 to skip the orphan AAs at
// salts 3003-3004 from Day 4's debugging. Those AAs exist on-chain but are
// unregistered; we abandon them rather than recover them.
const BASE_SALT_USER_DEPLOYS = 4000n;

const FUND_KITE = '0.05';
const FUND_KITE_WEI = parseEther(FUND_KITE);
// Skip funding if AA already has at least half the target. Handles "we partially
// funded yesterday but registration failed" gracefully.
const FUND_THRESHOLD_WEI = FUND_KITE_WEI / 2n;

// Hard timeout for funding tx confirmation. Kite testnet typically confirms
// within 5-10s; 45s is a generous ceiling that prevents infinite hang.
const TX_WAIT_TIMEOUT_MS = 45_000;

const RPC_URL = process.env.KITE_RPC_URL ?? 'https://rpc-testnet.gokite.ai';
const BUNDLER_URL =
  process.env.KITE_BUNDLER_URL ?? 'https://bundler-service.staging.gokite.ai/rpc/';

// ─── Validation ──────────────────────────────────────────────────────────────

const NAME_REGEX = /^[A-Za-z0-9 \-_'.]+$/;

const SOFT_BLOCKLIST = [
  /\bn[i!1][gq]g[e3]?[ra]\b/i,
  /\bf[a@]gg?[o0]t\b/i,
  /\bk[i!1]k[e3]\b/i,
  /\bch[i!1]nk\b/i,
  /\bsp[i!1]c\b/i,
  /\btw[a@]t\b/i,
  /\bcunt\b/i,
];

export type ValidateResult =
  | { ok: true; cleanName: string }
  | { ok: false; reason: string };

export function validateName(raw: unknown): ValidateResult {
  if (typeof raw !== 'string') return { ok: false, reason: 'name must be a string' };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: 'name cannot be empty' };
  if (trimmed.length > 30) return { ok: false, reason: 'name too long (max 30)' };
  if (trimmed.length < 2) return { ok: false, reason: 'name too short (min 2)' };
  if (!NAME_REGEX.test(trimmed))
    return { ok: false, reason: "use letters, numbers, spaces, and -_'." };
  for (const pattern of SOFT_BLOCKLIST) {
    if (pattern.test(trimmed)) return { ok: false, reason: 'name not allowed' };
  }
  return { ok: true, cleanName: trimmed };
}

export type Strategy = 0 | 1 | 2 | 3;

export function validateStrategy(raw: unknown): raw is Strategy {
  return raw === 0 || raw === 1 || raw === 2 || raw === 3;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Wait for a transaction with a hard timeout. Prevents indefinite hang on
 * stale RPC nodes where the tx confirms but our connection drops the receipt.
 */
async function waitWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

// ─── Deploy generator ────────────────────────────────────────────────────────

export interface DeployStep {
  step: 'preflight' | 'wallet' | 'fund' | 'register' | 'complete' | 'error';
  message: string;
  data?: any;
}

export interface DeployedAnalyst {
  aa: string;
  name: string;
  strategy: Strategy;
  salt: string;
  deployTxHash: string | null; // null when we recovered an existing AA
  fundTxHash: string | null;   // null when AA was already funded
  registerTxHash: string | null; // null when already registered (recovery)
  rank: number;
  recovered: boolean; // true when we resumed from a partial prior deploy
}

/**
 * Async generator yielding progress steps. Server-only.
 */
export async function* deployAnalyst(args: {
  name: string;
  strategy: Strategy;
}): AsyncGenerator<DeployStep, DeployedAnalyst | null, void> {
  const privateKey = process.env.HACKATHON_PRIVATE_KEY;
  if (!privateKey) {
    yield { step: 'error', message: 'server misconfigured: no signer key' };
    return null;
  }

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(privateKey, provider);
  const sdk = new GokiteAASDK('kite_testnet', RPC_URL, BUNDLER_URL);
  const registry = new Contract(SIBYL_CONTRACTS.analysts, SIBYL_ANALYSTS_ABI, wallet);

  // ── Step 1: Pick salt + pre-flight ──
  yield { step: 'preflight', message: `Reserving a passport for ${args.name}…` };

  let totalAnalysts: bigint;
  try {
    totalAnalysts = (await registry.totalAnalysts()) as bigint;
  } catch (err: any) {
    yield {
      step: 'error',
      message: `Network hiccup reading registry. Try again in a few seconds.`,
    };
    return null;
  }

  let salt = BASE_SALT_USER_DEPLOYS + totalAnalysts;
  let aaAddress: string;
  let needsAaDeploy = true;
  let needsFund = true;

  // Walk forward through salts until we find one that's either fresh or
  // recoverable (has bytecode but isn't registered).
  // Max 3 hops — if the first 3 salts are all already-registered, something is
  // very wrong and we bail.
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    aaAddress = await sdk.getAccountAddress(wallet.address, salt);

    // (a) Already registered?
    let registered = false;
    try {
      registered = (await registry.isRegistered(aaAddress)) as boolean;
    } catch {
      // RPC propagation lag; assume not registered, will fail later if it is
    }

    if (registered) {
      // Salt is taken. Increment and retry.
      salt = salt + 1n;
      continue;
    }

    // (b) Has bytecode?
    const code = await provider.getCode(aaAddress).catch(() => '0x');
    if (code !== '0x' && code !== '0x0') {
      // Recoverable orphan — skip AA deploy, proceed to fund/register
      needsAaDeploy = false;
    }

    // (c) Already funded?
    const aaBalance = await provider.getBalance(aaAddress).catch(() => 0n);
    if (aaBalance >= FUND_THRESHOLD_WEI) {
      needsFund = false;
    }

    // We have a usable salt — break out
    break;
  }

  if (attempts >= 3) {
    yield {
      step: 'error',
      message: 'No usable salt slot in the next 3 — try again in a minute.',
    };
    return null;
  }

  // ── Step 2: Deploy AA wallet (or skip if recovered) ──
  let deployTxHash: string | null = null;
  if (needsAaDeploy) {
    yield {
      step: 'wallet',
      message: `Giving ${args.name} a wallet on Kite L1…`,
    };

    try {
      const signFunction = async (h: string) => wallet.signMessage(getBytes(h));
      const result = await sdk.sendUserOperationAndWait(
        wallet.address,
        { target: aaAddress!, value: 0n, callData: '0x' },
        signFunction,
        salt
      );
      if (!result.status || result.status.status !== 'success') {
        yield {
          step: 'error',
          message: `Wallet deploy failed: ${result.status?.reason ?? 'unknown reason'}`,
        };
        return null;
      }
      deployTxHash = result.status.transactionHash;
    } catch (err: any) {
      yield {
        step: 'error',
        message: `Wallet deploy error: ${err.shortMessage ?? err.message ?? 'unknown'}`,
      };
      return null;
    }
  } else {
    // Inform the UI we recovered — keeps the user from thinking we're skipping
    yield {
      step: 'wallet',
      message: `${args.name}'s wallet already exists. Continuing…`,
    };
  }

  // ── Step 3: Fund AA (or skip if already funded) ──
  let fundTxHash: string | null = null;
  if (needsFund) {
    yield {
      step: 'fund',
      message: `Funding ${args.name} with ${FUND_KITE} KITE…`,
    };

    try {
      const fundTx = await wallet.sendTransaction({
        to: aaAddress!,
        value: FUND_KITE_WEI,
      });
      // Hard-timeout the wait so we don't hang forever if RPC stalls
      await waitWithTimeout(fundTx.wait(1), TX_WAIT_TIMEOUT_MS, 'funding tx');
      fundTxHash = fundTx.hash;
    } catch (err: any) {
      yield {
        step: 'error',
        message: `Funding error: ${err.shortMessage ?? err.message ?? 'unknown'}`,
      };
      return null;
    }
  } else {
    yield {
      step: 'fund',
      message: `${args.name} is already funded. Continuing…`,
    };
  }

  // ── Step 4: Register in SibylAnalysts ──
  yield {
    step: 'register',
    message: `Registering ${args.name} in the marketplace…`,
  };

  let registerTxHash: string | null = null;
  try {
    const tx = await registry.registerSelf(aaAddress!, args.name, args.strategy);
    await waitWithTimeout(tx.wait(1), TX_WAIT_TIMEOUT_MS, 'register tx');
    registerTxHash = tx.hash;
  } catch (err: any) {
    yield {
      step: 'error',
      message: `Registration error: ${err.shortMessage ?? err.message ?? 'unknown'}`,
    };
    return null;
  }

  // ── Step 5: Complete ──
  let newTotal = totalAnalysts + 1n;
  try {
    newTotal = (await registry.totalAnalysts()) as bigint;
  } catch {
    // best-effort; we already have a fallback
  }

  const result: DeployedAnalyst = {
    aa: aaAddress!,
    name: args.name,
    strategy: args.strategy,
    salt: String(salt),
    deployTxHash,
    fundTxHash,
    registerTxHash,
    rank: Number(newTotal),
    recovered: !needsAaDeploy,
  };

  yield {
    step: 'complete',
    message: `${args.name} is live on Kite Testnet.`,
    data: result,
  };

  return result;
}
