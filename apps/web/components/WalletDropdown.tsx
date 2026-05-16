'use client';

/**
 * WalletDropdown — Day 14c Portal architecture.
 *
 * THE BUG:
 *   Previous version used `position: absolute` inside the trigger's parent.
 *   When that parent (the hero <section>) has `overflow: hidden`, the
 *   dropdown gets clipped — visible in screenshot showing the
 *   MissionControl panel bleeding through.
 *
 * THE FIX:
 *   Portal the dropdown into document.body. It becomes a sibling of <main>,
 *   completely outside any ancestor stacking context or overflow clip.
 *
 *   Position is calculated from the trigger button's getBoundingClientRect().
 *   The dropdown uses `position: fixed` (viewport coords), which means:
 *   - No ancestor can clip it
 *   - It tracks the trigger correctly on scroll (we reposition on scroll/resize)
 *   - z-index needs no escalation games — it's at body level
 *
 * INTERACTION:
 *   - Opens instantly (no animation jitter)
 *   - Closes on outside click
 *   - Closes on Escape
 *   - Closes after Disconnect/Switch action
 *   - Inside clicks don't bubble to outside-click handler
 *   - Repositions on viewport resize or page scroll
 */

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useDisconnect, useSwitchChain } from 'wagmi';
import {
  KITE_TESTNET_CHAIN_ID,
  KITE_TESTNET_NAME,
  KITE_FAUCET_URL,
  KITE_EXPLORER_URL,
} from '@/lib/chains';

interface WalletDropdownProps {
  triggerRef: RefObject<HTMLElement>;
  onClose: () => void;
}

interface Position {
  top: number;
  right: number;
}

function truncate(addr: string, len = 6): string {
  return `${addr.slice(0, len + 2)}…${addr.slice(-4)}`;
}

export function WalletDropdown({ triggerRef, onClose }: WalletDropdownProps) {
  const { address, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<Position | null>(null);

  const isWrongNetwork = chain?.id !== KITE_TESTNET_CHAIN_ID;

  // Mount detector — Portal can only render after client-side mount
  useEffect(() => {
    setMounted(true);
  }, []);

  // Position the dropdown relative to the trigger. useLayoutEffect runs
  // synchronously after DOM mutations so the dropdown appears at the
  // correct location on the first paint — no jump.
  useLayoutEffect(() => {
    function reposition() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPosition({
        top: rect.bottom + 8, // 8px gap below trigger
        right: window.innerWidth - rect.right,
      });
    }
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true); // capture-phase: catches scrolls in any ancestor
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [triggerRef]);

  // Click outside + Escape to close. Click *inside* dropdown OR on trigger
  // doesn't close (the trigger handles its own toggle).
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (dropdownRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
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
  }, [onClose, triggerRef]);

  async function handleCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API blocked in some embedded contexts — silent
    }
  }

  function handleSwitch() {
    switchChain(
      { chainId: KITE_TESTNET_CHAIN_ID },
      { onSuccess: () => onClose() }
    );
  }

  function handleDisconnect() {
    disconnect();
    onClose();
  }

  if (!mounted || !address || !position) return null;

  const content = (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: position.top,
        right: position.right,
        zIndex: 9999,
      }}
      className="w-72 bg-paper border border-ink rounded-sm shadow-card-hover"
      role="dialog"
      aria-label="Wallet"
    >
      {/* Address */}
      <div className="px-4 py-3 border-b border-rule-subtle">
        <div className="label-caps mb-1">your wallet</div>
        <div className="flex items-center gap-2 font-mono text-sm text-ink">
          <span className="truncate">{truncate(address, 8)}</span>
        </div>
      </div>

      {/* Network */}
      <div className="px-4 py-3 border-b border-rule-subtle">
        <div className="label-caps mb-1">network</div>
        {isWrongNetwork ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-warn-deep flex-shrink-0" />
              <span className="text-warn-deep">
                Wrong network · chain {chain?.id ?? '?'}
              </span>
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
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-soft flex-shrink-0" />
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
          <span className="text-ink-muted text-xs font-mono">{copied ? '' : '⧉'}</span>
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

      {/* Faucet */}
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

  return createPortal(content, document.body);
}
