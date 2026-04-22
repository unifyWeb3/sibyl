/**
 * services/kite/client.ts
 *
 * Shared Kite SDK client. Every script/agent imports from here.
 * One place to configure the SDK, the signer, and the sign function.
 */

import { GokiteAASDK, NETWORKS } from 'gokite-aa-sdk';
import { JsonRpcProvider, Wallet, getBytes } from 'ethers';

const NETWORK_NAME = 'kite_testnet';

export const KITE_NETWORK = NETWORKS[NETWORK_NAME];

if (!KITE_NETWORK) {
  throw new Error(`Unknown network: ${NETWORK_NAME}`);
}

/**
 * The AA SDK instance. Uses env URLs for RPC + bundler.
 */
export function getKiteSDK(): GokiteAASDK {
  const rpcUrl = process.env.KITE_RPC_URL;
  const bundlerUrl = process.env.KITE_BUNDLER_URL;
  if (!rpcUrl || !bundlerUrl) {
    throw new Error('KITE_RPC_URL and KITE_BUNDLER_URL must be set in .env.local');
  }
  return new GokiteAASDK(NETWORK_NAME, rpcUrl, bundlerUrl);
}

/**
 * Your EOA signer — the "user root" identity in Kite's three-tier model.
 * Every AA wallet we deploy is derived deterministically from this EOA.
 */
export function getSigner(): Wallet {
  const privateKey = process.env.HACKATHON_PRIVATE_KEY;
  const rpcUrl = process.env.KITE_RPC_URL;
  if (!privateKey || !rpcUrl) {
    throw new Error('HACKATHON_PRIVATE_KEY and KITE_RPC_URL must be set in .env.local');
  }
  const provider = new JsonRpcProvider(rpcUrl);
  return new Wallet(privateKey, provider);
}

/**
 * Produces a signFunction the SDK expects for userOperation authorization.
 * Kite's SDK hashes the userOp, then our EOA signs the hash-as-bytes.
 */
export function getSignFunction(wallet: Wallet) {
  return async (userOpHash: string): Promise<string> => {
    return wallet.signMessage(getBytes(userOpHash));
  };
}

/**
 * Convenience: returns everything in one call.
 */
export async function getKiteContext() {
  const sdk = getKiteSDK();
  const signer = getSigner();
  const signerAddress = await signer.getAddress();
  const signFunction = getSignFunction(signer);
  return { sdk, signer, signerAddress, signFunction };
}
