/**
 * useMounted — flips to true ONLY after hydration.
 *
 * Root-cause fix for the wallet desync bug:
 *   1. Server renders with isConnected=false (no wagmi context on server)
 *   2. Browser hydrates with same false state
 *   3. Wagmi silently reconnects from localStorage
 *   4. UI still says "Connect Wallet" because some components rendered
 *      before reconnect completed and didn't re-trigger
 *
 * Solution: render a stable placeholder until useEffect runs (which only
 * runs on the client, post-hydration). Then flip to true and let
 * useAccount/useChainId/etc. take over with their real values.
 *
 * Usage in components that depend on wallet state:
 *
 *   const mounted = useMounted();
 *   const { address, isConnected } = useAccount();
 *   if (!mounted) return <Placeholder />;
 *   // safe to use address / isConnected from here
 */

import { useEffect, useState } from 'react';

export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
