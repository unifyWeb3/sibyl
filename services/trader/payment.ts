/**
 * Sibyl — Trader Payment Module
 *
 * Executes on-chain USDT transfers through the Trader's ERC-4337 AA wallet.
 * Uses the M2-proven SDK pattern: sendUserOperationAndWait(signer, request, signFn, salt).
 *
 * Flow:
 *   EOA signs a userOp → Kite bundler submits → AA wallet executes usdt.transfer
 *   → Analyst receives USDT → Analyst reads tx receipt to verify
 *
 * No facilitator, no off-chain signing, no trust assumptions. Pure Kite L1.
 */

import { GokiteAASDK } from 'gokite-aa-sdk';
import { JsonRpcProvider, Wallet, Contract, Interface, getBytes, parseUnits, formatUnits } from 'ethers';

// ─── Config ──────────────────────────────────────────────────────────────────

const SIGNAL_PRICE_USDT = '0.005';
const SIGNAL_PRICE_WEI = parseUnits(SIGNAL_PRICE_USDT, 18);

// Must match M2's registered salt for the Trader.
// See services/kite/identities.ts — trader salt = 1002n.
const TRADER_SALT = 1002n;

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TraderConfig {
  traderAAAddress: string;
  analystAAAddress: string;
  usdtAddress: string;
  rpcUrl: string;
  bundlerUrl: string;
  signerPrivateKey: string;
}

export interface PaymentProof {
  txHash: string;
  from: string;
  to: string;
  amount: string;
  token: string;
  network: string;
  paidAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatXPaymentHeader(proof: PaymentProof): string {
  return Buffer.from(JSON.stringify(proof)).toString('base64');
}

async function getUSDTBalance(
  provider: JsonRpcProvider,
  address: string,
  token: string
): Promise<string> {
  const erc20 = new Contract(token, ERC20_ABI, provider);
  const raw = (await erc20.balanceOf(address)) as bigint;
  return formatUnits(raw, 18);
}

// ─── Main payment flow ────────────────────────────────────────────────────────

export async function payForSignal(config: TraderConfig): Promise<{
  proof: PaymentProof;
  xPaymentHeader: string;
  traderBalanceBefore: string;
  traderBalanceAfter: string;
  analystBalanceBefore: string;
  analystBalanceAfter: string;
}> {
  const {
    traderAAAddress,
    analystAAAddress,
    usdtAddress,
    rpcUrl,
    bundlerUrl,
    signerPrivateKey,
  } = config;

  const provider = new JsonRpcProvider(rpcUrl);
  const signer = new Wallet(signerPrivateKey, provider);
  const signerAddress = await signer.getAddress();
  const sdk = new GokiteAASDK('kite_testnet', rpcUrl, bundlerUrl);

  // Snapshot balances BEFORE
  const traderBalanceBefore = await getUSDTBalance(provider, traderAAAddress, usdtAddress);
  const analystBalanceBefore = await getUSDTBalance(provider, analystAAAddress, usdtAddress);

  console.log(`  [trader]   balances BEFORE:`);
  console.log(`  [trader]     Trader  ${traderAAAddress.slice(0, 10)}...  ${traderBalanceBefore} USDT`);
  console.log(`  [trader]     Analyst ${analystAAAddress.slice(0, 10)}...  ${analystBalanceBefore} USDT`);

  // Build transfer calldata: usdt.transfer(analyst, amount)
  const erc20iface = new Interface(ERC20_ABI);
  const transferData = erc20iface.encodeFunctionData('transfer', [
    analystAAAddress,
    SIGNAL_PRICE_WEI,
  ]);

  console.log(`  [trader]   building userOp: transfer ${SIGNAL_PRICE_USDT} USDT → Analyst`);

  // Sign function — same as M2, signs the userOp hash
  const signFunction = async (userOpHash: string): Promise<string> => {
    return signer.signMessage(getBytes(userOpHash));
  };

  // Submit userOp via the M2-proven pattern
  const request = {
    target: usdtAddress,      // USDT contract
    value: 0n,                 // no ETH value
    callData: transferData,   // the transfer() call
  };

  console.log(`  [trader]   submitting userOp (this may take 15-25s)...`);

  const result = await sdk.sendUserOperationAndWait(
    signerAddress,
    request,
    signFunction,
    TRADER_SALT
  );

  // Validate result shape
  if (!result.status || result.status.status !== 'success') {
    const reason = result.status?.reason || 'unknown';
    throw new Error(`userOp failed: ${reason}`);
  }

  const txHash = result.status.transactionHash;
  if (!txHash) {
    throw new Error('userOp succeeded but no transactionHash returned');
  }

  console.log(`  [trader]   ✓ tx confirmed: ${txHash}`);
  console.log(`  [trader]   → KiteScan: https://testnet.kitescan.ai/tx/${txHash}`);

  const proof: PaymentProof = {
    txHash,
    from: traderAAAddress,
    to: analystAAAddress,
    amount: SIGNAL_PRICE_WEI.toString(),
    token: usdtAddress,
    network: 'eip155:2368',
    paidAt: new Date().toISOString(),
  };

  // Snapshot balances AFTER
  const traderBalanceAfter = await getUSDTBalance(provider, traderAAAddress, usdtAddress);
  const analystBalanceAfter = await getUSDTBalance(provider, analystAAAddress, usdtAddress);

  return {
    proof,
    xPaymentHeader: formatXPaymentHeader(proof),
    traderBalanceBefore,
    traderBalanceAfter,
    analystBalanceBefore,
    analystBalanceAfter,
  };
}
