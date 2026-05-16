'use client';

/**
 * WalletDropdown — opens when user clicks the connected ConnectButton.
 *
 * Contents:
 *   - Full address (with truncation for the visible chip)
 *   - Copy address (with "copied" feedback)
 *   - Current network indicator (green dot if Kite, amber if wrong)
 *   - Switch network button (only when wrong)
 *   - Disconnect button
 *   - Faucet helper link
 *
 * Editorial Sibyl styling — no rainbow gradients, no glossy chrome.
 * Closes on outside click, Escape, or after any action.
 */

import { useEffect, useRef, useState } from 'react';
import { useAccount, useChainId, useDisconnect, useSwitchChain } from 'wagmi';
import {
  KITE_TESTNET_CHAIN_ID,
  KITE_TESTNET_NAME,
  KITE_FAUCET_URL,
  KITE_EXPLORER_URL,
} from '@/lib/chains';

interface WalletDropdownProps {
  onClose: () => void;
}

function truncate(addr: string, len = 6): string {
  return `${addr.slice(0, len + 2)}…${addr.slice(-4)}`;
}

export function WalletDropdown({ onClose }: WalletDropdownProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const isWrongNetwork = chainId !== KITE_TESTNET_CHAIN_ID;

  // Click outside + Escape to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  async function handleCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API blocked in some environments — silent
    }
  }

  function handleSwitch() {
    switchChain(
      { chainId: KITE_TESTNET_CHAIN_ID },
      {
        onSuccess: () => onClose(),
      }
    );
  }

  function handleDisconnect() {
    disconnect();
    onClose();
  }

  if (!address) return null;

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-2 w-72 bg-paper border border-ink rounded-sm shadow-card-hover z-50"
      role="dialog"
      aria-label="Wallet"
    >
      {/* Address row */}
      <div className="px-4 py-3 border-b border-rule-subtle">
        <div className="label-caps mb-1">your wallet</div>
        <div className="flex items-center gap-2 font-mono text-sm text-ink">
          <span className="truncate">{truncate(address, 8)}</span>
        </div>
      </div>

      {/* Network row */}
      <div className="px-4 py-3 border-b border-rule-subtle">
        <div className="label-caps mb-1">network</div>
        {isWrongNetwork ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-warn-deep" />
              <span className="text-warn-deep">Wrong network · chain {chainId}</span>
            </div>
            <button
              type="button"
              onClick={handleSwitch}
              disabled={isSwitching}
              className="w-full bg-ink text-paper px-3 py-2 rounded-sm text-xs font-medium hover:bg-ink-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSwitching ? 'Switching…' : `Switch to ${KITE_TESTNET_NAME}`}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-soft" />
            <span className="text-ink">Connected to {KITE_TESTNET_NAME}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 space-y-2 border-b border-rule-subtle">
        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-ink border border-rule rounded-sm bg-paper-elevated hover:border-ink-secondary transition-colors"
        >
          <span>{copied ? 'Copied ✓' : 'Copy address'}</span>
          <span className="text-ink-muted text-xs">⌘C</span>
        </button>
        <a
          href={`${KITE_EXPLORER_URL}/address/${address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-between px-3 py-2 text-sm text-ink border border-rule rounded-sm bg-paper-elevated hover:border-ink-secondary transition-colors"
        >
          <span>View on KiteScan</span>
          <span className="text-ink-muted text-xs">↗</span>
        </a>
        <button
          type="button"
          onClick={handleDisconnect}
          className="w-full text-left px-3 py-2 text-sm text-warn-deep border border-warn-deep/30 rounded-sm bg-warn-soft hover:border-warn-deep transition-colors"
        >
          Disconnect
        </button>
      </div>

      {/* Faucet helper */}
      <div className="px-4 py-3">
        <div className="label-caps mb-1">need test funds?</div>
        <a
          href={KITE_FAUCET_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-signal-deep hover:underline"
        >
          Get Kite Testnet USDT + KITE ↗
        </a>
      </div>
    </div>
  );
}
