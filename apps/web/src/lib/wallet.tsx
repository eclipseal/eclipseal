"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { WalletHelp } from "@/components/dashboard/wallet-help";
import { api, ApiError, session, type HolderMe } from "./api";
import { short } from "./format";
import { site } from "./site";

// The console restores a saved session before its first request.
session.load();

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void;
};

const CHAIN_HEX = `0x${site.chain.id.toString(16)}`;
const ethereum = () => (typeof window === "undefined" ? undefined : (window as unknown as { ethereum?: Eip1193 }).ethereum);
const hexUtf8 = (text: string) => `0x${Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("")}`;
const cancelled = (err: unknown) => (err as { code?: number }).code === 4001;
const noop = () => () => {};

type Holder = {
  /** False during SSR and hydration, so wallet-dependent UI renders the same on both sides. */
  mounted: boolean;
  hasWallet: boolean;
  account: string | null;
  chainOk: boolean;
  address: string | null;
  me: HolderMe | null;
  busy: "connect" | "sign" | null;
  signIn: () => Promise<boolean>;
  signOut: () => Promise<void>;
  refresh: (force?: boolean) => Promise<void>;
  switchChain: () => Promise<void>;
  openWalletHelp: () => void;
};

const HolderContext = createContext<Holder | null>(null);

async function addOrSwitchChain(eth: Eip1193) {
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err) {
    if ((err as { code?: number }).code !== 4902) throw err;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: site.chain.name,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [site.chain.rpc],
          blockExplorerUrls: [site.chain.explorer],
        },
      ],
    });
  }
}

/**
 * Wallet sign-in for holders: connect, sign a free message, and the API reads the
 * wallet's $ECLS balance on Robinhood Chain to pick its tier.
 */
export function HolderProvider({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const hasWallet = useSyncExternalStore(noop, () => Boolean(ethereum()), () => false);
  const stored = useSyncExternalStore(session.subscribe, session.get, () => null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainOk, setChainOk] = useState(false);
  const [meState, setMeState] = useState<{ token: string; me: HolderMe } | null>(null);
  const [busy, setBusy] = useState<Holder["busy"]>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const leaving = useRef(false);
  const lastToken = useRef<string | null>(stored?.token ?? null);

  const me = stored && meState?.token === stored.token ? meState.me : null;

  const refresh = useCallback(async (force = false) => {
    const token = session.token();
    if (!token) return;
    try {
      const next = await api<HolderMe>(`/api/me${force ? "?refresh=1" : ""}`);
      if (session.token() === token) setMeState({ token, me: next });
    } catch (err) {
      if (force) toast.error(err instanceof Error ? err.message : "Could not refresh your pass.");
    }
  }, []);

  // Load the pass for the current session and keep it fresh (balances change after a buy on Pons).
  useEffect(() => {
    const token = stored?.token;
    if (!token) return;
    let alive = true;
    const load = () =>
      api<HolderMe>("/api/me")
        .then((next) => {
          if (alive && session.token() === token) setMeState({ token, me: next });
        })
        .catch(() => undefined);
    void load();
    const timer = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [stored?.token]);

  // A session that disappears without a sign-out expired on the server.
  useEffect(() => {
    const previous = lastToken.current;
    lastToken.current = stored?.token ?? null;
    if (previous && !stored && !leaving.current) toast("Your session expired. Sign in again to use your workspace.");
    leaving.current = false;
  }, [stored]);

  useEffect(() => {
    const eth = ethereum();
    if (!eth) return;
    const onAccounts = (list: unknown) => {
      const next = (((list as string[]) ?? [])[0] ?? null)?.toLowerCase() ?? null;
      setAccount(next);
      const current = session.get();
      // The session belongs to the wallet that signed; switching accounts ends it.
      if (next && current && current.address !== next) {
        leaving.current = true;
        session.set(null);
        toast(`Wallet switched to ${short(next, 6, 4)}. Sign in again to use it.`);
      }
    };
    const onChain = (id: unknown) => setChainOk(String(id).toLowerCase() === CHAIN_HEX);
    void eth.request({ method: "eth_accounts" }).then(onAccounts).catch(() => undefined);
    void eth.request({ method: "eth_chainId" }).then(onChain).catch(() => undefined);
    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const switchChain = useCallback(async () => {
    const eth = ethereum();
    if (!eth) return setHelpOpen(true);
    try {
      await addOrSwitchChain(eth);
      setChainOk(true);
    } catch (err) {
      if (!cancelled(err)) toast.error((err as Error).message ?? "Could not switch network.");
    }
  }, []);

  const signIn = useCallback(async () => {
    const eth = ethereum();
    if (!eth) {
      setHelpOpen(true);
      return false;
    }
    try {
      setBusy("connect");
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("The wallet did not share an account.");
      setAccount(address.toLowerCase());
      setBusy("sign");
      const { message } = await api<{ message: string }>("/api/auth/nonce", { method: "POST", json: { address } });
      const signature = (await eth.request({ method: "personal_sign", params: [hexUtf8(message), address] })) as string;
      const result = await api<{ token: string; expiresAt: string; me: HolderMe }>("/api/auth/verify", {
        method: "POST",
        json: { message, signature },
      });
      session.set({ token: result.token, address: address.toLowerCase(), expiresAt: result.expiresAt });
      setMeState({ token: result.token, me: result.me });
      toast.success(`Signed in as ${result.me.tier.label}`);
      // Robinhood Chain is where $ECLS trades; offering the switch here is optional.
      const chainId = String(await eth.request({ method: "eth_chainId" }).catch(() => CHAIN_HEX)).toLowerCase();
      setChainOk(chainId === CHAIN_HEX);
      if (chainId !== CHAIN_HEX) await addOrSwitchChain(eth).then(() => setChainOk(true)).catch(() => undefined);
      return true;
    } catch (err) {
      if (cancelled(err)) toast("Request cancelled in your wallet.");
      else toast.error(err instanceof ApiError || err instanceof Error ? err.message : "Sign-in failed.");
      return false;
    } finally {
      setBusy(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    leaving.current = true;
    session.set(null);
    toast("Signed out");
  }, []);

  const value = useMemo<Holder>(
    () => ({
      mounted,
      hasWallet,
      account,
      chainOk,
      address: mounted ? (stored?.address ?? null) : null,
      me,
      busy,
      signIn,
      signOut,
      refresh,
      switchChain,
      openWalletHelp: () => setHelpOpen(true),
    }),
    [mounted, hasWallet, account, chainOk, stored?.address, me, busy, signIn, signOut, refresh, switchChain],
  );

  return (
    <HolderContext.Provider value={value}>
      {children}
      <WalletHelp open={helpOpen} onOpenChange={setHelpOpen} />
    </HolderContext.Provider>
  );
}

export function useHolder() {
  const value = useContext(HolderContext);
  if (!value) throw new Error("useHolder must be used inside HolderProvider");
  return value;
}
