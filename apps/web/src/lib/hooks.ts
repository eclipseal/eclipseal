"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api, API_URL, session, type HubEvent } from "./api";

export const useSessionToken = () => useSyncExternalStore(session.subscribe, session.token, () => null);

type ApiState<T> = { data: T | undefined; error: Error | undefined; loading: boolean; reload: () => void };

/**
 * Minimal polling fetch hook (no SWR dependency); keeps the last good value on errors
 * and refetches when the wallet session changes, since lists depend on who is asking.
 */
export function useApi<T>(path: string | null, refreshMs?: number): ApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(Boolean(path));
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const token = useSessionToken();

  useEffect(() => {
    if (!path) return;
    let alive = true;
    const run = () =>
      api<T>(path)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError(undefined);
        })
        .catch((e: Error) => alive && setError(e))
        .finally(() => alive && setLoading(false));
    void run();
    const timer = refreshMs ? setInterval(run, refreshMs) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [path, refreshMs, nonce, token]);

  return { data, error, loading, reload };
}

const NO_EVENTS: HubEvent[] = [];

/** Subscribes to the control-plane SSE stream. */
export function useEvents(onEvent?: (e: HubEvent) => void, max = 40) {
  // Events are kept per session, so signing out drops the private ones at once.
  const [feed, setFeed] = useState<{ token: string | null; list: HubEvent[] }>({ token: null, list: NO_EVENTS });
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  const token = useSessionToken();
  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    // EventSource cannot send headers; the session rides along so private events reach their owner.
    const source = new EventSource(`${API_URL}/api/events${token ? `?session=${encodeURIComponent(token)}` : ""}`);
    const types = ["deploy.progress", "cvm.status", "attestation.created", "gpu.progress", "chat.signed", "secret.sealed", "chain.status"];
    const listener = (msg: MessageEvent) => {
      try {
        const event = JSON.parse(msg.data) as HubEvent;
        setFeed((prev) => {
          const list = prev.token === token ? prev.list : NO_EVENTS;
          if (list.some((p) => p.id === event.id)) return prev.token === token ? prev : { token, list };
          return { token, list: [...list.slice(-(max - 1)), event] };
        });
        handler.current?.(event);
      } catch {
        /* ignore malformed frames */
      }
    };
    types.forEach((t) => source.addEventListener(t, listener));
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    return () => source.close();
  }, [max, token]);

  return { events: feed.token === token ? feed.list : NO_EVENTS, connected };
}

function subscribeMedia(query: string) {
  return (cb: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", cb);
    return () => mql.removeEventListener("change", cb);
  };
}

export function useMediaQuery(query: string, serverValue = false) {
  return useSyncExternalStore(
    subscribeMedia(query),
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
export const usePrefersReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

/** True while the element is within `margin` of the viewport; used to pause WebGL loops. */
export function useInView<T extends Element>(margin = "200px", initial = false) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin]);
  return [ref, inView] as const;
}

/** The last non-null value, so a closing dialog keeps showing what it was opened for. */
export function useSticky<T>(value: T | null): T | null {
  const [last, setLast] = useState<T | null>(value);
  if (value !== null && value !== last) setLast(value);
  return value ?? last;
}
