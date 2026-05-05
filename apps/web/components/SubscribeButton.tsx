'use client';

/**
 * SubscribeButton — opens a modal that walks the user through subscribing.
 *
 * Flow:
 *   1. If wallet not connected → "Connect to subscribe" → opens ConnectKit modal.
 *   2. If already subscribed → shows expiry, "Renew" extends another 30d.
 *   3. If allowance < 0.5 USDT → step A: approve. Step B: subscribe.
 *   4. If allowance OK → just subscribe.
 *
 * Uses wagmi v2 hooks. Stays compact (~200 lines incl. modal markup).
 */

import { useState, useEffect } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useModal } from 'connectkit';
import {
  SIBYL_SUBSCRIPTIONS_ADDRESS,
  SIBYL_SUBSCRIPTIONS_ABI,
  USDT_ADDRESS,
  ERC20_ABI,
  PRICE_PER_PERIOD_WEI,
  formatTimeRemaining,
} from '@/lib/subs';
import { formatUnits, type Address } from 'viem';

interface SubscribeButtonProps {
  analyst: Address;
  analystName: string;
  variant?: 'inline' | 'block';
}

type Phase = 'idle' | 'approving' | 'approve-pending' | 'subscribing' | 'subscribe-pending' | 'success' | 'error';

export function SubscribeButton({ analyst, analystName, variant = 'inline' }: SubscribeButtonProps) {
  const { address, isConnected } = useAccount();
  const { setOpen } = useModal();
  const [showModal, setShowModal] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  // ─── Reads ──
  const { data: isSubscribed, refetch: refetchIsSubscribed } = useReadContract({
    address: SIBYL_SUBSCRIPTIONS_ADDRESS,
    abi: SIBYL_SUBSCRIPTIONS_ABI,
    functionName: 'isSubscribed',
    args: address ? [address, analyst] : undefined,
    query: { enabled: !!address },
  });

  const { data: timeLeft } = useReadContract({
    address: SIBYL_SUBSCRIPTIONS_ADDRESS,
    abi: SIBYL_SUBSCRIPTIONS_ABI,
    functionName: 'timeRemaining',
    args: address ? [address, analyst] : undefined,
    query: { enabled: !!address && !!isSubscribed },
  });

  const { data: allowance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, SIBYL_SUBSCRIPTIONS_ADDRESS] : undefined,
    query: { enabled: !!address && showModal },
  });

  const { data: usdtBalance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && showModal },
  });

  // ─── Writes ──
  const { writeContract, data: txHash, reset: resetWrite } = useWriteContract();
  const { isLoading: isTxConfirming, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const needsApproval = (allowance ?? 0n) < PRICE_PER_PERIOD_WEI;
  const hasInsufficientBalance = (usdtBalance ?? 0n) < PRICE_PER_PERIOD_WEI;

  // ─── Handlers ──
  function handleClick() {
    if (!isConnected) {
      setOpen(true);
      return;
    }
    setShowModal(true);
    setPhase('idle');
    setError(null);
    resetWrite();
  }

  function handleApprove() {
    setPhase('approving');
    setError(null);
    writeContract(
      {
        address: USDT_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SIBYL_SUBSCRIPTIONS_ADDRESS, PRICE_PER_PERIOD_WEI],
      },
      {
        onSuccess: () => setPhase('approve-pending'),
        onError: (err) => {
          setPhase('error');
          setError(err.message ?? 'approve failed');
        },
      }
    );
  }

  function handleSubscribe() {
    setPhase('subscribing');
    setError(null);
    writeContract(
      {
        address: SIBYL_SUBSCRIPTIONS_ADDRESS,
        abi: SIBYL_SUBSCRIPTIONS_ABI,
        functionName: 'subscribe',
        args: [analyst],
      },
      {
        onSuccess: () => setPhase('subscribe-pending'),
        onError: (err) => {
          setPhase('error');
          setError(err.message ?? 'subscribe failed');
        },
      }
    );
  }

  // Auto-advance phase when tx confirms
  useEffect(() => {
    if (isTxSuccess && phase === 'approve-pending') {
      setPhase('idle'); // approval done; user can now hit Subscribe
      resetWrite();
    } else if (isTxSuccess && phase === 'subscribe-pending') {
      setPhase('success');
      refetchIsSubscribed();
    }
  }, [isTxSuccess, phase, resetWrite, refetchIsSubscribed]);

  // ─── Render: button ──
  const buttonClasses =
    variant === 'block'
      ? 'group inline-flex items-center justify-center gap-2 bg-ink text-paper px-6 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors'
      : 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rule rounded-sm bg-paper-elevated text-ink hover:border-ink hover:text-signal-deep transition-colors';

  if (isConnected && isSubscribed) {
    return (
      <span className={variant === 'block' ? 'label-caps !text-signal-deep' : 'label-caps !text-signal-deep'}>
        ● subscribed · {formatTimeRemaining(Number(timeLeft ?? 0n))}
      </span>
    );
  }

  return (
    <>
      <button type="button" onClick={handleClick} className={buttonClasses}>
        {isConnected ? `Subscribe · 0.5 USDT` : `Connect to subscribe`}
        {variant === 'block' && (
          <span className="text-signal group-hover:translate-x-0.5 transition-transform">→</span>
        )}
      </button>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && setShowModal(false)}
        >
          <div className="bg-paper border border-ink rounded-sm max-w-md w-full p-7 md:p-9 relative shadow-card-hover">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              aria-label="Close"
              className="absolute top-4 right-4 text-ink-muted hover:text-ink text-xl leading-none"
            >
              ×
            </button>

            <div className="label-caps mb-3">subscribe</div>
            <h3 className="font-display text-2xl md:text-3xl text-ink mb-2 leading-tight">
              {analystName}
            </h3>
            <p className="text-sm text-ink-muted mb-6 leading-relaxed">
              0.5 USDT · 30 days · See every signal in real time. Verifiable on-chain.
            </p>

            {/* Balance */}
            <div className="text-sm pt-4 border-t border-rule-subtle space-y-2 mb-6">
              <div className="flex justify-between">
                <span className="label-caps">your usdt</span>
                <span className="font-mono tabular text-ink">
                  {formatUnits(usdtBalance ?? 0n, 18)} USDT
                </span>
              </div>
              <div className="flex justify-between">
                <span className="label-caps">price</span>
                <span className="font-mono tabular text-ink">0.5 USDT</span>
              </div>
            </div>

            {hasInsufficientBalance && (
              <div className="mb-5 border border-warn-deep/30 bg-warn-soft px-3 py-2 rounded-sm text-sm text-warn-deep">
                Insufficient USDT. Hit the Kite faucet at{' '}
                <a
                  href="https://faucet.gokite.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  faucet.gokite.ai
                </a>
                .
              </div>
            )}

            {/* Step indicator */}
            <div className="flex items-center gap-2 mb-5 text-xs">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs ${
                  needsApproval ? 'bg-ink text-paper' : 'bg-signal text-paper'
                }`}
              >
                {needsApproval ? '1' : '✓'}
              </span>
              <span className="text-ink">Approve USDT</span>
              <span className="flex-1 h-px bg-rule-subtle mx-2" />
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs ${
                  needsApproval ? 'bg-ink-tertiary text-paper' : 'bg-ink text-paper'
                }`}
              >
                2
              </span>
              <span className={needsApproval ? 'text-ink-muted' : 'text-ink'}>Subscribe</span>
            </div>

            {error && (
              <div className="mb-4 border border-warn-deep/30 bg-warn-soft px-3 py-2 rounded-sm text-xs text-warn-deep break-words">
                {error}
              </div>
            )}

            {/* Action buttons */}
            {phase === 'success' ? (
              <div>
                <div className="border border-signal-deep/40 bg-signal/10 px-4 py-3 rounded-sm text-sm text-signal-deep mb-4">
                  ✓ Subscribed. You'll see {analystName}'s signals in real time.
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full bg-ink text-paper px-5 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors"
                >
                  Done
                </button>
              </div>
            ) : needsApproval ? (
              <button
                type="button"
                onClick={handleApprove}
                disabled={hasInsufficientBalance || phase === 'approving' || phase === 'approve-pending' || isTxConfirming}
                className="w-full bg-ink text-paper px-5 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {phase === 'approving'
                  ? 'Confirm in wallet…'
                  : phase === 'approve-pending'
                    ? 'Approving…'
                    : 'Approve 0.5 USDT'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubscribe}
                disabled={hasInsufficientBalance || phase === 'subscribing' || phase === 'subscribe-pending' || isTxConfirming}
                className="w-full bg-ink text-paper px-5 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {phase === 'subscribing'
                  ? 'Confirm in wallet…'
                  : phase === 'subscribe-pending'
                    ? 'Subscribing…'
                    : 'Subscribe · 0.5 USDT'}
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
