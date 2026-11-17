import path from "node:path";

// Node >= 20.12 can load .env natively; a missing file is fine.
try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

function list(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** "0xabc...=2500000,0xdef...=150000" -> lowercase address to whole-token balance. */
function balances(value: string | undefined): Map<string, number> {
  const map = new Map<string, number>();
  for (const pair of list(value, [])) {
    const [address, amount] = pair.split("=").map((s) => s.trim());
    if (/^0x[0-9a-fA-F]{40}$/.test(address ?? "") && Number.isFinite(Number(amount))) map.set(address.toLowerCase(), Number(amount));
  }
  return map;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  // HOST=127.0.0.1 keeps the API on loopback behind a reverse proxy; unset listens on every interface.
  host: process.env.HOST?.trim() || null,
  corsOrigins: list(process.env.CORS_ORIGINS, ["http://localhost:3000"]),
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
  vaultMasterSecret:
    process.env.VAULT_MASTER_SECRET ?? "dev-only-vault-secret-change-me-please",
  chain: {
    id: 4663,
    name: "Robinhood Chain",
    rpcUrl: process.env.CHAIN_RPC_URL ?? "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: process.env.CHAIN_EXPLORER_URL ?? "https://robinhoodchain.blockscout.com",
  },
  token: {
    name: "Eclipseal",
    symbol: "ECLS",
    address: process.env.TOKEN_ADDRESS?.trim() || null,
    launchpadUrl: process.env.PONS_LAUNCHPAD_URL ?? "https://ponsfamily.com/launchpad",
  },
  upstreamLlm: {
    baseUrl: process.env.UPSTREAM_LLM_BASE_URL?.trim() || null,
    apiKey: process.env.UPSTREAM_LLM_API_KEY?.trim() || null,
  },
  holders: {
    // Devnet only: simulated balances to preview tiers. Ignored once TOKEN_ADDRESS is set.
    devBalances: balances(process.env.DEV_HOLDER_BALANCES),
    sessionDays: 7,
    maxApiKeys: 5,
  },
  appDomain: "eclipseal.xyz",
} as const;

export const isSimulatedLlm = !config.upstreamLlm.baseUrl || !config.upstreamLlm.apiKey;
