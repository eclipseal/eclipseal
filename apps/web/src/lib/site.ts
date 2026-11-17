export const site = {
  name: "Eclipseal",
  ticker: "ECLS",
  tagline: "Proven in the dark.",
  description:
    "Run AI agents, private LLMs and GPU jobs inside hardware-sealed enclaves. Keep secrets private and prove what ran, anchored on Robinhood Chain.",
  domain: "eclipseal.xyz",
  appDomain: "eclipseal.xyz",
  x: "https://x.com/eclipseal_ai",
  handle: "@eclipseal_ai",
  pons: "https://ponsfamily.com/launchpad",
  ponsDocs: "https://docs.ponsfamily.com",
  chain: {
    id: 4663,
    name: "Robinhood Chain",
    rpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    bridge: "https://docs.robinhood.com/chain/bridging/",
  },
} as const;

/** Static copy of the API catalog so marketing sections render even when the API is offline. */
export const fallbackModels = [
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", provider: "DeepSeek", contextTokens: 1_000_000, inputPerM: 0.72, outputPerM: 2.6, gpu: "H200 CC", encrypted: true },
  { id: "z-ai/glm-5.3", name: "GLM 5.3", provider: "Z.ai", contextTokens: 1_000_000, inputPerM: 1.35, outputPerM: 4.8, gpu: "B300 CC", encrypted: true },
  { id: "moonshotai/kimi-k3", name: "Kimi K3", provider: "MoonshotAI", contextTokens: 1_000_000, inputPerM: 2.9, outputPerM: 11, gpu: "B300 CC", encrypted: true },
  { id: "qwen/qwen3.8-27b", name: "Qwen3.8 27B", provider: "Qwen", contextTokens: 262_000, inputPerM: 0.19, outputPerM: 0.76, gpu: "H100 CC", encrypted: true },
  { id: "google/gemma-4-31b", name: "Gemma 4 31B", provider: "Google", contextTokens: 262_000, inputPerM: 0.14, outputPerM: 0.52, gpu: "H100 CC", encrypted: true },
  { id: "openai/gpt-oss-120b", name: "gpt-oss 120B", provider: "OpenAI", contextTokens: 131_000, inputPerM: 0.11, outputPerM: 0.48, gpu: "H200 CC", encrypted: true },
];

export const fallbackGpus = [
  { id: "h100-us-east", gpu: "H100", vramGb: 80, region: "US East", pricePerGpuHour: 2.89 },
  { id: "h200-us-west", gpu: "H200", vramGb: 141, region: "US West", pricePerGpuHour: 4.19 },
  { id: "b300-us-east", gpu: "B300", vramGb: 288, region: "US East", pricePerGpuHour: 7.95 },
];
