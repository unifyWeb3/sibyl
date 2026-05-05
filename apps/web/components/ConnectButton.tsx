'use client';

/**
 * ConnectButton — wallet connect/disconnect for the page header.
 *
 * Uses ConnectKit's hook so the modal styling is consistent with what
 * SubscribeButton triggers. When connected, shows truncated address with
 * disconnect dropdown via clicking.
 */

import { ConnectKitButton } from 'connectkit';

export function ConnectButton() {
  return (
    <ConnectKitButton.Custom>
      {({ isConnected, isConnecting, show, truncatedAddress, ensName }) => (
        <button
          type="button"
          onClick={show}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium border border-rule rounded-sm bg-paper-elevated text-ink hover:border-ink hover:text-signal-deep transition-colors"
        >
          {isConnected ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-signal animate-pulse-dot" />
              <span className="font-mono">{ensName ?? truncatedAddress}</span>
            </>
          ) : isConnecting ? (
            'Connecting…'
          ) : (
            'Connect wallet'
          )}
        </button>
      )}
    </ConnectKitButton.Custom>
  );
}
