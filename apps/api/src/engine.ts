import { config } from "./config.js";
import { db, isFreshStore, persist, trim } from "./store.js";
import { createReport } from "./attestor.js";
import { gpuOffers, teeProfiles, models, currentOsImage } from "./catalog.js";
import { emit } from "./events.js";
import { chainStatus, latestBlock } from "./chain.js";
import { id, seeded, sha256 } from "./lib/canonical.js";
import { seal } from "./vault.js";
import type { AttestationReport, Cvm, DayStat, GpuJob, LogLine } from "./types.js";

const now = () => new Date().toISOString();
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

export function today(): DayStat {
  const key = dayKey();
  let stat = db.history.find((h) => h.date === key);
  if (!stat) {
    stat = { date: key, attestations: 0, deployments: 0, gpuHours: 0, tokensM: 0 };
    db.history.push(stat);
    trim(db.history, 60);
  }
  return stat;
}

function log(target: { logs: LogLine[] }, line: string) {
  target.logs.push({ t: now(), line });
  trim(target.logs, 120);
}

/* ------------------------------------------------------------------ */
/* Attestations                                                        */
/* ------------------------------------------------------------------ */

function recordAttestation(report: AttestationReport, owner: string | null = null) {
  db.attestations.push(report);
  if (owner) db.attestationOwners[report.id] = owner;
  if (db.attestations.length > 400) {
    for (const old of db.attestations.splice(0, db.attestations.length - 400)) delete db.attestationOwners[old.id];
  }
  db.counters.attestationsAllTime += 1;
  today().attestations += 1;
  emit(
    "attestation.created",
    {
      id: report.id,
      subject: report.subject,
      tee: report.tee,
      composeHash: report.composeHash,
      txHash: report.anchor.txHash,
    },
    owner,
  );
  persist();
}

export function attestCvm(cvm: Cvm) {
  const report = createReport({
    subject: { type: "cvm", id: cvm.id, name: cvm.name },
    appId: cvm.appId,
    cpu: cvm.cpu,
    gpu: cvm.gpu,
    composeHash: cvm.composeHash,
    imageDigest: cvm.imageDigest,
    osImage: cvm.osImage,
    blockNumber: latestBlock(),
  });
  cvm.lastAttestationId = report.id;
  recordAttestation(report, cvm.owner ?? null);
  return report;
}

const modelAttestations = new Map<string, { report: AttestationReport; at: number }>();

/** Each model runs in its own GPU enclave; reports are refreshed every 10 minutes. */
export function attestModel(modelId: string) {
  const cached = modelAttestations.get(modelId);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.report;
  const model = models.find((m) => m.id === modelId) ?? models[0];
  const report = createReport({
    subject: { type: "model", id: model.id, name: model.name },
    appId: `model:${model.id}`,
    cpu: "Intel TDX",
    gpu: `NVIDIA ${model.gpu}`,
    composeHash: sha256(`model-runtime:vllm-0.11:${model.id}`),
    imageDigest: `sha256:${sha256(`image:${model.id}`)}`,
    blockNumber: latestBlock(),
  });
  modelAttestations.set(modelId, { report, at: Date.now() });
  recordAttestation(report);
  return report;
}

export const findAttestation = (reportId: string) => db.attestations.find((a) => a.id === reportId);

/* ------------------------------------------------------------------ */
/* Confidential VMs                                                    */
/* ------------------------------------------------------------------ */

const stages = (cvm: Cvm) => [
  "building compose plan",
  `selecting CPU TEE: ${cvm.cpu}`,
  cvm.gpu ? `selecting GPU TEE: ${cvm.gpu}` : "no GPU requested, skipping NVIDIA CC",
  `injecting encrypted env (${cvm.envKeys.length} sealed key${cvm.envKeys.length === 1 ? "" : "s"})`,
  "measuring boot chain: MRTD, RTMR0-3",
  "requesting attestation quote",
  `anchoring report digest on ${config.chain.name}`,
  `cvm ready: https://${cvm.url}`,
];

export const DEPLOY_STAGE_COUNT = 8;

