'use client';

/**
 * ConnectButton — Day 14c hardening.
 *
 * Two bugs fixed:
 *
 * BUG 1 — Visible 'Connecting…' after refresh:
 *   Previous code: `if (isConnecting) return 'Connecting…'`
 *   But `isConnecting` is true during BOTH user-initiated connections
 *   AND silent localStorage reconnects. So refresh = visible "Connecting".
 *
 *   FIX: useAccount() exposes `status` with discrete values:
 *     'reconnecting' → silent, browser-initiated, NEVER show text
 *     'connecting'   → user clicked Connect, OK to show "Connecting..."
 *     'connected'    → show address chip
 *     'disconnected' → show "Connect Wallet"
 *
 *   We render the same neutral placeholder for not-mounted AND reconnecting,
 *   making hydration + silent reconnect indistinguishable to the user.
 *
 * BUG 2 — Dropdown clipped by hero section's overflow-hidden:
 *   Fixed in WalletDropdown.tsx via React Portal. ConnectButton just
 *   passes triggerRef so the dropdown can measure position.
 */

import { useRef, useState } from 'react';
import { useAccount } from 'wagmi';
import { useModal } from 'connectkit';
import { useMounted } from '@/lib/useMounted';
import { KITE_TESTNET_CHAIN_ID } from '@/lib/chains';
import { WalletDropdown } from './WalletDropdown';

function truncate(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function Placeholder() {
  // Identical width to the connected chip (~120px) — eliminates layout shift
  // during the placeholder → real-button swap.
  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rule rounded-sm bg-paper-elevated min-w-[128px] justify-center"
      aria-hidden
    >
      <span className="w-1.5 h-1.5 rounded-full bg-ink-tertiary/40" />
      <span className="font-mono tabular text-ink-tertiary/60">⋯⋯⋯⋯⋯⋯⋯⋯</span>
    </div>
  );
}

export function ConnectButton() {
  const mounted = useMounted();
  const { address, status, chain } = useAccount();
  const { setOpen } = useModal();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // ─── State: SSR + initial hydration ──
  // Render the same neutral placeholder on server + client until useEffect fires.
  // Prevents the SSR/client text divergence that React warns about.
  if (!mounted) {
    return <Placeholder />;
  }

  // ─── State: silent auto-reconnect from localStorage ──
  // wagmi's status is 'reconnecting' when restoring a previous session.
  // User did nothing — DON'T announce internal state. Stay neutral.
  if (status === 'reconnecting' && !address) {
    return <Placeholder />;
  }

  // ─── State: disconnected ──
  if (status === 'disconnected' || (!address && status !== 'connecting')) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rule rounded-sm bg-paper-elevated text-ink hover:border-ink hover:text-signal-deep transition-colors min-w-[128px] justify-center"
      >
        Connect Wallet
      </button>
    );
  }

  // ─── State: user-initiated connecting ──
  // ONLY reached if user clicked Connect (status='connecting' is fresh).
  if (status === 'connecting' && !address) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rule rounded-sm bg-paper-elevated text-ink-muted min-w-[128px] justify-center">
        <span className="w-1.5 h-1.5 rounded-full bg-ink-muted animate-pulse" />
        Connecting…
      </div>
    );
  }

  // ─── State: connected ──
  if (!address) return <Placeholder />; // belt + suspenders

  const isWrongNetwork = chain?.id !== KITE_TESTNET_CHAIN_ID;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setDropdownOpen((v) => !v)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border rounded-sm transition-colors min-w-[128px] justify-center ${
          isWrongNetwork
            ? 'border-warn-deep/40 bg-warn-soft text-warn-deep hover:border-warn-deep'
            : 'border-rule bg-paper-elevated text-ink hover:border-ink'
        }`}
        aria-haspopup="dialog"
        aria-expanded={dropdownOpen}
        aria-label="Wallet menu"
      >
        <span
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            isWrongNetwork ? 'bg-warn-deep' : 'bg-signal animate-pulse-soft'
          }`}
        />
        <span className="font-mono tabular">{truncate(address)}</span>
        {isWrongNetwork && (
          <span className="hidden md:inline label-caps !text-warn-deep ml-1">wrong net</span>
        )}
      </button>

      {dropdownOpen && (
        <WalletDropdown
          triggerRef={triggerRef}
          onClose={() => setDropdownOpen(false)}
        />
      )}
    </>
  );
}
