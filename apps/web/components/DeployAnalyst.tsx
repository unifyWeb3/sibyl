'use client';

import { useState, useRef, useEffect } from 'react';
import { EXPLORER, truncateAddress } from '@/lib/kite';

type Strategy = 0 | 1 | 2 | 3;

const STRATEGIES: {
  value: Strategy;
  name: string;
  glyph: React.ReactNode;
  tagline: string;
}[] = [
  {
    value: 0,
    name: 'Bear',
    tagline: 'Shorts pumps. Fades euphoria.',
    glyph: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M 4 18 L 12 6 L 20 18" />
      </svg>
    ),
  },
  {
    value: 1,
    name: 'Chaser',
    tagline: 'Rides momentum. Catches breakouts.',
    glyph: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M 3 18 L 9 11 L 14 14 L 21 6" />
        <path d="M 16 6 L 21 6 L 21 11" />
      </svg>
    ),
  },
  {
    value: 2,
    name: 'Reverter',
    tagline: 'Fades extremes. Buys fear.',
    glyph: (
      <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M 3 12 Q 7.5 3, 12 12 T 21 12" />
      </svg>
    ),
  },
];

interface DeployedAnalyst {
  aa: string;
  name: string;
  strategy: Strategy;
  salt: string;
  deployTxHash: string | null;
  fundTxHash: string | null;
  registerTxHash: string | null;
  rank: number;
  recovered: boolean;
}

type ProgressStep = 'preflight' | 'wallet' | 'fund' | 'register' | 'complete' | 'error';

interface ProgressEvent {
  step: ProgressStep;
  message: string;
  data?: any;
}

const STEP_ORDER: ProgressStep[] = ['preflight', 'wallet', 'fund', 'register', 'complete'];

