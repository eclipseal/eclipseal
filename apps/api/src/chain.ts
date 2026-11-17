import { config } from "./config.js";

export type ChainStatus = {
  chainId: number;
  name: string;
  rpcHost: string;
  explorerUrl: string;
  live: boolean;
  blockNumber: number | null;
  gasPriceGwei: number | null;
  checkedAt: string;
  error?: string;
};

let cache: ChainStatus | null = null;
let inflight: Promise<ChainStatus> | null = null;
let lastKnownBlock: number | null = null;

const rpcHost = (() => {
  try {
    return new URL(config.chain.rpcUrl).host;
  } catch {
    return config.chain.rpcUrl;
  }
})();

type RpcReply = { id: number; result?: string; error?: { message: string } };

async function probe(): Promise<ChainStatus> {
  const base = {
    chainId: config.chain.id,
    name: config.chain.name,
    rpcHost,
    explorerUrl: config.chain.explorerUrl,
    checkedAt: new Date().toISOString(),
  };
  try {
    const res = await fetch(config.chain.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
        { jsonrpc: "2.0", id: 2, method: "eth_blockNumber", params: [] },
        { jsonrpc: "2.0", id: 3, method: "eth_gasPrice", params: [] },
      ]),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const replies = (await res.json()) as RpcReply[];
    const byId = new Map(replies.map((r) => [r.id, r.result]));
    const chainId = Number.parseInt(byId.get(1) ?? "0x0", 16);
    if (chainId !== config.chain.id) throw new Error(`Unexpected chain id ${chainId}`);
    const blockNumber = Number.parseInt(byId.get(2) ?? "0x0", 16);
    const gasWei = Number.parseInt(byId.get(3) ?? "0x0", 16);
    lastKnownBlock = blockNumber;
    return { ...base, live: true, blockNumber, gasPriceGwei: Math.round((gasWei / 1e9) * 1e4) / 1e4 };
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause?.code;
    return {
      ...base,
      live: false,
      blockNumber: lastKnownBlock,
      gasPriceGwei: null,
      error: cause ?? (err as Error).message,
    };
  }
}

/** Cached for 5s while live, 30s while the RPC is unreachable. */
export async function chainStatus(): Promise<ChainStatus> {
  const ttl = cache?.live ? 5_000 : 30_000;
  if (cache && Date.now() - Date.parse(cache.checkedAt) < ttl) return cache;
  inflight ??= probe().finally(() => {
    inflight = null;
  });
  cache = await inflight;
  return cache;
}

export const latestBlock = () => cache?.blockNumber ?? lastKnownBlock;