export function createCvm(input: {
  name: string;
  compose: string;
  profileId: string;
  region?: string;
  kind?: Cvm["kind"];
  env?: Record<string, string>;
  status?: Cvm["status"];
  createdAt?: string;
  owner?: string | null;
  discountPct?: number;
}): Cvm {
  const profile = teeProfiles.find((p) => p.id === input.profileId) ?? teeProfiles[1];
  const appId = `app_${sha256(`${input.name}:${Date.now()}:${Math.random()}`).slice(0, 20)}`;
  const env = input.env ?? {};
  const cvm: Cvm = {
    id: id("cvm"),
    appId,
    name: input.name,
    kind: input.kind ?? "agent",
    status: input.status ?? "provisioning",
    stage: 0,
    profileId: profile.id,
    cpu: profile.cpu,
    gpu: profile.gpu,
    vcpu: profile.vcpu,
    memoryGb: profile.memoryGb,
    region: input.region ?? "US East",
    url: `${input.name}.${config.appDomain}`,
    compose: input.compose,
    composeHash: sha256(input.compose),
    imageDigest: `sha256:${sha256(`${input.name}:image`)}`,
    osImage: currentOsImage,
    envKeys: Object.keys(env),
    pricePerHour: profile.pricePerHour,
    createdAt: input.createdAt ?? now(),
    updatedAt: now(),
    lastAttestationId: null,
    telemetry: { cpu: 0, mem: 0, netKbps: 0 },
    logs: [],
    owner: input.owner ?? null,
    discountPct: input.discountPct ?? 0,
  };
  for (const [name, value] of Object.entries(env)) db.secrets.push({ ...seal(name, value, appId), owner: cvm.owner });
  db.cvms.push(cvm);
  if (cvm.status === "provisioning") {
    log(cvm, `$ ecls deploy -c docker-compose.yml -n ${cvm.name}`);
    today().deployments += 1;
  }
  persist();
  return cvm;
}

function advanceDeploy(cvm: Cvm) {
  const list = stages(cvm);
  const line = list[cvm.stage];
  log(cvm, line);
  emit("deploy.progress", { cvmId: cvm.id, name: cvm.name, stage: cvm.stage, total: list.length, line }, cvm.owner ?? null);
  cvm.stage += 1;
  if (cvm.stage >= list.length) {
    cvm.status = "running";
    cvm.telemetry = { cpu: 12, mem: 31, netKbps: 140 };
    attestCvm(cvm);
    emit("cvm.status", { cvmId: cvm.id, name: cvm.name, status: cvm.status }, cvm.owner ?? null);
  }
  cvm.updatedAt = now();
}

export type CvmAction = "start" | "stop" | "restart" | "attest";

/** Which lifecycle actions make sense from each state; anything else is a 409. */
export const allowedActions: Record<Cvm["status"], CvmAction[]> = {
  provisioning: ["stop"],
  running: ["attest", "stop", "restart"],
  stopped: ["start"],
  failed: ["start"],
};

export function cvmAction(cvm: Cvm, action: CvmAction) {
  if (!allowedActions[cvm.status].includes(action)) {
    const verb = { start: "started", stop: "stopped", restart: "restarted", attest: "attested" }[action];
    throw new Error(`${cvm.name} is ${cvm.status} and cannot be ${verb} right now.`);
  }
  if (action === "attest") {
    log(cvm, "$ ecls cvms attestation");
    const report = attestCvm(cvm);
    log(cvm, "attestation valid, image digest matches");
    return report;
  }
  if (action === "stop") {
    cvm.status = "stopped";
    cvm.telemetry = { cpu: 0, mem: 0, netKbps: 0 };
    log(cvm, "cvm stopped, sealed memory wiped");
  } else {
    cvm.status = "provisioning";
    cvm.stage = 0;
    log(cvm, action === "restart" ? "restarting with the same measured compose" : "booting from measured image");
  }
  cvm.updatedAt = now();
  emit("cvm.status", { cvmId: cvm.id, name: cvm.name, status: cvm.status }, cvm.owner ?? null);
  persist();
  return null;
}

/* ------------------------------------------------------------------ */
/* GPU jobs                                                            */
/* ------------------------------------------------------------------ */

/** GPUs held by queued or running jobs on an offer. */
export const gpusInUse = (offerId: string) =>
  db.gpuJobs.filter((j) => j.offerId === offerId && (j.status === "queued" || j.status === "running")).reduce((s, j) => s + j.count, 0);

