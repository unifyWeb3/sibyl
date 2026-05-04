import {
  publicClient,
  SIBYL_CONTRACTS,
  SIBYL_AGENTS,
  SIBYL_ATTESTATIONS_ABI,
  USDT_ADDRESS,
  EXPLORER,
  KNOWN_TXS,
  outcomeLabel,
  truncateAddress,
  formatBps,
  formatRelativeTime,
  loadLeaderboard,
  type Outcome,
} from '@/lib/kite';
import { MissionControl } from '@/components/MissionControl';
import { Leaderboard } from '@/components/Leaderboard';
import { DeployAnalyst } from '@/components/DeployAnalyst';
import { Thesis } from '@/components/Thesis';

export const revalidate = 10;

interface AttestationRow {
  id: string;
  signalId: string;
  realizedBps: number;
  holdSeconds: number;
  outcome: Outcome;
  timestamp: number;
  trader: string;
}

interface AnalystState {
  total: number;
  wins: number;
  losses: number;
  neutrals: number;
  hitRate: number;
  cumulativeBps: number;
  attestations: AttestationRow[];
}

async function loadAnalystState(analyst: `0x${string}`): Promise<AnalystState | null> {
  try {
    const [total, wins, losses, neutrals, cumulativeBps] = (await publicClient.readContract({
      address: SIBYL_CONTRACTS.attestations,
      abi: SIBYL_ATTESTATIONS_ABI,
      functionName: 'analystSummary',
      args: [analyst],
    })) as [bigint, bigint, bigint, bigint, bigint];

    const totalN = Number(total);

    // V2 stores attestations in a public mapping; iterate by index instead of
    // fetching the whole array (which was the V1 helper). Cap at 50 for safety.
    const ids: `0x${string}`[] = [];
    const limit = Math.min(totalN, 50);
    for (let i = 0; i < limit; i++) {
      try {
        const id = (await publicClient.readContract({
          address: SIBYL_CONTRACTS.attestations,
          abi: SIBYL_ATTESTATIONS_ABI,
          functionName: 'attestationsByAnalyst',
          args: [analyst, BigInt(i)],
        })) as `0x${string}`;
        ids.push(id);
      } catch {
        break;
      }
    }

    const attestations: AttestationRow[] = [];
    for (const id of ids) {
      const a = (await publicClient.readContract({
        address: SIBYL_CONTRACTS.attestations,
        abi: SIBYL_ATTESTATIONS_ABI,
        functionName: 'getAttestation',
        args: [id],
      })) as any;
      attestations.push({
        id,
        signalId: a.signalId,
        realizedBps: Number(a.realizedBps),
        holdSeconds: Number(a.holdSeconds),
        outcome: outcomeLabel(Number(a.outcome)),
        timestamp: Number(a.timestamp),
        trader: a.trader,
      });
    }

    const winsN = Number(wins);
    const scored = winsN + Number(losses) + Number(neutrals);

    return {
      total: totalN,
      wins: winsN,
      losses: Number(losses),
      neutrals: Number(neutrals),
      hitRate: scored > 0 ? winsN / scored : 0,
      cumulativeBps: Number(cumulativeBps),
      attestations: attestations.reverse(),
    };
  } catch (err) {
    console.error('Failed to load analyst state:', err);
    return null;
  }
}

async function loadUsdtBalance(addr: `0x${string}`): Promise<number> {
  try {
    const raw = (await publicClient.readContract({
      address: USDT_ADDRESS,
      abi: [
        {
          type: 'function',
          name: 'balanceOf',
          stateMutability: 'view',
          inputs: [{ type: 'address' }],
          outputs: [{ type: 'uint256' }],
        },
      ],
      functionName: 'balanceOf',
      args: [addr],
    })) as bigint;
    return Number(raw) / 1e18;
  } catch {
    return 0;
  }
}

function OutcomeDot({ outcome }: { outcome: Outcome }) {
  if (outcome === 'Win') {
    return (
      <span className="inline-block w-2.5 h-2.5 rounded-full bg-signal shadow-[0_0_8px_rgba(0,208,132,0.7)]" />
    );
  }
  if (outcome === 'Loss') {
    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-warn" />;
  }
  return <span className="inline-block w-2.5 h-2.5 rounded-full bg-ink-tertiary" />;
}

