'use client';

/**
 * SubscribeButton — Day 14b state machine hardening.
 *
 * Full state machine for the trigger button:
 *
 *   not-mounted    → "Subscribe · 0.5 USDT" placeholder (no click handler)
 *   no-history     → "no signals yet" label (subscribe disabled)
 *   subscribed     → "● subscribed · Xd remaining" label
 *   disconnected   → "Subscribe · 0.5 USDT" → click opens ConnectKit modal
 *   wrong-network  → "Switch to Kite Testnet" → click triggers switchChain
 *   ready          → "Subscribe · 0.5 USDT" → click opens modal flow
 *
 * Modal flow inside (when ready and clicked):
 *   - Analyst summary
 *   - Compact duration (30d default, others behind 'change duration')
 *   - Summary block (cost + expiry + your USDT)
 *   - You unlock list
 *   - CTA → approve → auto-subscribe → success
 *
 * No more ambiguous states. Mounted gate eliminates hydration desync.
 */

import { useState, useEffect } from 'react';
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useSwitchChain,
} from 'wagmi';
import { useModal } from 'connectkit';
import {
  SIBYL_SUBSCRIPTIONS_ADDRESS,
  SIBYL_SUBSCRIPTIONS_ABI,
  USDT_ADDRESS,
  ERC20_ABI,
  DURATION_OPTIONS,
  quoteCostDays,
  formatCostUsdt,
  formatTimeRemaining,
  formatExpiryDate,
} from '@/lib/subs';
import { KITE_TESTNET_CHAIN_ID, KITE_TESTNET_NAME } from '@/lib/chains';
import { useMounted } from '@/lib/useMounted';
import { formatUnits, type Address } from 'viem';