function nextSignalAt(): Date {
  const now = new Date();
  const hour = now.getUTCHours();
  const nextHour = (Math.floor(hour / 4) + 1) * 4;
  const next = new Date(now);
  next.setUTCHours(nextHour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'any moment';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `~${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function useCountdown(target: Date | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (!target) return '';
  return formatCountdown(target.getTime() - now);
}

function StrategyGlyph({ strategy }: { strategy: Strategy }) {
  const found = STRATEGIES.find((s) => s.value === strategy);
  return found ? found.glyph : null;
}

function strategyName(strategy: Strategy): string {
  const found = STRATEGIES.find((s) => s.value === strategy);
  return found?.name ?? 'Custom';
}

// Safe address truncate — used in case backend ever sends null/undefined
function safeTruncate(addr: string | null | undefined, len = 6): string {
  if (!addr || typeof addr !== 'string') return '—';
  if (addr.length <= len * 2 + 2) return addr;
  return `${addr.slice(0, len + 2)}…${addr.slice(-len)}`;
}

export function DeployAnalyst() {
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState<Strategy>(0);
  const [hp, setHp] = useState('');
  const [phase, setPhase] = useState<'form' | 'deploying' | 'success' | 'error'>('form');
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [result, setResult] = useState<DeployedAnalyst | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const cancelRef = useRef(false);

  const [signalTarget, setSignalTarget] = useState<Date | null>(null);
  const countdown = useCountdown(signalTarget);

  useEffect(() => {
    if (result) setSignalTarget(nextSignalAt());
  }, [result]);

  const currentStep = progress.length > 0 ? progress[progress.length - 1].step : 'preflight';
  const currentMessage = progress.length > 0 ? progress[progress.length - 1].message : '';

  async function handleDeploy(e: React.FormEvent) {
    e.preventDefault();
    if (phase === 'deploying') return;

    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setErrorMsg('Name needs at least 2 characters.');
      return;
    }

    setPhase('deploying');
    setProgress([]);
    setErrorMsg('');
    cancelRef.current = false;

    try {
      const res = await fetch('/api/deploy-analyst', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, strategy, _hp: hp }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        setErrorMsg(err.error || `HTTP ${res.status}`);
        setPhase('error');
        return;
      }

      if (!res.body) throw new Error('no response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (cancelRef.current) {
          reader.cancel();
          break;
        }
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          if (!frame.trim()) continue;
          let event = 'message';
          let data: any = null;
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) event = line.slice(7).trim();
            else if (line.startsWith('data: ')) {
              try {
                data = JSON.parse(line.slice(6));
              } catch {}
            }
          }
          if (!data) continue;

          if (event === 'progress') {
            setProgress((p) => [...p, data]);
          } else if (event === 'complete') {
            setProgress((p) => [...p, data]);
            setResult(data.data as DeployedAnalyst);
            setPhase('success');
          } else if (event === 'error') {
            setErrorMsg(data.message || 'Deploy failed');
            setPhase('error');
          }
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Network error');
      setPhase('error');
    }
  }

  function reset() {
    setPhase('form');
    setProgress([]);
    setResult(null);
    setErrorMsg('');
    setName('');
    setStrategy(0);
  }

  // ─── FORM ─────────────────────────────────────────────────────────────────
  if (phase === 'form' || phase === 'error') {
    return (
      <div className="card-paper p-8 md:p-12 rounded-sm relative">
        <div className="label-caps mb-3">deploy</div>
        <h3 className="font-display text-h2 mb-3">Mint your analyst.</h3>
        <p className="text-base md:text-lg text-ink-secondary leading-relaxed max-w-xl mb-10">
          Give them a name. Pick a strategy. Once deployed, they compete on the
          leaderboard. <span className="text-ink">Forever.</span>
        </p>

        <form onSubmit={handleDeploy} className="space-y-8">
          <div
            aria-hidden
            style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
          >
            <label>
              Don't fill this:
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
              />
            </label>
          </div>

          <div>
            <label className="label-caps block mb-3">name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 30))}
              placeholder="The Doomsayer"
              className="w-full md:max-w-md bg-paper-elevated border border-rule px-4 py-3 rounded-sm text-lg font-display italic text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-ink transition-colors"
              maxLength={30}
              autoComplete="off"
              spellCheck={false}
              required
            />
            <div className="mt-2 label-caps">
              {name.length}/30 · letters, numbers, spaces, -_'.
            </div>
          </div>

          <div>
            <label className="label-caps block mb-4">strategy</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {STRATEGIES.map((s) => {
                const active = strategy === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setStrategy(s.value)}
                    className={`p-5 rounded-sm border transition-all text-left group ${
                      active
                        ? 'border-ink bg-paper-elevated shadow-card-hover'
                        : 'border-rule-subtle bg-paper-elevated hover:border-rule shadow-card hover:shadow-card-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={active ? 'text-signal-deep' : 'text-ink'}>{s.glyph}</div>
                      <div className="label-caps">
                        {active ? '● selected' : 'select'}
                      </div>
                    </div>
                    <div className="font-display italic text-2xl text-ink mb-2">
                      {s.name}
                    </div>
                    <div className="text-sm text-ink-muted leading-snug">{s.tagline}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {errorMsg && (
            <div className="border border-warn-deep/30 bg-warn-soft px-4 py-3 rounded-sm text-sm text-warn-deep">
              {errorMsg}
            </div>
          )}

          <div className="flex flex-col md:flex-row md:items-center gap-4 pt-4">
            <button
              type="submit"
              disabled={name.trim().length < 2}
              className="group inline-flex items-center justify-center gap-2 bg-ink text-paper px-7 py-3.5 rounded-sm font-medium hover:bg-ink-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Deploy on Kite L1
              <span className="text-signal group-hover:translate-x-0.5 transition-transform">→</span>
            </button>
            <span className="label-caps">
              ≈ 30 seconds · 1 deploy per IP per 30 min
            </span>
          </div>
        </form>
      </div>
    );
  }

  // ─── DEPLOYING ───────────────────────────────────────────────────────────
  if (phase === 'deploying') {
    return (
      <div className="card-paper p-8 md:p-12 rounded-sm">
        <div className="label-caps mb-3 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-dot" />
          deploying
        </div>
        <h3 className="font-display text-h2 mb-2">Welcoming {name.trim()} to Sibyl.</h3>
        <p className="text-base text-ink-secondary mb-10">{currentMessage}</p>

        <div className="space-y-3 mb-8">
          {STEP_ORDER.filter((s) => s !== 'complete').map((step) => {
            const stepIndex = STEP_ORDER.indexOf(step);
            const currentIndex = STEP_ORDER.indexOf(currentStep);
            const active = currentIndex === stepIndex;
            const done = currentIndex > stepIndex;

            const labels: Record<ProgressStep, string> = {
              preflight: 'Reserving the passport',
              wallet: 'Giving them a wallet on Kite L1',
              fund: 'Funding with KITE',
              register: 'Registering in the marketplace',
              complete: 'Done',
              error: 'Error',
            };

            return (
              <div
                key={step}
                className={`flex items-center gap-4 py-3 px-4 rounded-sm border ${
                  active
                    ? 'border-rule bg-paper-elevated'
                    : done
                      ? 'border-rule-subtle'
                      : 'border-rule-subtle opacity-50'
                }`}
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  {done ? (
                    <span className="text-signal-deep">✓</span>
                  ) : active ? (
                    <span className="w-2 h-2 rounded-full bg-signal animate-pulse-dot" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-ink-tertiary" />
                  )}
                </div>
                <div className="flex-1 text-sm">{labels[step]}</div>
                <div className="label-caps">
                  {done ? 'done' : active ? 'in progress…' : 'pending'}
                </div>
              </div>
            );
          })}
        </div>

        <div className="label-caps">
          this takes ~30s. don't close the tab.
        </div>
      </div>
    );
  }

  // ─── SUCCESS — passport reveal ──────────────────────────────────────────
  if (phase === 'success' && result) {
    const tweetText = encodeURIComponent(
      `Just deployed ${result.name} on Sibyl 👁️\nA ${strategyName(result.strategy)} agent now competing on-chain.\nNo opinions. Just track record.\n\nusesibyl.vercel.app`
    );

    return (
      <div className="card-paper p-8 md:p-12 rounded-sm relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,208,132,0.10), transparent 70%)',
          }}
          aria-hidden
        />

        <div className="relative">
          <div className="label-caps mb-3 flex items-center gap-2 !text-signal-deep">
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-dot" />
            live on kite testnet
          </div>

          <h3 className="font-display text-h2 mb-2">{result.name} is live.</h3>
          <p className="text-base text-ink-secondary mb-10">
            {result.recovered
              ? 'Recovered from a prior deploy. Now registered on-chain.'
              : 'Released into the marketplace. The chain decides from here.'}
          </p>

          {/* Passport card */}
          <div className="border-2 border-ink rounded-sm p-7 md:p-9 bg-paper-elevated mb-8 relative">
            <div className="absolute top-3 right-3 label-caps">
              passport · #{String(result.rank).padStart(3, '0')}
            </div>

            <div className="flex items-start gap-5 mb-7">
              <div className="text-signal-deep">
                <StrategyGlyph strategy={result.strategy} />
              </div>
              <div className="flex-1">
                <div className="label-caps mb-1">{strategyName(result.strategy)}</div>
                <div className="font-display italic text-3xl md:text-4xl text-ink leading-tight">
                  {result.name}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-sm pt-5 border-t border-rule-subtle">
              {/* AA address — always present */}
              <div className="flex justify-between items-center">
                <span className="label-caps">aa address</span>
                <a
                  href={`${EXPLORER}/address/${result.aa}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-ink hover:text-signal-deep transition-colors"
                >
                  {safeTruncate(result.aa, 6)} ↗
                </a>
              </div>

              {/* Deploy tx — only when we actually deployed (not recovered) */}
              {result.deployTxHash ? (
                <div className="flex justify-between items-center">
                  <span className="label-caps">deploy tx</span>
                  <a
                    href={`${EXPLORER}/tx/${result.deployTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-ink hover:text-signal-deep transition-colors"
                  >
                    {safeTruncate(result.deployTxHash, 6)} ↗
                  </a>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="label-caps">wallet</span>
                  <span className="font-mono text-ink-muted text-xs">recovered from prior deploy</span>
                </div>
              )}

              {/* Fund tx — only when we funded fresh */}
              {result.fundTxHash && (
                <div className="flex justify-between items-center">
                  <span className="label-caps">fund tx</span>
                  <a
                    href={`${EXPLORER}/tx/${result.fundTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-ink hover:text-signal-deep transition-colors"
                  >
                    {safeTruncate(result.fundTxHash, 6)} ↗
                  </a>
                </div>
              )}

              {/* Register tx — present unless this analyst was already registered before our request */}
              {result.registerTxHash && (
                <div className="flex justify-between items-center">
                  <span className="label-caps">register tx</span>
                  <a
                    href={`${EXPLORER}/tx/${result.registerTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-ink hover:text-signal-deep transition-colors"
                  >
                    {safeTruncate(result.registerTxHash, 6)} ↗
                  </a>
                </div>
              )}

              <div className="flex justify-between items-center">
                <span className="label-caps">attestations</span>
                <span className="font-mono text-ink-muted">0 · just joined</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="label-caps">first signal</span>
                <span className="font-mono text-signal-deep tabular">{countdown}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <a
              href={`https://twitter.com/intent/tweet?text=${tweetText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center justify-center gap-2 bg-ink text-paper px-6 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors"
            >
              Tweet this
              <span className="group-hover:translate-x-0.5 transition-transform">↗</span>
            </a>
            <a
              href="#leaderboard"
              className="inline-flex items-center justify-center gap-2 border border-rule px-6 py-3 rounded-sm font-medium hover:border-ink transition-colors"
            >
              See on the leaderboard ↓
            </a>
            <button
              type="button"
              onClick={reset}
              className="text-ink-muted hover:text-ink transition-colors text-sm md:ml-auto"
            >
              Deploy another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
