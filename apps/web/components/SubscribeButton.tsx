'use client';

/**
 * SubscribeButton — modal-driven approve+subscribe flow.
 *
 * Day 12 fix: when approve tx confirms, automatically fire the subscribe tx
 * without requiring a second button click. Eliminates the "user closes modal
 * after approve, never subscribes, paid for nothing" failure mode that hit
 * us on Day 11 testing.
 *
 * The user still confirms TWO wallet pop-ups (approve, then subscribe) — that's
 * inherent to ERC-20 + spend pattern. But they don't have to manually click
 * a UI button between them.
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
  hasHistory?: boolean;
}

type Phase =
  | 'idle'
  | 'approving'
  | 'approve-pending'
  | 'subscribing'
  | 'subscribe-pending'
  | 'success'
  | 'error';

export function SubscribeButton({
  analyst,
  analystName,
  variant = 'inline',
  hasHistory = true,
}: SubscribeButtonProps) {
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

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
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

  // ─── Auto-advance: when approve confirms, immediately call subscribe ──
  useEffect(() => {
    if (!isTxSuccess) return;

    if (phase === 'approve-pending') {
      // Approve landed. Refresh allowance, then auto-fire subscribe.
      (async () => {
        await refetchAllowance();
        // Reset the write hook so the next tx can be fired
        resetWrite();
        // Fire subscribe automatically — user already committed by clicking once
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
      })();
    } else if (phase === 'subscribe-pending') {
      setPhase('success');
      refetchIsSubscribed();
    }
  }, [isTxSuccess, phase, analyst, writeContract, refetchAllowance, refetchIsSubscribed, resetWrite]);

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

  function handleStart() {
    setError(null);
    if (needsApproval) {
      // Step 1 of 2: approve (subscribe will auto-fire on confirm)
      setPhase('approving');
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
    } else {
      // Already approved — go straight to subscribe
      setPhase('subscribing');
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
  }

  // ─── Render: button ──
  const buttonClasses =
    variant === 'block'
      ? 'group inline-flex items-center justify-center gap-2 bg-ink text-paper px-6 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors'
      : 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-rule rounded-sm bg-paper-elevated text-ink hover:border-ink hover:text-signal-deep transition-colors';

  if (isConnected && isSubscribed) {
    return (
      <span className="label-caps !text-signal-deep">
        ● subscribed · {formatTimeRemaining(Number(timeLeft ?? 0n))}
      </span>
    );
  }

  if (!hasHistory) {
    return <span className="label-caps !text-ink-tertiary">no signals yet</span>;
  }

  // Live phase label for the action button — communicates auto-flow
  const actionLabel = (() => {
    if (phase === 'approving') return 'Confirm approve in wallet…';
    if (phase === 'approve-pending') return 'Approve confirming…';
    if (phase === 'subscribing') return 'Confirm subscribe in wallet…';
    if (phase === 'subscribe-pending') return 'Subscribe confirming…';
    return needsApproval ? 'Subscribe · 0.5 USDT' : 'Subscribe · 0.5 USDT';
  })();

  const isInFlight =
    phase === 'approving' ||
    phase === 'approve-pending' ||
    phase === 'subscribing' ||
    phase === 'subscribe-pending' ||
    isTxConfirming;

  return (
    <>
      <button type="button" onClick={handleClick} className={buttonClasses}>
        Subscribe · 0.5 USDT
        {variant === 'block' && (
          <span className="text-signal group-hover:translate-x-0.5 transition-transform">→</span>
        )}
      </button>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={(e) => {
            // Don't allow closing mid-flight — easy to miss-click
            if (e.target === e.currentTarget && !isInFlight) setShowModal(false);
          }}
        >
          <div className="bg-paper border border-ink rounded-sm max-w-md w-full p-7 md:p-9 relative shadow-card-hover">
            <button
              type="button"
              onClick={() => !isInFlight && setShowModal(false)}
              disabled={isInFlight}
              aria-label="Close"
              className="absolute top-4 right-4 text-ink-muted hover:text-ink text-xl leading-none disabled:opacity-30 disabled:cursor-not-allowed"
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

            <div className="flex items-center gap-2 mb-5 text-xs">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs ${
                  phase === 'subscribing' ||
                  phase === 'subscribe-pending' ||
                  phase === 'success'
                    ? 'bg-signal text-paper'
                    : phase === 'approving' || phase === 'approve-pending'
                      ? 'bg-ink text-paper'
                      : needsApproval
                        ? 'bg-ink text-paper'
                        : 'bg-signal text-paper'
                }`}
              >
                {needsApproval && phase !== 'subscribing' && phase !== 'subscribe-pending' && phase !== 'success'
                  ? '1'
                  : '✓'}
              </span>
              <span className="text-ink">Approve USDT</span>
              <span className="flex-1 h-px bg-rule-subtle mx-2" />
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs ${
                  phase === 'success'
                    ? 'bg-signal text-paper'
                    : phase === 'subscribing' || phase === 'subscribe-pending'
                      ? 'bg-ink text-paper'
                      : 'bg-ink-tertiary text-paper'
                }`}
              >
                {phase === 'success' ? '✓' : '2'}
              </span>
              <span className={phase === 'idle' && needsApproval ? 'text-ink-muted' : 'text-ink'}>
                Subscribe
              </span>
            </div>

            {error && (
              <div className="mb-4 border border-warn-deep/30 bg-warn-soft px-3 py-2 rounded-sm text-xs text-warn-deep break-words">
                {error}
              </div>
            )}

            {phase === 'success' ? (
              <div>
                <div className="border border-signal-deep/40 bg-signal/10 px-4 py-3 rounded-sm text-sm text-signal-deep mb-4">
                  ✓ Subscribed. You'll see {analystName}'s signals in real time for 30 days.
                </div>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="w-full bg-ink text-paper px-5 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                disabled={hasInsufficientBalance || isInFlight}
                className="w-full bg-ink text-paper px-5 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {actionLabel}
              </button>
            )}

            {/* Reassurance copy when in flight, since closing is blocked */}
            {isInFlight && (
              <p className="mt-3 text-center text-xs text-ink-muted">
                {needsApproval
                  ? 'Two wallet confirmations: approve, then subscribe. Stay on this screen.'
                  : 'One wallet confirmation. Stay on this screen.'}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
