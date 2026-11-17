import { getAddress } from "viem";
import { config } from "./config.js";
import { earlyAccessTier, holderTiers, type HolderTier } from "./catalog.js";

/**
 * $ECLS holder status. The balance is read straight from the token contract on
 * Robinhood Chain (balanceOf via eth_call), so holding the token in the signed-in
 * wallet is all it takes to unlock a tier. Nothing is staked or transferred.
 */

export type BalanceSource = "chain" | "dev-override" | "pre-launch" | "unavailable";

export type HolderBalance = {
  /** Whole tokens, floored to 4 decimals. */
  amount: number | null;
  source: BalanceSource;
  checkedAt: string;
  error?: string;
};

const TTL_MS = 60_000;
const MIN_REFRESH_MS = 10_000;
const cache = new Map<string, { value: HolderBalance; at: number; raw: bigint }>();
let decimals: number | null = null;

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(config.chain.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const reply = (await res.json()) as { result?: string; error?: { message: string } };
  if (reply.error || typeof reply.result !== "string") throw new Error(reply.error?.message ?? "Empty RPC reply");
  return reply.result;
}

async function tokenDecimals(token: string) {
  if (decimals !== null) return decimals;
  const hex = await ethCall(token, "0x313ce567");
  const value = Number(BigInt(hex === "0x" ? "0x0" : hex));
  if (!Number.isInteger(value) || value > 36) throw new Error("decimals() returned an unexpected value");
  decimals = value;
  return value;
}

function whole(raw: bigint, digits: number) {
  // Floor to 4 decimals so a balance never rounds up across a tier threshold.
  const scaled = digits >= 4 ? raw / 10n ** BigInt(digits - 4) : raw * 10n ** BigInt(4 - digits);
  return Number(scaled) / 1e4;
}

export async function balanceOf(address: string, refresh = false): Promise<HolderBalance> {
  const key = address.toLowerCase();
  const token = config.token.address;
  const checkedAt = new Date().toISOString();

  if (!token) {
    const simulated = config.holders.devBalances.get(key);
    return simulated !== undefined
      ? { amount: simulated, source: "dev-override", checkedAt }
      : { amount: null, source: "pre-launch", checkedAt };
  }

  const hit = cache.get(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && (age < (refresh ? MIN_REFRESH_MS : TTL_MS))) return hit.value;

  try {
    const [digits, hex] = await Promise.all([
      tokenDecimals(token),
      ethCall(token, `0x70a08231${key.slice(2).padStart(64, "0")}`),
    ]);
    const raw = BigInt(hex === "0x" ? "0x0" : hex);
    const value: HolderBalance = { amount: whole(raw, digits), source: "chain", checkedAt };
    cache.set(key, { value, at: Date.now(), raw });
    return value;
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    const error = cause ?? (err as Error).message;
    // Keep the last known balance while the RPC is down instead of dropping the holder's tier.
    if (hit) return { ...hit.value, error };
    return { amount: null, source: "unavailable", checkedAt, error };
  }
}

export function tierFor(balance: HolderBalance): HolderTier {
  if (balance.source === "pre-launch") return earlyAccessTier;
  const amount = balance.amount ?? 0;
  let tier = holderTiers[0];
  for (const t of holderTiers) if (amount >= t.minBalance) tier = t;
  return tier;
}

export async function holderProfile(address: string, refresh = false) {
  const balance = await balanceOf(address, refresh);
  const tier = tierFor(balance);
  const live = Boolean(config.token.address);
  const next = live || balance.source === "dev-override" ? holderTiers.find((t) => t.minBalance > (balance.amount ?? 0)) : undefined;
  return {
    address: getAddress(address),
    token: {
      symbol: config.token.symbol,
      address: config.token.address,
      status: live ? ("live" as const) : ("pre-launch" as const),
      launchpadUrl: config.token.launchpadUrl,
      explorerUrl: live ? `${config.chain.explorerUrl}/token/${config.token.address}` : config.chain.explorerUrl,
    },
    balance,
    tier,
    nextTier: next ? { id: next.id, label: next.label, minBalance: next.minBalance, remaining: Math.max(0, next.minBalance - (balance.amount ?? 0)) } : null,
    tiers: holderTiers,
  };
}

export type HolderProfile = Awaited<ReturnType<typeof holderProfile>>;