interface SubscribeButtonProps {
  analyst: Address;
  analystName: string;
  strategy?: string;
  hitRatePct?: number;
  cumulativeBps?: number;
  totalAttests?: number;
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
  strategy,
  hitRatePct,
  cumulativeBps,
  totalAttests,
  variant = 'inline',
  hasHistory = true,
}: SubscribeButtonProps) {
  const mounted = useMounted();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { setOpen } = useModal();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const [showModal, setShowModal] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(30);
  const [showDurationPicker, setShowDurationPicker] = useState(false);

  const cost = quoteCostDays(selectedDays);
  const isWrongNetwork = isConnected && chainId !== KITE_TESTNET_CHAIN_ID;

  const { data: isSubscribed, refetch: refetchIsSubscribed } = useReadContract({
    address: SIBYL_SUBSCRIPTIONS_ADDRESS,
    abi: SIBYL_SUBSCRIPTIONS_ABI,
    functionName: 'isSubscribed',
    args: address ? [address, analyst] : undefined,
    query: { enabled: !!address && !isWrongNetwork, refetchInterval: showModal ? 4000 : 30000 },
  });

  const { data: timeLeft, refetch: refetchTimeLeft } = useReadContract({
    address: SIBYL_SUBSCRIPTIONS_ADDRESS,
    abi: SIBYL_SUBSCRIPTIONS_ABI,
    functionName: 'timeRemaining',
    args: address ? [address, analyst] : undefined,
    query: { enabled: !!address && !!isSubscribed && !isWrongNetwork, refetchInterval: 30000 },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: address ? [address, SIBYL_SUBSCRIPTIONS_ADDRESS] : undefined,
    query: { enabled: !!address && showModal && !isWrongNetwork },
  });

  const { data: usdtBalance } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address && showModal && !isWrongNetwork },
  });

  const { writeContract, data: txHash, reset: resetWrite } = useWriteContract();
  const { isLoading: isTxConfirming, isSuccess: isTxSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const needsApproval = (allowance ?? 0n) < cost;
  const hasInsufficientBalance = (usdtBalance ?? 0n) < cost;

  useEffect(() => {
    if (!isTxSuccess) return;
    if (phase === 'approve-pending') {
      (async () => {
        await refetchAllowance();
        resetWrite();
        setPhase('subscribing');
        setError(null);
        writeContract(
          {
            address: SIBYL_SUBSCRIPTIONS_ADDRESS,
            abi: SIBYL_SUBSCRIPTIONS_ABI,
            functionName: 'subscribe',
            args: [analyst, BigInt(selectedDays)],
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
      refetchTimeLeft();
    }
  }, [isTxSuccess, phase, analyst, selectedDays, writeContract, refetchAllowance, refetchIsSubscribed, refetchTimeLeft, resetWrite]);

  function handleClick() {
    // STATE: disconnected → open connect modal
    if (!isConnected) {
      setOpen(true);
      return;
    }
    // STATE: wrong-network → trigger switch
    if (isWrongNetwork) {
      switchChain({ chainId: KITE_TESTNET_CHAIN_ID });
      return;
    }
    // STATE: ready → open subscribe modal
    setShowModal(true);
    setPhase('idle');
    setError(null);
    setSelectedDays(30);
    setShowDurationPicker(false);
    resetWrite();
  }

  function handleStart() {
    setError(null);
    if (needsApproval) {
      setPhase('approving');
      writeContract(
        {
          address: USDT_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [SIBYL_SUBSCRIPTIONS_ADDRESS, cost],
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
      setPhase('subscribing');
      writeContract(
        {
          address: SIBYL_SUBSCRIPTIONS_ADDRESS,
          abi: SIBYL_SUBSCRIPTIONS_ABI,
          functionName: 'subscribe',
          args: [analyst, BigInt(selectedDays)],
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

  const baseClass =
    variant === 'block'
      ? 'group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-sm font-medium transition-colors'
      : 'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-sm transition-colors';

  // ─── State: not-mounted ── (prevents hydration desync) ──
  if (!mounted) {
    return (
      <span
        className={
          variant === 'block'
            ? `${baseClass} bg-ink-tertiary text-paper opacity-50`
            : `${baseClass} border-rule bg-paper-elevated text-ink-tertiary`
        }
      >
        Subscribe · 0.5 USDT
      </span>
    );
  }

  // ─── State: no-history ──
  if (!hasHistory) {
    return <span className="label-caps !text-ink-tertiary">no signals yet</span>;
  }

  // ─── State: subscribed ──
  if (isConnected && !isWrongNetwork && isSubscribed) {
    return (
      <span className="label-caps !text-signal-deep">
        ● subscribed · {formatTimeRemaining(Number(timeLeft ?? 0n))}
      </span>
    );
  }

  const isInFlight =
    phase === 'approving' ||
    phase === 'approve-pending' ||
    phase === 'subscribing' ||
    phase === 'subscribe-pending' ||
    isTxConfirming;

  // ─── State: wrong-network ──
  if (isConnected && isWrongNetwork) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isSwitching}
        className={
          variant === 'block'
            ? `${baseClass} bg-warn-deep text-paper hover:bg-warn-deep/90 disabled:opacity-50`
            : `${baseClass} border-warn-deep/40 bg-warn-soft text-warn-deep hover:border-warn-deep disabled:opacity-50`
        }
      >
        {isSwitching ? 'Switching network…' : `Switch to ${KITE_TESTNET_NAME}`}
      </button>
    );
  }

  // ─── State: disconnected OR ready (modal handles ready path) ──
  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          variant === 'block'
            ? `${baseClass} bg-ink text-paper hover:bg-ink-secondary`
            : `${baseClass} border-rule bg-paper-elevated text-ink hover:border-ink hover:text-signal-deep`
        }
      >
        {!isConnected ? 'Connect Wallet' : 'Subscribe · 0.5 USDT'}
        {variant === 'block' && (
          <span className="text-signal group-hover:translate-x-0.5 transition-transform">→</span>
        )}
      </button>

      {showModal && (
        <SubscribeModal
          analystName={analystName}
          strategy={strategy}
          hitRatePct={hitRatePct}
          cumulativeBps={cumulativeBps}
          totalAttests={totalAttests}
          selectedDays={selectedDays}
          setSelectedDays={setSelectedDays}
          showDurationPicker={showDurationPicker}
          setShowDurationPicker={setShowDurationPicker}
          cost={cost}
          usdtBalance={usdtBalance ?? 0n}
          hasInsufficientBalance={hasInsufficientBalance}
          needsApproval={needsApproval}
          phase={phase}
          error={error}
          isInFlight={isInFlight}
          onStart={handleStart}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── Modal extracted for readability ─────────────────────────────────────────

interface ModalProps {
  analystName: string;
  strategy?: string;
  hitRatePct?: number;
  cumulativeBps?: number;
  totalAttests?: number;
  selectedDays: number;
  setSelectedDays: (n: number) => void;
  showDurationPicker: boolean;
  setShowDurationPicker: (v: boolean | ((p: boolean) => boolean)) => void;
  cost: bigint;
  usdtBalance: bigint;
  hasInsufficientBalance: boolean;
  needsApproval: boolean;
  phase: Phase;
  error: string | null;
  isInFlight: boolean;
  onStart: () => void;
  onClose: () => void;
}

function SubscribeModal(props: ModalProps) {
  const {
    analystName, strategy, hitRatePct, cumulativeBps, totalAttests,
    selectedDays, setSelectedDays, showDurationPicker, setShowDurationPicker,
    cost, usdtBalance, hasInsufficientBalance, needsApproval,
    phase, error, isInFlight, onStart, onClose,
  } = props;

  const expiryTs = Math.floor(Date.now() / 1000) + selectedDays * 86400;

  const ctaLabel = (() => {
    if (phase === 'approving') return 'Confirm approve in wallet…';
    if (phase === 'approve-pending') return 'Approve confirming…';
    if (phase === 'subscribing') return 'Confirm subscribe in wallet…';
    if (phase === 'subscribe-pending') return 'Subscribe confirming…';
    return `Subscribe · ${formatCostUsdt(cost)}`;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isInFlight) onClose();
      }}
    >
      <div className="bg-paper border border-ink rounded-sm max-w-lg w-full p-7 md:p-9 relative shadow-card-hover max-h-[90vh] overflow-y-auto">
        <button
          type="button"
          onClick={() => !isInFlight && onClose()}
          disabled={isInFlight}
          aria-label="Close"
          className="absolute top-4 right-4 text-ink-muted hover:text-ink text-xl leading-none disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ×
        </button>

        <div className="label-caps mb-2">subscribe to</div>

        {phase !== 'success' && (
          <>
            <div className="mb-6 pb-5 border-b border-rule-subtle">
              <h3 className="font-display text-2xl md:text-3xl text-ink leading-tight mb-1">
                {analystName}
              </h3>
              {strategy && (
                <div className="label-caps !text-ink-muted mb-3">{strategy} strategy</div>
              )}
              {(hitRatePct !== undefined || cumulativeBps !== undefined) && (
                <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
                  {hitRatePct !== undefined && (
                    <div>
                      <div className="label-caps mb-0.5 text-[0.6rem]">hit rate</div>
                      <div className="font-mono tabular text-base text-ink">
                        {hitRatePct.toFixed(1)}<span className="text-ink-tertiary">%</span>
                      </div>
                    </div>
                  )}
                  {cumulativeBps !== undefined && (
                    <div>
                      <div className="label-caps mb-0.5 text-[0.6rem]">cumulative</div>
                      <div className={`font-mono tabular text-base ${
                        cumulativeBps > 0 ? 'text-signal-deep' :
                        cumulativeBps < 0 ? 'text-warn-deep' : 'text-ink'
                      }`}>
                        {cumulativeBps > 0 ? '+' : ''}{cumulativeBps} bps
                      </div>
                    </div>
                  )}
                  {totalAttests !== undefined && (
                    <div>
                      <div className="label-caps mb-0.5 text-[0.6rem]">attests</div>
                      <div className="font-mono tabular text-base text-ink">{totalAttests}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mb-5 p-4 bg-paper-subtle rounded-sm space-y-2 text-sm">
              <div className="flex justify-between items-baseline">
                <span className="label-caps">duration</span>
                <span className="font-mono tabular text-ink font-medium">{selectedDays} days</span>
              </div>
              <div className="flex justify-between">
                <span className="label-caps">total cost</span>
                <span className="font-mono tabular text-ink font-medium">{formatCostUsdt(cost)}</span>
              </div>
              <div className="flex justify-between">
                <span className="label-caps">access until</span>
                <span className="font-mono tabular text-ink">{formatExpiryDate(expiryTs)}</span>
              </div>
              <div className="flex justify-between">
                <span className="label-caps">your usdt</span>
                <span className="font-mono tabular text-ink-muted">
                  {formatUnits(usdtBalance, 18).slice(0, 8)} USDT
                </span>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => !isInFlight && setShowDurationPicker(v => !v)}
                  disabled={isInFlight}
                  className="text-xs text-signal-deep hover:underline disabled:opacity-50"
                >
                  {showDurationPicker ? '× hide options' : 'change duration →'}
                </button>
              </div>

              {showDurationPicker && (
                <div className="pt-3 grid grid-cols-4 gap-2">
                  {DURATION_OPTIONS.map((opt) => {
                    const optCost = quoteCostDays(opt.days);
                    const isSelected = selectedDays === opt.days;
                    return (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() => !isInFlight && setSelectedDays(opt.days)}
                        disabled={isInFlight}
                        className={`p-2 rounded-sm border transition-colors text-left ${
                          isSelected
                            ? 'border-ink bg-ink text-paper'
                            : 'border-rule bg-paper-elevated text-ink hover:border-ink-secondary'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <div className="font-display text-base leading-tight">{opt.days}d</div>
                        <div className={`font-mono text-[0.6rem] mt-0.5 ${
                          isSelected ? 'text-paper/70' : 'text-ink-muted'
                        }`}>
                          {formatCostUsdt(optCost).replace(' USDT', '')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mb-6 pl-3 border-l border-signal-deep/40">
              <div className="label-caps !text-signal-deep mb-2">you unlock</div>
              <ul className="space-y-1 text-sm text-ink-secondary">
                <li>· full bias + reasoning history</li>
                <li>· exportable reputation card</li>
                <li>· access until {formatExpiryDate(expiryTs)}</li>
              </ul>
            </div>

            {hasInsufficientBalance && (
              <div className="mb-4 border border-warn-deep/30 bg-warn-soft px-3 py-2 rounded-sm text-sm text-warn-deep">
                Insufficient USDT for {selectedDays} days. Need {formatCostUsdt(cost)}.{' '}
                <a href="https://faucet.gokite.ai/" target="_blank" rel="noopener noreferrer" className="underline">
                  Faucet ↗
                </a>
              </div>
            )}

            {error && (
              <div className="mb-4 border border-warn-deep/30 bg-warn-soft px-3 py-2 rounded-sm text-xs text-warn-deep break-words">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={onStart}
              disabled={hasInsufficientBalance || isInFlight}
              className="w-full bg-ink text-paper px-5 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {ctaLabel}
            </button>

            {isInFlight && (
              <p className="mt-3 text-center text-xs text-ink-muted">
                {needsApproval
                  ? 'Two wallet confirmations: approve, then subscribe. Stay on this screen.'
                  : 'One wallet confirmation. Stay on this screen.'}
              </p>
            )}
          </>
        )}

        {phase === 'success' && (
          <div className="py-2">
            <h3 className="font-display text-2xl md:text-3xl text-ink leading-tight mb-2">
              {analystName}
            </h3>
            <div className="border border-signal-deep/40 bg-signal/10 px-4 py-3 rounded-sm text-sm text-signal-deep mb-5">
              ✓ Subscribed for {selectedDays} days. Access until {formatExpiryDate(expiryTs)}.
            </div>
            <div className="space-y-2 text-sm text-ink-secondary mb-6">
              <div>You now see: bias, confidence, reasoning, history, exportable card.</div>
              <div>Next signal cycle: every 4 hours.</div>
            </div>
            <div className="flex flex-col md:flex-row gap-2">
              <a
                href="/me"
                className="flex-1 bg-ink text-paper px-5 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors text-center"
              >
                View My Signals →
              </a>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-sm font-medium text-ink-muted hover:text-ink transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
