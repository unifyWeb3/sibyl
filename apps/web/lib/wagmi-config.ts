/**
 * Wagmi config for Sibyl.
 *
 * Defines Kite testnet as the chain, registers ConnectKit's default connectors
 * (MetaMask, Coinbase, WalletConnect, plus injected fallback). Used by the
 * client-side Provider in app/providers.tsx.
 */

import { http, createConfig } from 'wagmi';
import { defineChain } from 'viem';
import { getDefaultConfig } from 'connectkit';

export const kiteTestnetChain = defineChain({
  id: 2368,
  name: 'Kite Testnet',
  nativeCurrency: { name: 'Kite', symbol: 'KITE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc-testnet.gokite.ai'] },
  },
  blockExplorers: {
    default: { name: 'KiteScan', url: 'https://testnet.kitescan.ai' },
  },
  testnet: true,
});

// WalletConnect project ID — public (read-only fingerprint, safe to ship).
// If you want to register your own, swap in NEXT_PUBLIC_WC_PROJECT_ID.
const WC_PROJECT_ID =
  process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? '4b7c1b8a8a4e8d2f9b0e3c5d6f7a1b2c';

export const wagmiConfig = createConfig(
  getDefaultConfig({
    appName: 'Sibyl',
    appDescription: 'Proof of Alpha, settled on Kite.',
    appUrl: 'https://usesibyl.vercel.app',
    walletConnectProjectId: WC_PROJECT_ID,
    chains: [kiteTestnetChain],
    transports: {
      [kiteTestnetChain.id]: http('https://rpc-testnet.gokite.ai'),
    },
  })
);
