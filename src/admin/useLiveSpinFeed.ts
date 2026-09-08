import { useEffect, useRef, useState } from "react";
import { adminApi, SpinEntry } from "./adminApi";

export interface LiveSpinEvent {
  userId: string;
  username: string;
  gameId: string;
  bet: number;
  winAmount: number;
  tier: string | null;
  forced: boolean;
  balanceAfter: number;
  createdAt: string;
}

export interface LiveSpinFilter {
  username?: string;
  gameId?: string;
}

const MAX_ENTRIES = 300;
const SEARCH_DEBOUNCE_MS = 300;

function toLiveEvent(s: SpinEntry): LiveSpinEvent {
  return {
    userId: typeof s.userId === "string" ? s.userId : s.userId._id,
    username: typeof s.userId === "string" ? "" : s.userId.username,
    gameId: s.gameId,
    bet: s.betAmount,
    winAmount: s.winAmount,
    tier: s.tier,
    forced: s.forced,
    balanceAfter: s.balanceAfter,
    createdAt: s.createdAt,
  };
}

function matchesFilter(s: LiveSpinEvent, filter: LiveSpinFilter): boolean {
  if (filter.gameId && filter.gameId !== "all" && s.gameId !== filter.gameId) return false;
  if (filter.username && !s.username.toLowerCase().includes(filter.username.toLowerCase())) return false;
  return true;
}

/**
 * Loads spins matching `filter` from the server (so search/game filters see the full history,
 * not just whatever happens to still be in the live rolling window), then keeps the list live
 * via SSE — new spins are appended only if they match the current filter.
 */
export function useLiveSpinFeed(filter: LiveSpinFilter = {}) {
  const [spins, setSpins] = useState<LiveSpinEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const sourceRef = useRef<EventSource | null>(null);
  const filterRef = useRef(filter);
  filterRef.current = filter;

  // Server-side search/filter — debounced so fast typing doesn't spam requests.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      adminApi
        .recentSpins({
          username: filter.username || undefined,
          gameId: filter.gameId && filter.gameId !== "all" ? filter.gameId : undefined,
          limit: MAX_ENTRIES,
        })
        .then((initial) => {
          if (cancelled) return;
          setSpins(initial.map(toLiveEvent));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, filter.username ? SEARCH_DEBOUNCE_MS : 0);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.username, filter.gameId]);

  // Single long-lived SSE connection for the page's lifetime, independent of the active filter.
  useEffect(() => {
    let cancelled = false;

    adminApi.getSseTicket().then((ticket) => {
      if (cancelled) return;
      const url = `${import.meta.env.VITE_API_URL}/api/admin/events?ticket=${encodeURIComponent(ticket)}`;
      const source = new EventSource(url);
      sourceRef.current = source;

      source.onopen = () => setConnected(true);
      source.onerror = () => setConnected(false);
      source.addEventListener("spin", (event) => {
        const payload = JSON.parse((event as MessageEvent).data) as LiveSpinEvent;
        if (!matchesFilter(payload, filterRef.current)) return;
        setSpins((prev) => [payload, ...prev].slice(0, MAX_ENTRIES));
      });
    });

    return () => {
      cancelled = true;
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  return { spins, connected, loading };
}