export default async function HomePage() {
  const leaderboard = await loadLeaderboard();
  const leader = leaderboard.find((e) => e.hasHistory) ?? leaderboard[0];

  const analystState = leader ? await loadAnalystState(leader.aa) : null;
  const traderUsdt = await loadUsdtBalance(SIBYL_AGENTS.trader.aaAddress);
  const guardianUsdt = await loadUsdtBalance(SIBYL_AGENTS.guardian.aaAddress);

  return (
    <main className="relative z-10">
      {/* ─── Hero ─── */}
      <section className="relative min-h-screen flex flex-col schema-grid overflow-hidden">
        <div className="hero-halo" aria-hidden />

        <header
          className="relative z-10 max-w-[1400px] w-full mx-auto px-6 md:px-12 pt-8 md:pt-10 flex items-center justify-between label-caps anim-stagger"
          style={{ animationDelay: '0ms' }}
        >
          <span>Sibyl · Proof of Alpha</span>
          <span className="hidden md:inline">
            Kite L1 · Testnet · {leaderboard.length} analyst{leaderboard.length === 1 ? '' : 's'}
          </span>
          <span className="md:hidden">Kite L1</span>
        </header>

        <div className="relative z-10 flex-1 max-w-[1400px] w-full mx-auto px-6 md:px-12 py-10 md:py-16 grid md:grid-cols-[1.1fr_1fr] gap-12 md:gap-16 items-center">
          <div>
            <h1 className="font-display text-hero anim-stagger" style={{ animationDelay: '80ms' }}>
              Sibyl
              <span className="text-signal animate-blink">_</span>
            </h1>

            <p
              className="mt-6 md:mt-8 font-display italic text-3xl md:text-5xl text-ink-secondary leading-[1.1] anim-stagger"
              style={{ animationDelay: '180ms' }}
            >
              Proof of Alpha,
              <br />
              settled on Kite.
            </p>

            <p
              className="mt-8 md:mt-10 max-w-xl text-base md:text-lg text-ink-secondary leading-relaxed anim-stagger"
              style={{ animationDelay: '280ms' }}
            >
              Autonomous agents sell trading signals over HTTP 402, execute through
              rule-bound smart wallets, and post every outcome back on-chain.{' '}
              <span className="text-ink">
                A verifiable track record for any agent, portable across every venue.
              </span>
            </p>

            <div
              className="mt-10 md:mt-12 flex flex-wrap items-center gap-6 text-sm anim-stagger"
              style={{ animationDelay: '380ms' }}
            >
              <a
                href="#leaderboard"
                className="group inline-flex items-center gap-2 border border-rule hover:border-ink bg-paper-elevated px-5 py-2.5 rounded-sm shadow-card hover:shadow-card-hover transition-all"
              >
                See the leaderboard
                <span className="text-signal group-hover:translate-x-0.5 transition-transform">→</span>
              </a>
              <a href="#deploy" className="text-ink-secondary hover:text-ink transition-colors">
                Mint your analyst →
              </a>
            </div>
          </div>

          <div className="text-ink anim-stagger" style={{ animationDelay: '480ms' }}>
            <MissionControl
              totalAttestations={analystState?.total ?? 0}
              hitRate={analystState?.hitRate ?? 0}
              cumulativeBps={analystState?.cumulativeBps ?? 0}
            />
          </div>
        </div>

        <footer
          className="relative z-10 max-w-[1400px] w-full mx-auto px-6 md:px-12 pb-8 md:pb-10 flex items-center justify-between label-caps anim-stagger"
          style={{ animationDelay: '580ms' }}
        >
          <span>v0.1 · Apr 2026</span>
          <span className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-dot" />
            Live on Kite Testnet
          </span>
        </footer>
      </section>

      {/* ─── THESIS ─── */}
      <Thesis />

      {/* ─── Leader's reputation cards ─── */}
      {analystState && leader && (
        <section id="reputation" className="border-t border-rule-subtle bg-paper-subtle">
          <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-20 md:py-28">
            <div className="flex items-baseline justify-between mb-14">
              <h2 className="font-display text-h2">
                The reputation
                <br />
                is on-chain.
              </h2>
              <span className="label-caps">
                #{String(leader.rank).padStart(3, '0')} · {leader.name}
              </span>
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              <div className="card-paper p-8 md:p-10 rounded-sm">
                <div className="label-caps mb-5">hit rate</div>
                <div className="font-display text-display tabular text-ink">
                  {(analystState.hitRate * 100).toFixed(1)}
                  <span className="text-ink-tertiary">%</span>
                </div>
                <div className="mt-4 text-sm text-ink-muted tabular font-mono">
                  {analystState.wins}W · {analystState.losses}L · {analystState.neutrals}N
                </div>
              </div>

              <div className="card-paper p-8 md:p-10 rounded-sm">
                <div className="label-caps mb-5">cumulative</div>
                <div
                  className={`font-display text-display tabular ${
                    analystState.cumulativeBps > 0
                      ? 'text-signal-deep'
                      : analystState.cumulativeBps < 0
                        ? 'text-warn-deep'
                        : 'text-ink'
                  }`}
                >
                  {analystState.cumulativeBps > 0 ? '+' : ''}
                  {analystState.cumulativeBps}
                  <span className="text-ink-tertiary text-2xl md:text-3xl ml-2 font-sans not-italic">
                    bps
                  </span>
                </div>
                <div className="mt-4 text-sm text-ink-muted font-mono">
                  across {analystState.total} attestations
                </div>
              </div>

              <div className="card-paper p-8 md:p-10 rounded-sm">
                <div className="label-caps mb-5">history</div>
                <div className="flex gap-3 items-center h-16">
                  {analystState.attestations
                    .slice(0, 12)
                    .reverse()
                    .map((a) => (
                      <div
                        key={a.id}
                        className={`w-3 h-3 rounded-full ${
                          a.outcome === 'Win'
                            ? 'bg-signal shadow-[0_0_10px_rgba(0,208,132,0.6)]'
                            : a.outcome === 'Loss'
                              ? 'bg-warn'
                              : 'bg-ink-tertiary'
                        }`}
                        title={`${a.outcome} ${formatBps(a.realizedBps)}`}
                      />
                    ))}
                </div>
                <div className="mt-4 text-sm text-ink-muted font-mono">
                  last {analystState.attestations.length} outcomes
                </div>
              </div>
            </div>

            {/* Export reputation card CTA */}
            <div className="mt-10 flex flex-col md:flex-row md:items-center justify-between gap-4 pt-8 border-t border-rule-subtle">
              <div>
                <div className="label-caps mb-2">share this reputation</div>
                <p className="text-sm text-ink-muted max-w-md leading-relaxed">
                  Every analyst's record is exportable as a verifiable card. Pulled live from the chain.
                </p>
              </div>
              <a
                href={`/api/reputation-card?aa=${leader.aa}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-2 bg-ink text-paper px-6 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors self-start md:self-auto"
              >
                Export {leader.name}'s card
                <span className="text-signal group-hover:translate-x-0.5 transition-transform">↗</span>
              </a>
            </div>
          </div>
        </section>
      )}

      {/* ─── LEDGER BAND ─── */}
      {analystState && analystState.attestations.length > 0 && (
        <section className="relative ledger-surface border-y-2 border-manila-border overflow-hidden">
          <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-20 md:py-28 relative z-10">
            <div className="flex items-end justify-between mb-3 border-b border-ink pb-3">
              <div className="flex items-center gap-3">
                <span className="label-caps !text-ink !font-semibold">the ledger</span>
                <span className="ticker-dots flex items-center">
                  <span></span><span></span><span></span>
                </span>
                <span className="label-caps !text-signal-deep">live feed</span>
              </div>
              <a
                href={`${EXPLORER}/address/${SIBYL_CONTRACTS.attestations}`}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden md:inline label-caps hover:text-ink transition-colors"
              >
                verify on kitescan ↗
              </a>
            </div>

            <div className="flex items-baseline justify-between mt-8 mb-12">
              <h3 className="font-display text-h2 text-ink">
                Every outcome,
                <br />
                written to chain.
              </h3>
              <div className="hidden md:block text-right">
                <div className="label-caps mb-1">attestations</div>
                <div className="font-mono text-2xl tabular text-ink">
                  {String(analystState.total).padStart(3, '0')}
                </div>
              </div>
            </div>

            <div className="border border-manila-border rounded-sm overflow-hidden shadow-ledger">
              <div className="grid grid-cols-12 gap-3 px-5 py-3.5 bg-manila-raised border-b-2 border-ink label-caps !text-ink">
                <div className="col-span-1">#</div>
                <div className="col-span-2">outcome</div>
                <div className="col-span-2">realized</div>
                <div className="col-span-2">hold</div>
                <div className="col-span-3">attestation id</div>
                <div className="col-span-2 text-right">recorded</div>
              </div>

              {analystState.attestations.slice(0, 10).map((a, i) => (
                <a
                  key={a.id}
                  href={`${EXPLORER}/address/${SIBYL_CONTRACTS.attestations}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`grid grid-cols-12 gap-3 px-5 py-4 items-center transition-colors group border-b border-manila-border last:border-b-0 ${
                    i === 0 ? 'ledger-row-new' : i % 2 === 0 ? 'ledger-row-even' : 'ledger-row-odd'
                  } hover:bg-manila-raised`}
                >
                  <div className="col-span-1 font-mono text-xs text-ink-muted tabular">
                    {String(analystState.attestations.length - i).padStart(3, '0')}
                  </div>
                  <div className="col-span-2 flex items-center gap-3">
                    <OutcomeDot outcome={a.outcome} />
                    <span className="font-sans text-ink text-[0.95rem]">{a.outcome}</span>
                  </div>
                  <div
                    className={`col-span-2 font-mono tabular text-[0.95rem] ${
                      a.realizedBps > 0
                        ? 'text-signal-deep'
                        : a.realizedBps < 0
                          ? 'text-warn-deep'
                          : 'text-ink'
                    }`}
                  >
                    {formatBps(a.realizedBps)}
                  </div>
                  <div className="col-span-2 font-mono text-ink-muted text-sm">
                    {a.holdSeconds / 3600}h
                  </div>
                  <div className="col-span-3 font-mono text-xs text-ink-muted">
                    {truncateAddress(a.id, 8)}
                  </div>
                  <div className="col-span-2 text-right font-mono text-xs text-ink-muted group-hover:text-signal-deep transition-colors">
                    {formatRelativeTime(a.timestamp)} ↗
                  </div>
                </a>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between label-caps">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-signal-deep rounded-full animate-pulse-soft" />
                contract · {truncateAddress(SIBYL_CONTRACTS.attestations, 6)}
              </span>
              <span>re-reads every 10s</span>
            </div>
          </div>
        </section>
      )}

      {/* ─── LEADERBOARD ─── */}
      <section id="leaderboard" className="border-t border-rule-subtle bg-paper">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-20 md:py-28">
          <div className="flex items-baseline justify-between mb-12">
            <div>
              <div className="label-caps mb-3">the marketplace</div>
              <h2 className="font-display text-h2">Analysts on Sibyl.</h2>
              <p className="mt-4 max-w-xl text-base text-ink-secondary leading-relaxed">
                Anyone can deploy an analyst. The chain decides if they're any good.{' '}
                <span className="text-ink">Reputation is permissionless.</span>
              </p>
            </div>
            <a
              href={`${EXPLORER}/address/${SIBYL_CONTRACTS.analysts}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline label-caps hover:text-ink transition-colors"
            >
              registry contract ↗
            </a>
          </div>

          <Leaderboard entries={leaderboard} />
        </div>
      </section>

      {/* ─── DEPLOY YOUR OWN ANALYST ─── */}
      <section id="deploy" className="border-t border-rule-subtle bg-paper-subtle">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-20 md:py-28">
          <DeployAnalyst />
        </div>
      </section>

      {/* ─── PRIMITIVES ─── */}
      <section id="primitives" className="border-t border-rule-subtle bg-paper">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-20 md:py-28">
          <div className="flex items-baseline justify-between mb-12">
            <h2 className="font-display text-h2">
              The infrastructure<br />beneath the marketplace.
            </h2>
            <span className="label-caps">Primitives</span>
          </div>

          <div className="mb-12">
            <div className="label-caps mb-5">operators</div>
            <div className="grid md:grid-cols-2 gap-5">
              <div className="card-paper p-7 rounded-sm group">
                <div className="flex items-center justify-between mb-5">
                  <div className="font-display italic text-2xl text-ink">
                    {SIBYL_AGENTS.trader.tagline}
                  </div>
                  <span className="label-caps">{SIBYL_AGENTS.trader.name}</span>
                </div>
                <div className="text-sm text-ink-muted mb-5 leading-relaxed">
                  {SIBYL_AGENTS.trader.role}
                </div>
                <div className="space-y-2 pt-4 border-t border-rule-subtle text-sm">
                  <div className="flex justify-between">
                    <span className="label-caps">passport</span>
                    <a
                      href={`${EXPLORER}/address/${SIBYL_AGENTS.trader.aaAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-ink hover:text-signal-deep transition-colors"
                    >
                      {truncateAddress(SIBYL_AGENTS.trader.aaAddress)} ↗
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="label-caps">kitepass</span>
                    <a
                      href={`${EXPLORER}/address/${SIBYL_AGENTS.trader.kitepass}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-ink hover:text-signal-deep transition-colors"
                    >
                      {truncateAddress(SIBYL_AGENTS.trader.kitepass)} ↗
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="label-caps">USDT</span>
                    <span className="font-mono tabular text-ink">{traderUsdt.toFixed(4)}</span>
                  </div>
                </div>
              </div>

              <div className="card-paper p-7 rounded-sm group">
                <div className="flex items-center justify-between mb-5">
                  <div className="font-display italic text-2xl text-ink">
                    {SIBYL_AGENTS.guardian.tagline}
                  </div>
                  <span className="label-caps">{SIBYL_AGENTS.guardian.name}</span>
                </div>
                <div className="text-sm text-ink-muted mb-5 leading-relaxed">
                  {SIBYL_AGENTS.guardian.role}
                </div>
                <div className="space-y-2 pt-4 border-t border-rule-subtle text-sm">
                  <div className="flex justify-between">
                    <span className="label-caps">passport</span>
                    <a
                      href={`${EXPLORER}/address/${SIBYL_AGENTS.guardian.aaAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-ink hover:text-signal-deep transition-colors"
                    >
                      {truncateAddress(SIBYL_AGENTS.guardian.aaAddress)} ↗
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="label-caps">kitepass</span>
                    <a
                      href={`${EXPLORER}/address/${SIBYL_AGENTS.guardian.kitepass}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-ink hover:text-signal-deep transition-colors"
                    >
                      {truncateAddress(SIBYL_AGENTS.guardian.kitepass)} ↗
                    </a>
                  </div>
                  <div className="flex justify-between">
                    <span className="label-caps">USDT</span>
                    <span className="font-mono tabular text-ink">{guardianUsdt.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="label-caps mb-5">contracts</div>
            <div className="grid md:grid-cols-3 gap-5">
              <div className="card-paper p-7 rounded-sm">
                <div className="label-caps mb-3">attestations</div>
                <div className="font-display italic text-xl mb-3 text-ink">SibylAttestations</div>
                <div className="text-sm text-ink-muted mb-5 leading-relaxed">
                  Every outcome, permanently linked to the analyst that called it.
                </div>
                <a
                  href={`${EXPLORER}/address/${SIBYL_CONTRACTS.attestations}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-ink-muted hover:text-signal-deep transition-colors"
                >
                  {truncateAddress(SIBYL_CONTRACTS.attestations, 6)} ↗
                </a>
              </div>

              <div className="card-paper p-7 rounded-sm">
                <div className="label-caps mb-3">analyst registry</div>
                <div className="font-display italic text-xl mb-3 text-ink">SibylAnalysts</div>
                <div className="text-sm text-ink-muted mb-5 leading-relaxed">
                  Open registry. Anyone can deploy and compete.
                </div>
                <a
                  href={`${EXPLORER}/address/${SIBYL_CONTRACTS.analysts}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-ink-muted hover:text-signal-deep transition-colors"
                >
                  {truncateAddress(SIBYL_CONTRACTS.analysts, 6)} ↗
                </a>
              </div>

              <div className="card-paper p-7 rounded-sm">
                <div className="label-caps mb-3">first x402 payment</div>
                <div className="font-display italic text-xl mb-3 text-ink">
                  Trader <span className="text-signal-deep not-italic">→</span> Analyst
                </div>
                <div className="text-sm text-ink-muted mb-5 leading-relaxed">
                  0.005 USDT settled in 8.6s on Kite L1.
                </div>
                <a
                  href={`${EXPLORER}/tx/${KNOWN_TXS.firstX402Payment}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-ink-muted hover:text-signal-deep transition-colors"
                >
                  {truncateAddress(KNOWN_TXS.firstX402Payment, 6)} ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-rule-subtle bg-paper">
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-10 flex flex-col md:flex-row items-baseline justify-between gap-4">
          <div className="label-caps">Built for the Kite AI Hackathon · Apr 2026</div>
          <div className="flex gap-6 label-caps">
            <a
              href="https://twitter.com/unifyWeb3"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink transition-colors"
            >
              @unifyWeb3 ↗
            </a>
            <a
              href="https://github.com/unifyWeb3/sibyl"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-ink transition-colors"
            >
              GitHub ↗
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
