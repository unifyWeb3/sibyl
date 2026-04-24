'use client';

/**
 * MissionControl — schematic of the Sibyl three-agent flow.
 *
 * Structure:
 *   • SVG above — ink diagram with animated signal-green pulses on flow lines
 *   • HTML grid below — live counters with proper typography, separated from schematic
 *
 * This split gives counters real breathing room + typography weight that SVG
 * text can't match, and frees the diagram from the cramped layout that made
 * labels overlap in v1.
 */

export interface MissionControlProps {
  totalAttestations: number;
  hitRate: number;
  cumulativeBps: number;
}

export function MissionControl({
  totalAttestations,
  hitRate,
  cumulativeBps,
}: MissionControlProps) {
  const hitRatePct = (hitRate * 100).toFixed(1);
  const cumStr = cumulativeBps > 0 ? `+${cumulativeBps}` : String(cumulativeBps);
  const cumColor =
    cumulativeBps > 0 ? '#00A368' : cumulativeBps < 0 ? '#FF6B35' : '#0A0A0B';

  return (
    <div className="relative w-full max-w-[520px] mx-auto">
      {/* Halo behind the panel */}
      <div
        className="absolute inset-0 -z-10 blur-3xl"
        style={{
          background:
            'radial-gradient(circle at center, rgba(0,208,132,0.18), transparent 60%)',
        }}
        aria-hidden
      />

      {/* ─── Diagram panel ─── */}
      <div className="relative bg-paper-elevated border border-rule-subtle rounded-sm shadow-card">
        <svg
          viewBox="0 0 520 460"
          className="w-full h-auto block"
          fill="none"
        >
          {/* Corner brackets */}
          {[
            [18, 18, 'M 0 12 L 0 0 L 12 0'],
            [502, 18, 'M -12 0 L 0 0 L 0 12'],
            [18, 442, 'M 0 -12 L 0 0 L 12 0'],
            [502, 442, 'M -12 0 L 0 0 L 0 -12'],
          ].map(([x, y, d], i) => (
            <path
              key={i}
              d={d as string}
              transform={`translate(${x},${y})`}
              stroke="#0A0A0B"
              strokeWidth="1.5"
            />
          ))}

          {/* Faint grid */}
          <g stroke="#ECECE8" strokeWidth="0.5">
            {[115, 230, 345].map((y) => (
              <line key={`h${y}`} x1="40" y1={y} x2="480" y2={y} />
            ))}
            {[130, 260, 390].map((x) => (
              <line key={`v${x}`} x1={x} y1="40" x2={x} y2="420" />
            ))}
          </g>

          {/* Header row */}
          <text
            x="24"
            y="32"
            fill="#6B6B70"
            fontFamily="var(--font-jetbrains-mono), monospace"
            fontSize="10"
            letterSpacing="2"
          >
            SIBYL · SYSTEM · 001
          </text>
          <g>
            <circle cx="470" cy="28" r="3" fill="#00D084">
              <animate
                attributeName="opacity"
                values="1;0.35;1"
                dur="1.8s"
                repeatCount="indefinite"
              />
            </circle>
            <text
              x="482"
              y="32"
              fill="#00A368"
              fontFamily="var(--font-jetbrains-mono), monospace"
              fontSize="10"
              letterSpacing="2"
            >
              LIVE
            </text>
          </g>

          {/* ─── Agent nodes ─── */}
          {/* Analyst — top left (130, 160) */}
          <g>
            <circle cx="130" cy="160" r="42" fill="#FAFAF7" stroke="#0A0A0B" strokeWidth="1" />
            <circle cx="130" cy="160" r="14" fill="none" stroke="#0A0A0B" strokeWidth="0.75" opacity="0.35" />
            <circle cx="130" cy="160" r="4" fill="#00D084" />
            <text
              x="130"
              y="218"
              textAnchor="middle"
              fill="#0A0A0B"
              fontFamily="var(--font-jetbrains-mono), monospace"
              fontSize="11"
              letterSpacing="1.5"
            >
              ANALYST
            </text>
            <text
              x="130"
              y="233"
              textAnchor="middle"
              fill="#6B6B70"
              fontFamily="var(--font-jetbrains-mono), monospace"
              fontSize="8"
              letterSpacing="1"
            >
              signals →
            </text>
          </g>

          {/* Trader — top right (390, 160) */}
          <g>
            <circle cx="390" cy="160" r="42" fill="#FAFAF7" stroke="#0A0A0B" strokeWidth="1" />
            <rect x="383" y="153" width="14" height="14" fill="#00D084" />
            <text
              x="390"
              y="218"
              textAnchor="middle"
              fill="#0A0A0B"
              fontFamily="var(--font-jetbrains-mono), monospace"
              fontSize="11"
              letterSpacing="1.5"
            >
              TRADER
            </text>
            <text
              x="390"
              y="233"
              textAnchor="middle"
              fill="#6B6B70"
              fontFamily="var(--font-jetbrains-mono), monospace"
              fontSize="8"
              letterSpacing="1"
            >
              x402 →
            </text>
          </g>

          {/* Guardian — bottom center (260, 350) */}
          <g>
            <circle cx="260" cy="350" r="42" fill="#FAFAF7" stroke="#0A0A0B" strokeWidth="1" />
            <path
              d="M 260 338 L 272 344 L 272 358 L 260 366 L 248 358 L 248 344 Z"
              fill="#00D084"
            />
            <text
              x="260"
              y="408"
              textAnchor="middle"
              fill="#0A0A0B"
              fontFamily="var(--font-jetbrains-mono), monospace"
              fontSize="11"
              letterSpacing="1.5"
            >
              GUARDIAN
            </text>
            <text
              x="260"
              y="423"
              textAnchor="middle"
              fill="#6B6B70"
              fontFamily="var(--font-jetbrains-mono), monospace"
              fontSize="8"
              letterSpacing="1"
            >
              hedge
            </text>
          </g>

          {/* ─── Flow lines with traveling pulses ─── */}
          {/* Analyst → Trader */}
          <line
            x1="172"
            y1="160"
            x2="348"
            y2="160"
            stroke="#0A0A0B"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.4"
          />
          <circle r="4" fill="#00D084">
            <animateMotion dur="3s" repeatCount="indefinite" path="M 172 160 L 348 160" />
          </circle>

          {/* Trader → Guardian */}
          <line
            x1="368"
            y1="196"
            x2="288"
            y2="318"
            stroke="#0A0A0B"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.4"
          />
          <circle r="4" fill="#00D084" opacity="0.85">
            <animateMotion dur="3.4s" repeatCount="indefinite" begin="0.5s" path="M 368 196 L 288 318" />
          </circle>

          {/* Guardian → Analyst (attestation feedback) */}
          <line
            x1="228"
            y1="322"
            x2="148"
            y2="194"
            stroke="#0A0A0B"
            strokeWidth="1"
            strokeDasharray="4 4"
            opacity="0.4"
          />
          <circle r="4" fill="#00D084" opacity="0.7">
            <animateMotion dur="3.8s" repeatCount="indefinite" begin="1s" path="M 228 322 L 148 194" />
          </circle>
        </svg>
      </div>

      {/* ─── Live counters — separate panel below the diagram ─── */}
      <div className="mt-3 grid grid-cols-3 bg-paper-elevated border border-rule-subtle rounded-sm shadow-card">
        <div className="p-5 border-r border-rule-subtle">
          <div className="label-caps mb-2">attestations</div>
          <div className="font-mono text-xl md:text-2xl tabular text-ink">
            {String(totalAttestations).padStart(3, '0')}
          </div>
        </div>
        <div className="p-5 border-r border-rule-subtle text-center">
          <div className="label-caps mb-2">hit rate</div>
          <div className="font-mono text-xl md:text-2xl tabular text-signal">
            {hitRatePct}%
          </div>
        </div>
        <div className="p-5 text-right">
          <div className="label-caps mb-2">cumulative</div>
          <div
            className="font-mono text-xl md:text-2xl tabular"
            style={{ color: cumColor }}
          >
            {cumStr} bps
          </div>
        </div>
      </div>
    </div>
  );
}
