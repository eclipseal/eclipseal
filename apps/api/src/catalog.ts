/**
 * Product catalog. Prices are launch placeholders for the client to edit,
 * not market quotes.
 */

export type TeeProfile = {
  id: string;
  label: string;
  cpu: "Intel TDX" | "AMD SEV-SNP";
  gpu: string | null;
  vcpu: number;
  memoryGb: number;
  pricePerHour: number;
};

export const teeProfiles: TeeProfile[] = [
  { id: "tdx.small", label: "TDX Small", cpu: "Intel TDX", gpu: null, vcpu: 2, memoryGb: 4, pricePerHour: 0.069 },
  { id: "tdx.medium", label: "TDX Medium", cpu: "Intel TDX", gpu: null, vcpu: 4, memoryGb: 8, pricePerHour: 0.138 },
  { id: "tdx.large", label: "TDX Large", cpu: "Intel TDX", gpu: null, vcpu: 8, memoryGb: 16, pricePerHour: 0.276 },
  { id: "snp.medium", label: "SEV-SNP Medium", cpu: "AMD SEV-SNP", gpu: null, vcpu: 4, memoryGb: 8, pricePerHour: 0.129 },
  { id: "tdx.h100", label: "TDX + H100", cpu: "Intel TDX", gpu: "NVIDIA H100 CC", vcpu: 24, memoryGb: 192, pricePerHour: 3.29 },
  { id: "tdx.h200", label: "TDX + H200", cpu: "Intel TDX", gpu: "NVIDIA H200 CC", vcpu: 24, memoryGb: 256, pricePerHour: 4.19 },
];

export type GpuOffer = {
  id: string;
  gpu: "H100" | "H200" | "B300";
  vramGb: number;
  vcpu: number;
  region: string;
  tee: string;
  pricePerGpuHour: number;
  available: number;
};

export const gpuOffers: GpuOffer[] = [
  { id: "h100-us-east", gpu: "H100", vramGb: 80, vcpu: 16, region: "US East", tee: "Intel TDX + NVIDIA CC", pricePerGpuHour: 2.89, available: 24 },
  { id: "h200-us-west", gpu: "H200", vramGb: 141, vcpu: 24, region: "US West", tee: "Intel TDX + NVIDIA CC", pricePerGpuHour: 4.19, available: 16 },
  { id: "h200-eu-central", gpu: "H200", vramGb: 141, vcpu: 24, region: "EU Central", tee: "Intel TDX + NVIDIA CC", pricePerGpuHour: 4.39, available: 8 },
  { id: "b300-us-east", gpu: "B300", vramGb: 288, vcpu: 16, region: "US East", tee: "Intel TDX + NVIDIA CC", pricePerGpuHour: 7.95, available: 8 },
  { id: "h100-apac-sg", gpu: "H100", vramGb: 80, vcpu: 16, region: "APAC Singapore", tee: "Intel TDX + NVIDIA CC", pricePerGpuHour: 3.09, available: 12 },
];

export type ModelEntry = {
  id: string;
  name: string;
  provider: string;
  contextTokens: number;
  inputPerM: number;
  outputPerM: number;
  gpu: string;
  encrypted: boolean;
};

export const models: ModelEntry[] = [
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", provider: "DeepSeek", contextTokens: 1_000_000, inputPerM: 0.72, outputPerM: 2.6, gpu: "H200 CC", encrypted: true },
  { id: "z-ai/glm-5.3", name: "GLM 5.3", provider: "Z.ai", contextTokens: 1_000_000, inputPerM: 1.35, outputPerM: 4.8, gpu: "B300 CC", encrypted: true },
  { id: "moonshotai/kimi-k3", name: "Kimi K3", provider: "MoonshotAI", contextTokens: 1_000_000, inputPerM: 2.9, outputPerM: 11, gpu: "B300 CC", encrypted: true },
  { id: "qwen/qwen3.8-27b", name: "Qwen3.8 27B", provider: "Qwen", contextTokens: 262_000, inputPerM: 0.19, outputPerM: 0.76, gpu: "H100 CC", encrypted: true },
  { id: "google/gemma-4-31b", name: "Gemma 4 31B", provider: "Google", contextTokens: 262_000, inputPerM: 0.14, outputPerM: 0.52, gpu: "H100 CC", encrypted: true },
  { id: "openai/gpt-oss-120b", name: "gpt-oss 120B", provider: "OpenAI", contextTokens: 131_000, inputPerM: 0.11, outputPerM: 0.48, gpu: "H200 CC", encrypted: true },
];

/**
 * Holder tiers, chosen by the $ECLS balance of the signed-in wallet on Robinhood Chain.
 * Thresholds and perks are launch placeholders for the client to edit (supply is 1B).
 */
export type HolderTier = {
  id: "visitor" | "early" | "holder" | "builder" | "operator";
  label: string;
  minBalance: number;
  discountPct: number;
  llmRequestsPerDay: number;
  maxWorkloads: number;
  maxGpusPerJob: number;
};

export const holderTiers: HolderTier[] = [
  { id: "visitor", label: "Visitor", minBalance: 0, discountPct: 0, llmRequestsPerDay: 50, maxWorkloads: 1, maxGpusPerJob: 1 },
  { id: "holder", label: "Holder", minBalance: 100_000, discountPct: 10, llmRequestsPerDay: 1_000, maxWorkloads: 3, maxGpusPerJob: 2 },
  { id: "builder", label: "Builder", minBalance: 1_000_000, discountPct: 20, llmRequestsPerDay: 10_000, maxWorkloads: 10, maxGpusPerJob: 8 },
  { id: "operator", label: "Operator", minBalance: 5_000_000, discountPct: 30, llmRequestsPerDay: 50_000, maxWorkloads: 25, maxGpusPerJob: 8 },
];

/** Until TOKEN_ADDRESS is set there is nothing to hold, so every signed-in wallet gets Holder perks. */
export const earlyAccessTier: HolderTier = { ...holderTiers[1], id: "early", label: "Early access", minBalance: 0 };

/** Known-good OS images. MRTD values derived from these are the verifier's allowlist. */
export const trustedOsImages = ["eclipseal-os-0.5.4", "eclipseal-os-0.5.3"] as const;
export const currentOsImage = trustedOsImages[0];
