/**
 * services/kite/kitepass.ts
 *
 * ClientAgentVault ("KitePass") operations — deploy, configure rules, read rules.
 * Adapted from gokite-aa-sdk's reference example, typed + cleaned for Sibyl.
 *
 * The architecture:
 *   EOA (you) → AA wallet (agent identity) → KitePass proxy (spend vault with rules)
 *
 * Each agent owns exactly one KitePass proxy. The proxy's admin is the AA wallet.
 * Spending rules live inside the proxy and are enforced by the contract on every transfer.
 */

import { Interface, AbiCoder, JsonRpcProvider, Contract, parseUnits, id, toUtf8Bytes } from 'ethers';
import { KITE_NETWORK } from './client.ts';
import { TRANSPARENT_PROXY_BYTECODE } from './proxy-bytecode.ts';
import type { GokiteAASDK } from 'gokite-aa-sdk';

/** Kite testnet deployed addresses (from gokite-aa-sdk reference) */
export const KITE_ADDRESSES = {
  SETTLEMENT_TOKEN: '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63',
  SETTLEMENT_CONTRACT: '0x8d9FaD78d5Ce247aA01C140798B9558fd64a63E3',
  CLIENT_AGENT_VAULT_IMPL: '0xB5AAFCC6DD4DFc2B80fb8BCcf406E1a2Fd559e23',
  SERVICE_REGISTRY: '0xF727EDE22C9e338a7d1d57B930dcEBbC6a66c008',
} as const;

/** A single spending rule as stored in the ClientAgentVault contract */
export interface SpendingRule {
  /** Seconds; 0 = per-transaction, 86400 = daily, 604800 = weekly, etc. */
  timeWindow: bigint;
  /** Max spend in wei (18 decimals for Test USDT on Kite) */
  budget: bigint;
  /** Unix seconds; start of the window. Usually midnight today. */
  initialWindowStartTime: bigint;
  /**
   * Provider-specific scope. Empty = applies to all. Otherwise bytes32 keccak256
   * of the provider's identifier (e.g. keccak256("analyst")).
   */
  targetProviders: string[];
}

type SignFunction = (userOpHash: string) => Promise<string>;

/**
 * Deploy a KitePass (ClientAgentVault proxy) for one agent.
 *
 * The AA wallet (signed by EOA) calls performCreate(bytecode + constructor args)
 * via the SDK's AccountImpl. The returned address is a new
 * TransparentUpgradeableProxy pointing at CLIENT_AGENT_VAULT_IMPL.
 */
export async function deployKitePassForAgent(
  sdk: GokiteAASDK,
  signerAddress: string,
  agentAaAddress: string,
  agentSalt: bigint,
  signFunction: SignFunction
): Promise<{ success: boolean; proxyAddress?: string; txHash?: string; error?: string }> {
  // initialize(allowedToken, owner) — owner is the agent's AA wallet
  const initializeCallData = Interface.from([
    'function initialize(address allowedToken, address owner)',
  ]).encodeFunctionData('initialize', [
    KITE_ADDRESSES.SETTLEMENT_TOKEN,
    agentAaAddress,
  ]);

  // Proxy constructor args: (impl, admin, initData)
  const proxyConstructorData = AbiCoder.defaultAbiCoder().encode(
    ['address', 'address', 'bytes'],
    [KITE_ADDRESSES.CLIENT_AGENT_VAULT_IMPL, agentAaAddress, initializeCallData]
  );

  // Full creation code = bytecode + constructor args
  const fullInitCode = TRANSPARENT_PROXY_BYTECODE + proxyConstructorData.slice(2);

  // Call performCreate on the agent's AA wallet itself (it has this method built in)
  const performCreateCallData = Interface.from([
    'function performCreate(uint256 value, bytes calldata initCode) returns (address)',
  ]).encodeFunctionData('performCreate', [0n, fullInitCode]);

  const request = {
    target: agentAaAddress, // the AA wallet deploys the proxy
    value: 0n,
    callData: performCreateCallData,
  };

  const result = await sdk.sendUserOperationAndWait(
    signerAddress,
    request,
    signFunction,
    agentSalt
  );

  if (result.status?.status !== 'success') {
    return { success: false, error: result.status?.reason || 'deployment failed' };
  }

  const txHash = result.status.transactionHash;
  const proxyAddress = await parseContractCreatedEvent(txHash);

  if (!proxyAddress) {
    return {
      success: false,
      txHash,
      error: 'ContractCreated event not found in tx logs',
    };
  }

  return { success: true, proxyAddress, txHash };
}

