'use client';

/**
 * ConnectButton — Day 14b rewrite.
 *
 * State machine:
 *   not-mounted   → neutral placeholder (prevents hydration desync)
 *   disconnected  → "Connect Wallet" → opens ConnectKit modal
 *   wrong-network → amber "0x... · Wrong Network" → opens WalletDropdown
 *   connected     → "● 0x96d6...2082" → opens WalletDropdown
 *
 * The mounted gate is the critical fix: until useEffect runs (post-hydration),
 * we render an identical placeholder for both server and client, eliminating
 * the SSR/client divergence that caused stale "Connect Wallet" after refresh.
 */

import { useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { useModal } from 'connectkit';
import { useMounted } from '@/lib/useMounted';
import { KITE_TESTNET_CHAIN_ID } from '@/lib/chains';
import { WalletDropdown } from './WalletDropdown';

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ConnectButton() {
  const mounted = useMounted();
  const { address, isConnected, isConnecting } = useAccount();
  const chainId = useChainId();
  const { setOpen } = useModal();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Stable placeholder during SSR + initial hydration — same width avoids
  // layout shift when the real button replaces it.
  if (!mounted) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rule rounded-sm bg-paper-elevated text-ink-tertiary min-w-[120px] justify-center">
        ⋯
      </div>
    );
  }

  // Disconnected — open ConnectKit modal
  if (!isConnected || !address) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={isConnecting}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rule rounded-sm bg-paper-elevated text-ink hover:border-ink hover:text-signal-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConnecting ? 'Connecting…' : 'Connect Wallet'}
      </button>
    );
  }

  // Connected — show address chip, click opens dropdown
  const isWrongNetwork = chainId !== KITE_TESTNET_CHAIN_ID;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border rounded-sm transition-colors ${
          isWrongNetwork
            ? 'border-warn-deep/40 bg-warn-soft text-warn-deep hover:border-warn-deep'
            : 'border-rule bg-paper-elevated text-ink hover:border-ink hover:text-signal-deep'
        }`}
        aria-haspopup="dialog"
        aria-expanded={dropdownOpen}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isWrongNetwork ? 'bg-warn-deep' : 'bg-signal animate-pulse-soft'
          }`}
        />
        <span className="font-mono tabular">{truncate(address)}</span>
        {isWrongNetwork && (
          <span className="hidden md:inline label-caps !text-warn-deep">wrong net</span>
        )}
      </button>

      {dropdownOpen && <WalletDropdown onClose={() => setDropdownOpen(false)} />}
    </div>
  );
}
