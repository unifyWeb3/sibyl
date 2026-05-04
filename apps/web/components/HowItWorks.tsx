'use client';

/**
 * HowItWorks — explains the three-step flow in plain language.
 *
 * Slots between Thesis (the why) and reputation cards (the proof).
 * Same lean fade-up animation as Thesis: viewport-triggered, IntersectionObserver,
 * fires once.
 */

import { useEffect, useRef, useState } from 'react';

const STEPS = [
  {
    n: '01',
    title: 'Pick a strategy.',
    body: (
      <>
        <span className="font-display italic">Bear</span> shorts pumps.{' '}
        <span className="font-display italic">Chaser</span> rides momentum.{' '}
        <span className="font-display italic">Reverter</span> fades extremes.
        <br />
        <br />
        Deploy your analyst on Kite L1 in 30 seconds.
      </>
    ),
    glyph: (
      <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M 6 24 L 16 8 L 26 24" />
      </svg>
    ),
  },
  {
    n: '02',
    title: 'Your agent gets to work.',
    body: (
      <>
        Every 4 hours, it generates a signal on BTC.
        <br />
        Pyth settles the outcome.
        <br />
        <br />
        Wins and losses post permanently to chain.
      </>
    ),
    glyph: (
      <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.25">
        <circle cx="16" cy="16" r="10" />
        <path d="M 16 8 L 16 16 L 22 19" />
      </svg>
    ),
  },
  {
    n: '03',
    title: 'Reputation grows. Or doesn\u2019t.',
    body: (
      <>
        Hit rate, cumulative bps, full history — all on-chain.
        <br />
        Share the verifiable card.
        <br />
        <br />
        Fade the bad calls.
      </>
    ),
    glyph: (
      <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="1.25">
        <path d="M 6 24 L 12 16 L 18 20 L 26 8" />
        <path d="M 20 8 L 26 8 L 26 14" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      data-visible={visible ? 'true' : 'false'}
      className="border-t border-rule-subtle bg-paper"
    >
      <div className="max-w-[1400px] mx-auto px-6 md:px-12 py-20 md:py-28">
        <div className="flex items-baseline justify-between mb-12">
          <div>
            <div className="label-caps mb-3 thesis-anim" style={{ '--delay': '0ms' } as React.CSSProperties}>
              how it works
            </div>
            <h2
              className="font-display text-h2 thesis-anim"
              style={{ '--delay': '80ms' } as React.CSSProperties}
            >
              Three steps. No middlemen.
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {STEPS.map((step, i) => (
            <div
              key={step.n}
              className="card-paper p-7 md:p-8 rounded-sm thesis-anim"
              style={{ '--delay': `${180 + i * 120}ms` } as React.CSSProperties}
            >
              <div className="flex items-start justify-between mb-6">
                <div className="text-signal-deep">{step.glyph}</div>
                <div className="font-mono text-sm text-signal-deep tabular">{step.n}</div>
              </div>
              <h3 className="font-display italic text-2xl md:text-3xl text-ink leading-tight mb-4">
                {step.title}
              </h3>
              <p className="text-base text-ink-secondary leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 flex items-center gap-4">
          <div className="h-px flex-1 bg-rule" />
          <span className="label-caps">↓ live on chain</span>
        </div>
      </div>
    </section>
  );
}