/**
 * Configure spending rules on a deployed KitePass proxy.
 *
 * IMPORTANT: setSpendingRules REPLACES all rules. If the proxy already has rules,
 * we fetch them and append. For first-time setup (our Day 1 case), rules is empty,
 * so we just set the new ones.
 */
export async function configureSpendingRules(
  sdk: GokiteAASDK,
  signerAddress: string,
  agentAaAddress: string,
  agentSalt: bigint,
  kitepassAddress: string,
  rules: SpendingRule[],
  signFunction: SignFunction
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  // Merge with existing rules (usually empty on first call)
  const existing = await viewSpendingRules(kitepassAddress);
  const existingRules = existing.success ? existing.rules.map(r => r.rule) : [];
  const merged = [...existingRules, ...rules];

  const callData = Interface.from([
    'function setSpendingRules(tuple(uint256 timeWindow, uint160 budget, uint96 initialWindowStartTime, bytes32[] targetProviders)[] calldata rules)',
  ]).encodeFunctionData('setSpendingRules', [merged]);

  const request = {
    target: kitepassAddress,
    value: 0n,
    callData,
  };

  // The AA wallet (which is the proxy's admin) must sign. Use same salt as the
  // agent's AA wallet so the SDK derives the correct sender.
  const result = await sdk.sendUserOperationAndWait(
    signerAddress,
    request,
    signFunction,
    agentSalt
  );

  if (result.status?.status !== 'success') {
    return { success: false, error: result.status?.reason || 'configuration failed' };
  }

  return { success: true, txHash: result.status.transactionHash };
}

/**
 * Read current spending rules from a KitePass proxy.
 */
export async function viewSpendingRules(
  kitepassAddress: string
): Promise<{
  success: boolean;
  rules: Array<{
    rule: SpendingRule;
    usage: { amountUsed: bigint; currentTimeWindowStartTime: bigint };
  }>;
  error?: string;
}> {
  try {
    const provider = new JsonRpcProvider(process.env.KITE_RPC_URL!);
    const contract = new Contract(
      kitepassAddress,
      [
        'function getSpendingRules() view returns (tuple(tuple(uint256 timeWindow, uint160 budget, uint96 initialWindowStartTime, bytes32[] targetProviders) rule, tuple(uint128 amountUsed, uint128 currentTimeWindowStartTime) usage)[])',
      ],
      provider
    );
    const raw = await contract.getSpendingRules();
    const rules = raw.map((entry: any) => ({
      rule: {
        timeWindow: entry.rule.timeWindow,
        budget: entry.rule.budget,
        initialWindowStartTime: entry.rule.initialWindowStartTime,
        targetProviders: entry.rule.targetProviders,
      },
      usage: {
        amountUsed: entry.usage.amountUsed,
        currentTimeWindowStartTime: entry.usage.currentTimeWindowStartTime,
      },
    }));
    return { success: true, rules };
  } catch (error: any) {
    // Proxy may not exist yet, or may have no rules — both surface as errors,
    // we treat "empty" gracefully.
    return { success: true, rules: [], error: error.message };
  }
}

/**
 * Parse the ContractCreated event from a deployment transaction.
 * KitePass proxies emit this event when created via performCreate.
 */
export async function parseContractCreatedEvent(txHash: string): Promise<string | null> {
  try {
    const provider = new JsonRpcProvider(process.env.KITE_RPC_URL!);
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return null;
    const eventSig = id('ContractCreated(address)');
    for (const log of receipt.logs) {
      if (log.topics[0] === eventSig) {
        return AbiCoder.defaultAbiCoder().decode(['address'], log.topics[1])[0];
      }
    }
    return null;
  } catch (err) {
    console.error('parseContractCreatedEvent error:', err);
    return null;
  }
}

/**
 * Transfer USDT from EOA to an AA wallet.
 * Uses standard ERC20 transfer, signed by EOA directly (not a userOp).
 */
export async function transferUsdtToAgent(
  signerWallet: import('ethers').Wallet,
  recipientAddress: string,
  amount: string
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const usdt = new Contract(
      KITE_ADDRESSES.SETTLEMENT_TOKEN,
      ['function transfer(address to, uint256 amount) returns (bool)'],
      signerWallet
    );
    const tx = await usdt.transfer(recipientAddress, parseUnits(amount, 18));
    const receipt = await tx.wait();
    return { success: true, txHash: receipt.hash };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}

/**
 * Build a keccak256 provider identifier for use in spending rule scopes.
 */
export function providerId(name: string): string {
  return id(name);
}
