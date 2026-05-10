'use client';

/**
 * ExportCardButton — downloads an analyst's reputation card as an SVG.
 *
 * Day 13 fix: previous version opened /api/reputation-card?aa=... in a new
 * tab which:
 *   (a) doesn't trigger save dialog
 *   (b) loses the "this is the SUBSCRIBED analyst's card" connection
 *
 * New behavior:
 *   - Fetch the SVG blob from /api/reputation-card?aa=<analyst>
 *   - Create object URL, attach to anchor with `download` attribute
 *   - Programmatically click → browser saves "sibyl-{name}.svg" directly
 *   - No new tab. No copying URLs. Clean save.
 *
 * On X/Twitter, the user uploads the saved SVG (or screenshots it). For
 * direct embed into a tweet, they can also right-click the saved file and
 * "Open in browser" to view, then drag into compose.
 */

import { useState } from 'react';

interface ExportCardButtonProps {
  analyst: string; // 0x address
  analystName: string;
  variant?: 'inline' | 'block';
}

export function ExportCardButton({ analyst, analystName, variant = 'inline' }: ExportCardButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/reputation-card?aa=${analyst}`);
      if (!res.ok) {
        throw new Error(`server returned ${res.status}`);
      }
      const svg = await res.text();
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      // Build sanitized filename: sibyl-the-oracle-2026-05-10.svg
      const safeName = analystName.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const date = new Date().toISOString().slice(0, 10);
      const filename = `sibyl-${safeName}-${date}.svg`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Free memory after a short delay so the download has time to start
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      setError(err.message ?? 'export failed');
    } finally {
      setIsLoading(false);
    }
  }

  const buttonClasses =
    variant === 'block'
      ? 'group inline-flex items-center justify-center gap-2 bg-ink text-paper px-6 py-3 rounded-sm font-medium hover:bg-ink-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
      : 'inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-rule rounded-sm bg-paper-elevated text-ink hover:border-ink hover:text-signal-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <>
      <button
        type="button"
        onClick={handleExport}
        disabled={isLoading}
        className={buttonClasses}
      >
        {isLoading ? 'Exporting…' : (
          <>
            Export card
            <span className="text-signal-deep">↓</span>
          </>
        )}
      </button>
      {error && (
        <span className="ml-3 text-xs text-warn-deep">{error}</span>
      )}
    </>
  );
}