export function createGpuJob(input: {
  name: string;
  offerId: string;
  count: number;
  image: string;
  hours: number;
  owner?: string | null;
  discountPct?: number;
}) {
  const offer = gpuOffers.find((o) => o.id === input.offerId);
  if (!offer) throw new Error("Unknown GPU offer.");
  const free = offer.available - gpusInUse(offer.id);
  if (input.count > free) throw new Error(`Only ${Math.max(0, free)} ${offer.gpu} GPU${free === 1 ? "" : "s"} free in ${offer.region} right now.`);
  const listCost = Math.round(offer.pricePerGpuHour * input.count * input.hours * 100) / 100;
  const discountPct = input.discountPct ?? 0;
  const job: GpuJob = {
    id: id("gpu"),
    name: input.name,
    offerId: offer.id,
    gpu: offer.gpu,
    count: input.count,
    image: input.image,
    hours: input.hours,
    status: "queued",
    progress: 0,
    costEstimate: Math.round(listCost * (100 - discountPct)) / 100,
    listCost,
    discountPct,
    owner: input.owner ?? null,
    createdAt: now(),
    startedAt: null,
    finishedAt: null,
    attestationId: null,
    logs: [],
  };
  log(job, `queued ${input.count}x ${offer.gpu} in ${offer.region}`);
  db.gpuJobs.push(job);
  trim(db.gpuJobs, 80);
  persist();
  return job;
}

function advanceGpu(job: GpuJob) {
  if (job.status === "queued") {
    job.status = "running";
    job.startedAt = now();
    const report = createReport({
      subject: { type: "gpu-job", id: job.id, name: job.name },
      appId: `job:${job.id}`,
      cpu: "Intel TDX",
      gpu: `NVIDIA ${job.gpu} CC`,
      composeHash: sha256(`job:${job.image}`),
      imageDigest: `sha256:${sha256(job.image)}`,
      blockNumber: latestBlock(),
    });
    job.attestationId = report.id;
    recordAttestation(report, job.owner ?? null);
    log(job, `GPU attestation verified (NVIDIA CC on), quote ${report.id}`);
    log(job, `pulling ${job.image}`);
  } else if (job.status === "running") {
    job.progress = Math.min(1, job.progress + 0.04 + Math.random() * 0.05);
    today().gpuHours += Math.round(job.count * 0.25 * 100) / 100;
    const pct = Math.round(job.progress * 100);
    log(job, pct < 100 ? `step ${pct}%: loss ${(2.4 - job.progress * 1.7 + Math.random() * 0.05).toFixed(3)}` : "writing sealed checkpoint");
    if (job.progress >= 1) {
      job.status = "completed";
      job.finishedAt = now();
      log(job, "job complete, outputs sealed to owner key");
    }
  }
  emit("gpu.progress", { jobId: job.id, name: job.name, status: job.status, progress: job.progress }, job.owner ?? null);
}

/* ------------------------------------------------------------------ */
/* Seed + simulation loop                                              */
/* ------------------------------------------------------------------ */

const composeFor = (name: string, image: string, envKeys: string[]) =>
  [
    "services:",
    `  ${name}:`,
    `    image: ${image}`,
    "    restart: unless-stopped",
    "    environment:",
    ...envKeys.map((k) => `      - ${k}=\${${k}}`),
    "    volumes:",
    "      - /var/run/ecls.sock:/var/run/ecls.sock",
    "",
  ].join("\n");

