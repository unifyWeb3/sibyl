'use client';

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider } from 'connectkit';
import { wagmiConfig } from '@/lib/wagmi-config';
import { useState } from 'react';

/**
 * Web3Provider — single source of wallet/web3 context for client components.
 *
 * Used in app/layout.tsx. Wraps the Wagmi + React Query + ConnectKit chain so
 * any client component can call useAccount, useReadContract, useWriteContract,
 * etc. ConnectKit theme is matched to Sibyl's editorial paper aesthetic.
 */
export function Web3Provider({ children }: { children: React.ReactNode }) {
  // Stable QueryClient across re-renders
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Reasonable defaults for an on-chain UI
        staleTime: 10_000,
        retry: 2,
      },
    },
  }));

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider
          theme="auto"
          mode="light"
          customTheme={{
            // Match Sibyl's editorial paper aesthetic
            '--ck-font-family': 'Inter, sans-serif',
            '--ck-border-radius': '4px',
            '--ck-primary-button-background': '#1A1A1A',
            '--ck-primary-button-color': '#FAFAF7',
            '--ck-primary-button-hover-background': '#3D3D3A',
            '--ck-body-background': '#FAFAF7',
            '--ck-body-color': '#1A1A1A',
            '--ck-body-color-muted': '#7A7A75',
            '--ck-accent-color': '#00A368',
            '--ck-modal-box-shadow': '0 8px 32px rgba(0, 0, 0, 0.08)',
          }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
