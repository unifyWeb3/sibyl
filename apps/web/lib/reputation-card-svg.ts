/**
 * Server-side SVG renderer for analyst reputation cards.
 *
 * Output dimensions: 1200x675 (Twitter OG card standard, also works for
 * LinkedIn/Discord previews). Pure SVG strings — no React DOM, no html2canvas,
 * no headless browser. Just deterministic markup based on on-chain data.
 *
 * Design language matches the landing page:
 *   - Paper background (#FAFAF7)
 *   - Instrument Serif italic for display
 *   - JetBrains Mono for tabular data
 *   - Single Kite green accent (#00A368)
 *   - Manila/kraft band for the ledger row
 */

interface ReputationCardData {
  rank: number;
  name: string;
  strategy: 'Bear' | 'Chaser' | 'Reverter' | 'Custom';
  aa: string;
  total: number;
  wins: number;
  losses: number;
  neutrals: number;
  hitRate: number;
  cumulativeBps: number;
  recentOutcomes: ('Win' | 'Loss' | 'Neutral')[];
}

const COLORS = {
  paper: '#FAFAF7',
  paperElevated: '#FFFFFF',
  manila: '#EFE7D4',
  manilaBorder: '#D4C9A8',
  ink: '#1A1A1A',
  inkSecondary: '#3D3D3A',
  inkMuted: '#7A7A75',
  inkTertiary: '#B8B8B0',
  rule: '#D8D6CC',
  ruleSubtle: '#E8E5D8',
  signal: '#00D084',
  signalDeep: '#00A368',
  warn: '#FF6B35',
  warnDeep: '#D94F1A',
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateAddress(addr: string, len = 6): string {
  if (!addr || addr.length <= len * 2 + 2) return addr;
  return `${addr.slice(0, len + 2)}…${addr.slice(-len)}`;
}

function strategyGlyph(strategy: string): string {
  // SVG path for each strategy, drawn in 24x24 viewbox
  switch (strategy) {
    case 'Bear':
      return `<path d="M 4 18 L 12 6 L 20 18" fill="none" stroke="${COLORS.signalDeep}" stroke-width="1.5"/>`;
    case 'Chaser':
      return `<path d="M 3 18 L 9 11 L 14 14 L 21 6 M 16 6 L 21 6 L 21 11" fill="none" stroke="${COLORS.signalDeep}" stroke-width="1.5"/>`;
    case 'Reverter':
      return `<path d="M 3 12 Q 7.5 3 12 12 T 21 12" fill="none" stroke="${COLORS.signalDeep}" stroke-width="1.5"/>`;
    default:
      return `<circle cx="12" cy="12" r="6" fill="none" stroke="${COLORS.signalDeep}" stroke-width="1.5"/>`;
  }
}

function outcomeDot(outcome: string, x: number, y: number): string {
  const color =
    outcome === 'Win' ? COLORS.signal : outcome === 'Loss' ? COLORS.warn : COLORS.inkTertiary;
  const glow = outcome === 'Win' ? `<circle cx="${x}" cy="${y}" r="10" fill="${COLORS.signal}" opacity="0.25"/>` : '';
  return `${glow}<circle cx="${x}" cy="${y}" r="6" fill="${color}"/>`;
}

export function renderReputationCardSvg(data: ReputationCardData): string {
  const W = 1200;
  const H = 675;

  const cumColor =
    data.cumulativeBps > 0 ? COLORS.signalDeep : data.cumulativeBps < 0 ? COLORS.warnDeep : COLORS.ink;
  const cumPrefix = data.cumulativeBps > 0 ? '+' : '';

  const hitRatePct = (data.hitRate * 100).toFixed(1);

  // Recent outcomes row — up to 12 dots, oldest left, newest right
  const dotsToShow = data.recentOutcomes.slice(0, 12);
  const dotSpacing = 38;
  const dotsStartX = 90;
  const dotsY = 555;
  const dotsRow = dotsToShow.map((o, i) => outcomeDot(o, dotsStartX + i * dotSpacing, dotsY)).join('');

  // Status — LIVE if has history, JUST JOINED otherwise
  const statusLabel = data.total > 0 ? 'LIVE ON KITE TESTNET' : 'JUST JOINED';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Inter', -apple-system, BlinkMacSystemFont, sans-serif">
  <!-- Definitions -->
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="2"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.03 0"/>
    </filter>
    <linearGradient id="signalGlow" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${COLORS.signal}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${COLORS.signal}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- Paper background -->
  <rect width="${W}" height="${H}" fill="${COLORS.paper}"/>
  <rect width="${W}" height="${H}" fill="url(#signalGlow)" opacity="0.6"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.4"/>

  <!-- Top frame line + label -->
  <line x1="60" y1="60" x2="${W - 60}" y2="60" stroke="${COLORS.ink}" stroke-width="1"/>
  <text x="60" y="48" font-size="11" letter-spacing="0.15em" fill="${COLORS.inkMuted}">SIBYL · PROOF OF ALPHA</text>
  <text x="${W - 60}" y="48" font-size="11" letter-spacing="0.15em" fill="${COLORS.inkMuted}" text-anchor="end">PASSPORT · #${String(data.rank).padStart(3, '0')}</text>

  <!-- Strategy badge + name -->
  <g transform="translate(60, 110)">
    <g transform="translate(0, 8) scale(1.4)">${strategyGlyph(data.strategy)}</g>
    <text x="50" y="24" font-size="13" letter-spacing="0.18em" fill="${COLORS.signalDeep}" font-weight="600">${data.strategy.toUpperCase()}</text>
  </g>

  <!-- Analyst name (italic display) -->
  <text x="60" y="240" font-family="'Instrument Serif', Georgia, serif" font-style="italic" font-size="116" fill="${COLORS.ink}" font-weight="400">${escapeXml(data.name)}</text>

  <!-- AA address -->
  <text x="60" y="288" font-family="'JetBrains Mono', monospace" font-size="16" fill="${COLORS.inkMuted}">${truncateAddress(data.aa, 8)}</text>

  <!-- Stats row — three columns -->
  <g transform="translate(60, 360)">
    <!-- Hit rate -->
    <text font-size="11" letter-spacing="0.15em" fill="${COLORS.inkMuted}">HIT RATE</text>
    <text y="64" font-family="'Instrument Serif', Georgia, serif" font-size="68" fill="${COLORS.ink}" font-weight="400">${hitRatePct}<tspan font-size="36" fill="${COLORS.inkTertiary}">%</tspan></text>
    <text y="98" font-family="'JetBrains Mono', monospace" font-size="14" fill="${COLORS.inkMuted}">${data.wins}W · ${data.losses}L · ${data.neutrals}N</text>

    <!-- Cumulative bps -->
    <g transform="translate(380, 0)">
      <text font-size="11" letter-spacing="0.15em" fill="${COLORS.inkMuted}">CUMULATIVE</text>
      <text y="64" font-family="'Instrument Serif', Georgia, serif" font-size="68" fill="${cumColor}" font-weight="400">${cumPrefix}${data.cumulativeBps}<tspan font-size="32" fill="${COLORS.inkTertiary}" font-family="'Inter', sans-serif" dx="12">bps</tspan></text>
      <text y="98" font-family="'JetBrains Mono', monospace" font-size="14" fill="${COLORS.inkMuted}">across ${data.total} attestation${data.total === 1 ? '' : 's'}</text>
    </g>

    <!-- Attestations -->
    <g transform="translate(820, 0)">
      <text font-size="11" letter-spacing="0.15em" fill="${COLORS.inkMuted}">ATTESTATIONS</text>
      <text y="64" font-family="'Instrument Serif', Georgia, serif" font-size="68" fill="${COLORS.ink}" font-weight="400">${String(data.total).padStart(3, '0')}</text>
      <text y="98" font-family="'JetBrains Mono', monospace" font-size="14" fill="${COLORS.inkMuted}">verified by Pyth</text>
    </g>
  </g>

  <!-- Recent outcomes — manila ledger band -->
  <rect x="0" y="510" width="${W}" height="105" fill="${COLORS.manila}"/>
  <rect x="0" y="510" width="${W}" height="1" fill="${COLORS.manilaBorder}"/>
  <rect x="0" y="614" width="${W}" height="1" fill="${COLORS.manilaBorder}"/>

  <text x="60" y="540" font-size="11" letter-spacing="0.15em" fill="${COLORS.ink}" font-weight="600">RECENT OUTCOMES →</text>
  ${dotsRow}

  <!-- Bottom frame -->
  <line x1="60" y1="640" x2="${W - 60}" y2="640" stroke="${COLORS.ink}" stroke-width="1"/>
  <text x="60" y="660" font-size="11" letter-spacing="0.15em" fill="${COLORS.signalDeep}" font-weight="600">● ${statusLabel}</text>
  <text x="${W - 60}" y="660" font-size="11" letter-spacing="0.15em" fill="${COLORS.inkMuted}" text-anchor="end">USESIBYL.VERCEL.APP</text>
</svg>`;
}

export type { ReputationCardData };
