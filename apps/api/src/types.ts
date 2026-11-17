export type Measurements = {
  mrtd: string;
  rtmr0: string;
  rtmr1: string;
  rtmr2: string;
  rtmr3: string;
};

export type AttestationSubject = {
  type: "cvm" | "model" | "gpu-job";
  id: string;
  name: string;
};

export type AttestationReport = {
  version: 1;
  id: string;
  mode: "simulated";
  subject: AttestationSubject;
  appId: string;
  tee: { cpu: string; gpu: string | null; tcbStatus: "UpToDate" | "OutOfDate" };
  osImage: string;
  measurements: Measurements;
  composeHash: string;
  imageDigest: string;
  nonce: string;
  reportData: string;
  quote: string;
  issuedAt: string;
  anchor: {
    chainId: number;
    network: string;
    txHash: string;
    blockNumber: number | null;
    status: "simulated";
  };
  signer: { alg: "Ed25519"; publicKey: string };
  signature: string;
};

export type CheckStatus = "pass" | "fail" | "warn" | "skip";
export type VerifyCheck = { id: string; label: string; status: CheckStatus; detail: string };
export type VerifyResult = {
  valid: boolean;
  verdict: "VERIFIED" | "FAILED";
  digest: string;
  checks: VerifyCheck[];
};

export type LogLine = { t: string; line: string };

export type CvmStatus = "provisioning" | "running" | "stopped" | "failed";

export type Cvm = {
  id: string;
  appId: string;
  name: string;
  kind: "agent" | "model" | "service";
  status: CvmStatus;
  stage: number;
  profileId: string;
  cpu: string;
  gpu: string | null;
  vcpu: number;
  memoryGb: number;
  region: string;
  url: string;
  compose: string;
  composeHash: string;
  imageDigest: string;
  osImage: string;
  envKeys: string[];
  pricePerHour: number;
  createdAt: string;
  updatedAt: string;
  lastAttestationId: string | null;
  telemetry: { cpu: number; mem: number; netKbps: number; trail?: number[] };
  logs: LogLine[];
  /** Wallet that deployed it; null for the read-only devnet demo workloads. */
  owner?: string | null;
  discountPct?: number;
};

export type GpuJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export type GpuJob = {
  id: string;
  name: string;
  offerId: string;
  gpu: string;
  count: number;
  image: string;
  hours: number;
  status: GpuJobStatus;
  progress: number;
  costEstimate: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attestationId: string | null;
  logs: LogLine[];
  owner?: string | null;
  discountPct?: number;
  listCost?: number;
};

export type SealedSecret = {
  id: string;
  name: string;
  appId: string | null;
  fingerprint: string;
  bytes: number;
  sealedAt: string;
  ciphertext: string;
  iv: string;
  tag: string;
  owner?: string | null;
};

export type ChatRecord = {
  id: string;
  model: string;
  requestHash: string;
  responseHash: string;
  signedText: string;
  signature: string;
  attestationId: string;
  simulated: boolean;
  createdAt: string;
};

export type DayStat = {
  date: string;
  attestations: number;
  deployments: number;
  gpuHours: number;
  tokensM: number;
};

export type Session = {
  id: string;
  tokenHash: string;
  address: string;
  createdAt: string;
  expiresAt: string;
};

export type ApiKey = {
  id: string;
  address: string;
  name: string;
  prefix: string;
  hash: string;
  createdAt: string;
  lastUsedAt: string | null;
};

export type Db = {
  cvms: Cvm[];
  gpuJobs: GpuJob[];
  attestations: AttestationReport[];
  secrets: SealedSecret[];
  chats: ChatRecord[];
  waitlist: { id: string; contact: string; createdAt: string }[];
  history: DayStat[];
  counters: { attestationsAllTime: number };
  sessions: Session[];
  apiKeys: ApiKey[];
  /** Per wallet, per UTC day. */
  usage: { address: string; date: string; llmRequests: number }[];
  /** Report id -> owner wallet, kept outside the signed report so private subjects stay out of public lists. */
  attestationOwners: Record<string, string>;
};