function seed() {
  const rand = seeded(4663);
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 29);
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const growth = 1 + i / 40;
    db.history.push({
      date: dayKey(d),
      attestations: Math.round((1650 + rand() * 520) * growth),
      deployments: Math.round((18 + rand() * 22) * growth),
      gpuHours: Math.round((260 + rand() * 210) * growth),
      tokensM: Math.round((820 + rand() * 380) * growth),
    });
  }
  db.counters.attestationsAllTime = db.history.reduce((s, h) => s + h.attestations, 0);

  const workloads: Array<[string, Cvm["kind"], string, string[], string]> = [
    ["atlas-trader", "agent", "tdx.medium", ["RPC_URL", "SIGNER_KEY", "STRATEGY_SEED"], "US East"],
    ["sealed-rag", "service", "tdx.h100", ["VECTOR_DB_URL", "OPENAI_COMPAT_KEY"], "US West"],
    ["oracle-signer", "agent", "tdx.small", ["SIGNER_KEY"], "EU Central"],
    ["kyc-redactor", "service", "snp.medium", ["S3_BUCKET", "S3_SECRET"], "APAC Singapore"],
    ["eval-harness", "model", "tdx.h200", ["HF_TOKEN"], "US East"],
    ["mm-bot-04", "agent", "tdx.medium", ["RPC_URL", "SIGNER_KEY"], "US East"],
  ];
  workloads.forEach(([name, kind, profileId, envKeys, region], i) => {
    const image = `ghcr.io/eclipseal-labs/${name}:1.${i + 2}.0`;
    const cvm = createCvm({
      name,
      kind,
      profileId,
      region,
      compose: composeFor(name, image, envKeys),
      env: Object.fromEntries(envKeys.map((k) => [k, `seed-${k.toLowerCase()}-${i}`])),
      status: name === "mm-bot-04" ? "stopped" : "running",
      createdAt: new Date(Date.now() - (i + 1) * 36 * 3600_000).toISOString(),
    });
    cvm.stage = DEPLOY_STAGE_COUNT;
    if (cvm.status === "running") {
      cvm.telemetry = { cpu: 8 + Math.round(rand() * 50), mem: 20 + Math.round(rand() * 50), netKbps: Math.round(rand() * 900) };
      for (const line of stages(cvm)) log(cvm, line);
      attestCvm(cvm);
    }
  });

  const jobs: Array<[string, string, number, string, number]> = [
    ["finetune-risk-model", "h200-us-west", 4, "ghcr.io/eclipseal-labs/axolotl:0.9", 6],
    ["embed-filings-batch", "h100-us-east", 2, "ghcr.io/eclipseal-labs/embedder:2.1", 3],
    ["eval-private-bench", "b300-us-east", 1, "ghcr.io/eclipseal-labs/lm-eval:0.5", 2],
  ];
  jobs.forEach(([name, offerId, count, image, hours], i) => {
    const job = createGpuJob({ name, offerId, count, image, hours });
    if (i < 2) {
      advanceGpu(job);
      job.progress = i === 0 ? 0.62 : 1;
      if (i === 1) {
        job.status = "completed";
        job.finishedAt = now();
        log(job, "job complete, outputs sealed to owner key");
      }
    }
  });

  db.secrets.push(seal("PONS_DEPLOYER_KEY", "seed-deployer-key", null));
  persist();
}

export function startEngine() {
  if (isFreshStore || db.cvms.length === 0) seed();
  // Smoke runs from before wallet sign-in left ownerless (public) leftovers; they are not demo content.
  db.secrets = db.secrets.filter((s) => s.owner || !s.name.startsWith("SMOKE_"));
  db.gpuJobs = db.gpuJobs.filter((j) => j.owner || !j.name.startsWith("smoke-"));
  today();

  let tick = 0;
  let lastChainLive: boolean | null = null;
  setInterval(() => {
    tick += 1;
    for (const cvm of db.cvms) {
      if (cvm.status === "provisioning") advanceDeploy(cvm);
      else if (cvm.status === "running") {
        const t = cvm.telemetry;
        t.cpu = Math.max(3, Math.min(97, t.cpu + (Math.random() - 0.5) * 9));
        t.mem = Math.max(10, Math.min(92, t.mem + (Math.random() - 0.5) * 3));
        t.netKbps = Math.max(0, t.netKbps + (Math.random() - 0.5) * 120);
        t.trail = [...(t.trail ?? []), Math.round(t.cpu * 10) / 10].slice(-30);
      }
    }
    if (tick % 2 === 0) {
      for (const job of db.gpuJobs) if (job.status === "queued" || job.status === "running") advanceGpu(job);
    }
    // Heartbeat: a running workload re-attests roughly every 9 seconds.
    if (tick % 6 === 0) {
      const running = db.cvms.filter((c) => c.status === "running");
      const pick = running[Math.floor(Math.random() * running.length)];
      if (pick) attestCvm(pick);
    }
    today().tokensM += Math.round(Math.random() * 2);
    // Chain heartbeat: emit new blocks while live, and only state changes while the RPC is down.
    if (tick % 10 === 0) {
      void chainStatus().then((status) => {
        if (status.live || status.live !== lastChainLive) emit("chain.status", status as unknown as Record<string, unknown>);
        lastChainLive = status.live;
      });
    }
    persist();
  }, 1500);
}
