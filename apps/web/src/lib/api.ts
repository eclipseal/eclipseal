export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public issues?: { path: string; message: string }[],
    public code?: string,
  ) {
    super(message);
  }
}

/* --------------------------------- session -------------------------------- */

export type StoredSession = { token: string; address: string; expiresAt: string };

const STORAGE_KEY = "ecls.session";
let current: StoredSession | null = null;
const listeners = new Set<() => void>();

/**
 * Wallet session shared by every request and polling hook. Only the console loads
 * it, so public pages never send a token that might have expired.
 */
export const session = {
  get: () => current,
  token: () => current?.token ?? null,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  },
  set(next: StoredSession | null) {
    if (next?.token === current?.token) return;
    current = next;
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* private mode: the session just lasts for this tab */
    }
    listeners.forEach((l) => l());
  },
  load() {
    if (typeof window === "undefined" || current) return;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as StoredSession | null;
      if (stored?.token && Date.parse(stored.expiresAt) > Date.now()) current = stored;
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* unreadable storage means signed out */
    }
  },
};

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const token = session.token();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        ...(json !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...rest.headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("Control plane unreachable. Start the API with npm run dev.", 0);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && data?.code === "session_expired" && token) {
      // Drop the dead session; reads simply continue as a visitor.
      if (session.token() === token) session.set(null);
      if (!rest.method || rest.method === "GET") return api<T>(path, init);
    }
    const issues = data?.issues as { path: string; message: string }[] | undefined;
    const message = issues?.length ? issues.map((i) => `${i.path}: ${i.message}`).join(", ") : (data?.error?.message ?? data?.error ?? `Request failed (${res.status})`);
    throw new ApiError(String(message), res.status, issues, data?.code);
  }
  return data as T;
}

/* ---------------------------------- types --------------------------------- */

export type Measurements = { mrtd: string; rtmr0: string; rtmr1: string; rtmr2: string; rtmr3: string };

export type AttestationReport = {
  version: 1;
  id: string;
  mode: "simulated";
  subject: { type: "cvm" | "model" | "gpu-job"; id: string; name: string };
  appId: string;
  tee: { cpu: string; gpu: string | null; tcbStatus: string };
  osImage: string;
  measurements: Measurements;
  composeHash: string;
  imageDigest: string;
  nonce: string;
  reportData: string;
  quote?: string;
  issuedAt: string;
  anchor: { chainId: number; network: string; txHash: string; blockNumber: number | null; status: string };
  signer: { alg: string; publicKey: string };
  signature: string;
};

export type VerifyResult = {
  valid: boolean;
  verdict: "VERIFIED" | "FAILED";
  digest: string;
  checks: { id: string; label: string; status: "pass" | "fail" | "warn" | "skip"; detail: string }[];
};

export type LogLine = { t: string; line: string };

export type Cvm = {
  id: string;
  appId: string;
  name: string;
  kind: "agent" | "model" | "service";
  status: "provisioning" | "running" | "stopped" | "failed";
  stage: number;
  profileId: string;
  cpu: string;
  gpu: string | null;
  vcpu: number;
  memoryGb: number;
  region: string;
  url: string;
  compose?: string;
  composeHash: string;
  imageDigest: string;
  osImage: string;
  envKeys: string[];
  pricePerHour: number;
  createdAt: string;
  updatedAt: string;
  lastAttestationId: string | null;
  telemetry: { cpu: number; mem: number; netKbps: number; trail?: number[] };
  logs?: LogLine[];
  lastLog?: LogLine | null;
  /** Wallet that owns it; null for the read-only demo workloads. */
  owner: string | null;
  discountPct?: number;
  allowedActions: ("start" | "stop" | "restart" | "attest")[];
};

export type GpuOffer = { id: string; gpu: string; vramGb: number; vcpu: number; region: string; tee: string; pricePerGpuHour: number; available: number; capacity: number };

export type GpuJob = {
  id: string;
  name: string;
  offerId: string;
  gpu: string;
  count: number;
  image: string;
  hours: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress: number;
  costEstimate: number;
  listCost?: number;
  discountPct?: number;
  createdAt: string;
  attestationId: string | null;
  lastLog?: LogLine | null;
  logs?: LogLine[];
  owner: string | null;
};

export type ModelEntry = { id: string; name: string; provider: string; contextTokens: number; inputPerM: number; outputPerM: number; gpu: string; encrypted: boolean };

export type TeeProfile = { id: string; label: string; cpu: string; gpu: string | null; vcpu: number; memoryGb: number; pricePerHour: number };

export type SecretMeta = { id: string; name: string; appId: string | null; fingerprint: string; bytes: number; sealedAt: string; cipher: string; keyRelease: string; owner: string | null; rotated?: boolean };

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

export type DayStat = { date: string; attestations: number; deployments: number; gpuHours: number; tokensM: number };

export type NetworkStats = {
  mode: string;
  totals: {
    workloads: number;
    running: number;
    gpuJobsActive: number;
    attestationsAllTime: number;
    attestationsToday: number;
    gpuHours30d: number;
    tokensM30d: number;
    models: number;
    sealedSecrets: number;
  };
  composition: { cpuTee: number; gpuTee: number; models: number };
  chain: ChainStatus;
  history: DayStat[];
};

export type TokenInfo = {
  name: string;
  symbol: string;
  chainId: number;
  network: string;
  address: string | null;
  status: "live" | "pre-launch";
  launchpadUrl: string;
  explorerUrl: string;
  pair: string;
  supply: number;
  utility: { key: string; title: string; body: string }[];
  tiers?: HolderTier[];
  earlyAccess?: HolderTier;
};

export type ChatReceipt = {
  chat_id: string;
  request_hash: string;
  response_hash: string;
  signed_text: string;
  signature: string;
  signing_algo: string;
  public_key: string;
  attestation_id: string;
  simulated: boolean;
};

export type HubEvent = { id: number; type: string; at: string; data: Record<string, unknown>; replay?: boolean; mine?: boolean };

export type HolderTier = {
  id: "visitor" | "early" | "holder" | "builder" | "operator";
  label: string;
  minBalance: number;
  discountPct: number;
  llmRequestsPerDay: number;
  maxWorkloads: number;
  maxGpusPerJob: number;
};

export type HolderMe = {
  address: string;
  token: { symbol: string; address: string | null; status: "live" | "pre-launch"; launchpadUrl: string; explorerUrl: string };
  balance: { amount: number | null; source: "chain" | "dev-override" | "pre-launch" | "unavailable"; checkedAt: string; error?: string };
  tier: HolderTier;
  nextTier: { id: string; label: string; minBalance: number; remaining: number } | null;
  tiers: HolderTier[];
  usage: { llmRequestsToday: number; workloads: number; gpuJobsActive: number; secrets: number; apiKeys: number };
};

export type ApiKeyMeta = { id: string; address: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null };
