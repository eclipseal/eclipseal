import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { config, isSimulatedLlm } from "./config.js";
import { db, persist } from "./store.js";
import { earlyAccessTier, gpuOffers, holderTiers, models, teeProfiles } from "./catalog.js";
import { allowedActions, attestCvm, attestModel, createCvm, createGpuJob, cvmAction, findAttestation, gpusInUse } from "./engine.js";
import { attestorPublicKey, verifyReport, verifyText } from "./attestor.js";
import { chainStatus } from "./chain.js";
import { emit, recentEvents, subscribe } from "./events.js";
import { publicSecret, seal } from "./vault.js";
import { chatCompletions, signatureFor } from "./llm.js";
import {
  attachViewer,
  createApiKey,
  endSession,
  issueNonce,
  llmUsedToday,
  publicKey,
  requireViewer,
  revokeApiKey,
  verifySignIn,
  viewerFromToken,
  viewerOf,
} from "./auth.js";
import { holderProfile } from "./holders.js";
import { id, sha256 } from "./lib/canonical.js";
import type { AttestationReport, Cvm } from "./types.js";

export const api = Router();
export const openai = Router();

const startedAt = Date.now();
const param = (req: Request, key: string) => String(req.params[key] ?? "");

/** Demo resources (no owner) are public and read-only; owned ones are private to their wallet. */
const visibleTo = (owner: string | null | undefined, viewer: string | null) => !owner || owner === viewer;
const mineFirst = <T extends { owner?: string | null }>(list: T[], viewer: string | null) =>
  viewer ? [...list.filter((x) => x.owner === viewer), ...list.filter((x) => x.owner !== viewer)] : list;
const DEMO_READ_ONLY = "Demo resources are read-only. Create your own to try this.";

const cvmSummary = (c: Cvm) => {
  const { compose, logs, ...rest } = c;
  void compose;
  return { ...rest, owner: c.owner ?? null, allowedActions: allowedActions[c.status], lastLog: logs.at(-1) ?? null };
};

api.use(attachViewer);

/* ---------------------------------- meta ---------------------------------- */

api.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "eclipseal-api",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    attestation: { mode: "simulated", publicKey: attestorPublicKey },
    llm: { mode: isSimulatedLlm ? "simulated" : "upstream" },
  });
});

api.get("/network", async (_req, res) => {
  const chain = await chainStatus();
  const running = db.cvms.filter((c) => c.status === "running");
  const last24h = db.attestations.filter((a) => Date.now() - Date.parse(a.issuedAt) < 86_400_000).length;
  const history = db.history.slice(-30);
  const todayStat = history.at(-1);
  res.json({
    mode: "devnet",
    totals: {
      workloads: db.cvms.length,
      running: running.length,
      gpuJobsActive: db.gpuJobs.filter((j) => j.status === "running" || j.status === "queued").length,
      attestationsAllTime: db.counters.attestationsAllTime,
      attestationsToday: todayStat?.attestations ?? last24h,
      gpuHours30d: history.reduce((s, h) => s + h.gpuHours, 0),
      tokensM30d: history.reduce((s, h) => s + h.tokensM, 0),
      models: models.length,
      sealedSecrets: db.secrets.length,
    },
    composition: {
      cpuTee: running.filter((c) => !c.gpu).length,
      gpuTee: running.filter((c) => c.gpu).length,
      models: models.length,
    },
    chain,
    history,
  });
});

api.get("/chain", async (_req, res) => {
  res.json(await chainStatus());
});

api.get("/token", async (_req, res) => {
  const { address } = config.token;
  res.json({
    name: config.token.name,
    symbol: config.token.symbol,
    chainId: config.chain.id,
    network: config.chain.name,
    address,
    status: address ? "live" : "pre-launch",
    launchpadUrl: config.token.launchpadUrl,
    explorerUrl: address ? `${config.chain.explorerUrl}/token/${address}` : config.chain.explorerUrl,
    pair: "WETH",
    supply: 1_000_000_000,
    utility: [
      { key: "compute", title: "Pay for compute", body: "Settle CVM, GPU and inference bills in $ECLS at a discount to card pricing." },
      { key: "operators", title: "Stake to operate", body: "Node operators bond $ECLS to list TEE hardware; failed attestations are slashed." },
      { key: "buyback", title: "Revenue buybacks", body: "A share of protocol fees buys $ECLS on its Pons pool." },
      { key: "governance", title: "Govern the allowlist", body: "Holders vote on which OS images and GPU firmware the verifier trusts." },
    ],
    // What holding unlocks in the console today; before launch every signed-in wallet gets earlyAccess.
    tiers: holderTiers,
    earlyAccess: earlyAccessTier,
  });
});

api.get("/events", (req, res) => subscribe(res, viewerFromToken(req.query.session)));
api.get("/events/recent", (_req, res) => res.json(recentEvents(30, viewerOf(res)?.address ?? null)));

api.get("/tee-profiles", (_req, res) => res.json(teeProfiles));
api.get("/models", (_req, res) => res.json({ mode: isSimulatedLlm ? "simulated" : "upstream", data: models }));

/* --------------------------------- holders -------------------------------- */

api.post("/auth/nonce", (req, res) => {
  const { address } = z.object({ address: z.string().max(64) }).parse(req.body);
  res.json(issueNonce(address, req));
});

api.post("/auth/verify", async (req, res) => {
  const body = z
    .object({ message: z.string().min(20).max(2000), signature: z.string().regex(/^0x[0-9a-fA-F]+$/, "Signature must be hex").max(4000) })
    .parse(req.body);
  const { token, session } = await verifySignIn(body.message, body.signature as `0x${string}`, req);
  res.status(201).json({ token, expiresAt: session.expiresAt, me: await meFor(session.address) });
});

api.post("/auth/logout", (_req, res) => {
  const viewer = viewerOf(res);
  if (viewer) endSession(viewer.sessionId);
  res.status(204).end();
});

async function meFor(address: string, refresh = false) {
  const profile = await holderProfile(address, refresh);
  return {
    ...profile,
    usage: {
      llmRequestsToday: llmUsedToday(address),
      workloads: db.cvms.filter((c) => c.owner === address).length,
      gpuJobsActive: db.gpuJobs.filter((j) => j.owner === address && (j.status === "queued" || j.status === "running")).length,
      secrets: db.secrets.filter((s) => s.owner === address).length,
      apiKeys: db.apiKeys.filter((k) => k.address === address).length,
    },
  };
}

api.get("/me", async (req, res) => {
  const viewer = requireViewer(res, "see your holder pass");
  if (!viewer) return;
  res.json(await meFor(viewer.address, req.query.refresh === "1"));
});

api.get("/me/keys", (_req, res) => {
  const viewer = requireViewer(res, "manage API keys");
  if (!viewer) return;
  res.json(db.apiKeys.filter((k) => k.address === viewer.address).reverse().map(publicKey));
});

api.post("/me/keys", (req, res) => {
  const viewer = requireViewer(res, "create an API key");
  if (!viewer) return;
  const { name } = z.object({ name: z.string().trim().min(1).max(40) }).parse(req.body);
  res.status(201).json(createApiKey(viewer.address, name));
});

api.delete("/me/keys/:id", (req, res) => {
  const viewer = requireViewer(res, "manage API keys");
  if (!viewer) return;
  if (!revokeApiKey(viewer.address, param(req, "id"))) {
    res.status(404).json({ error: "Key not found." });
    return;
  }
  res.status(204).end();
});

/* ---------------------------------- CVMs ---------------------------------- */

const envSchema = z.record(z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE"), z.string().max(4096));

const createCvmSchema = z.object({
  name: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Lowercase letters, numbers and dashes"),
  compose: z.string().min(10).max(20_000),
  profileId: z.string(),
  region: z.string().max(40).optional(),
  kind: z.enum(["agent", "model", "service"]).optional(),
  env: envSchema.optional(),
});

api.get("/cvms", (_req, res) => {
  const viewer = viewerOf(res)?.address ?? null;
  const list = [...db.cvms].reverse().filter((c) => visibleTo(c.owner, viewer));
  res.json(mineFirst(list, viewer).map(cvmSummary));
});

api.post("/cvms", async (req, res) => {
  const viewer = requireViewer(res, "deploy a workload");
  if (!viewer) return;
  const body = createCvmSchema.parse(req.body);
  if (db.cvms.some((c) => c.name === body.name)) {
    res.status(409).json({ error: `The name ${body.name} is taken. Pick another one.` });
    return;
  }
  if (!teeProfiles.some((p) => p.id === body.profileId)) {
    res.status(400).json({ error: "Unknown TEE profile." });
    return;
  }
  const { tier } = await holderProfile(viewer.address);
  const owned = db.cvms.filter((c) => c.owner === viewer.address).length;
  if (owned >= tier.maxWorkloads) {
    res.status(403).json({
      error: `${tier.label} wallets can run ${tier.maxWorkloads} workload${tier.maxWorkloads === 1 ? "" : "s"}. Delete one, or hold more $ECLS to raise the limit.`,
      code: "quota",
    });
    return;
  }
  const cvm = createCvm({ ...body, owner: viewer.address, discountPct: tier.discountPct });
  res.status(201).json(cvmSummary(cvm));
});

function getCvm(req: Request, res: Response) {
  const viewer = viewerOf(res)?.address ?? null;
  const cvm = db.cvms.find((c) => (c.id === param(req, "id") || c.name === param(req, "id")) && visibleTo(c.owner, viewer));
  if (!cvm) res.status(404).json({ error: "Workload not found." });
  return cvm;
}

api.get("/cvms/:id", (req, res) => {
  const cvm = getCvm(req, res);
  if (cvm) res.json({ ...cvm, owner: cvm.owner ?? null, allowedActions: allowedActions[cvm.status] });
});

api.post("/cvms/:id/actions", (req, res) => {
  const cvm = getCvm(req, res);
  if (!cvm) return;
  const { action } = z.object({ action: z.enum(["start", "stop", "restart", "attest"]) }).parse(req.body);
  // Anyone may ask a demo workload for a fresh quote; lifecycle changes need the owner.
  if (!cvm.owner && action !== "attest") {
    res.status(403).json({ error: DEMO_READ_ONLY, code: "demo" });
    return;
  }
  try {
    const report = cvmAction(cvm, action);
    res.json({ cvm: cvmSummary(cvm), report });
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

api.delete("/cvms/:id", (req, res) => {
  const cvm = getCvm(req, res);
  if (!cvm) return;
  if (!cvm.owner) {
    res.status(403).json({ error: DEMO_READ_ONLY, code: "demo" });
    return;
  }
  db.cvms.splice(db.cvms.indexOf(cvm), 1);
  db.secrets = db.secrets.filter((s) => s.appId !== cvm.appId);
  emit("cvm.status", { cvmId: cvm.id, name: cvm.name, status: "deleted" }, cvm.owner);
  persist();
  res.status(204).end();
});

api.get("/cvms/:id/attestation", (req, res) => {
  const cvm = getCvm(req, res);
  if (!cvm) return;
  const existing = cvm.lastAttestationId ? findAttestation(cvm.lastAttestationId) : undefined;
  if (existing) {
    res.json(existing);
    return;
  }
  if (cvm.status !== "running") {
    res.status(409).json({ error: "Workload is not running, no fresh quote available." });
    return;
  }
  res.json(attestCvm(cvm));
});

/* ------------------------------ attestations ------------------------------ */

api.get("/attestations", (req, res) => {
  const viewer = viewerOf(res)?.address ?? null;
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
  res.json(
    [...db.attestations]
      .reverse()
      .filter((a) => visibleTo(db.attestationOwners[a.id], viewer))
      .slice(0, limit)
      .map(({ quote, ...rest }) => {
        void quote;
        return rest;
      }),
  );
});

/** Reports stay fetchable by id for anyone: a quote is a proof you can hand to someone else. */
api.get("/attestations/:id", (req, res) => {
  const report = findAttestation(param(req, "id"));
  if (!report) {
    res.status(404).json({ error: "Report not found. Reports older than the latest 400 are pruned on devnet." });
    return;
  }
  res.json(report);
});

const verifySchema = z.object({
  reportId: z.string().optional(),
  report: z.unknown().optional(),
  compose: z.string().max(20_000).optional(),
});

api.post("/attestations/verify", (req, res) => {
  const body = verifySchema.parse(req.body);
  const report = (body.report as AttestationReport | undefined) ?? (body.reportId ? findAttestation(body.reportId) : undefined);
  if (!report || typeof report !== "object" || !("signature" in report) || !("measurements" in report)) {
    res.status(400).json({ error: "Provide a report object or a known reportId." });
    return;
  }
  try {
    res.json(verifyReport(report, { compose: body.compose }));
  } catch {
    res.status(400).json({ error: "Malformed attestation report." });
  }
});

api.post("/signatures/verify", (req, res) => {
  const body = z
    .object({ text: z.string().max(4000), signature: z.string().max(400), publicKey: z.string().max(400).optional() })
    .parse(req.body);
  res.json({ valid: verifyText(body.text, body.signature, body.publicKey) });
});

/** Recomputes the response hash server-side so any client can check a chat receipt. */
api.post("/signatures/verify-chat", (req, res) => {
  const body = z
    .object({
      model: z.string().max(120),
      request_hash: z.string().regex(/^[0-9a-f]{64}$/),
      response: z.string().max(64_000),
      signature: z.string().max(400),
    })
    .parse(req.body);
  const responseHash = sha256(body.response);
  const text = `${body.model}:${body.request_hash}:${responseHash}`;
  res.json({ valid: verifyText(text, body.signature), response_hash: responseHash });
});

/* ---------------------------------- GPUs ---------------------------------- */

api.get("/gpu/offers", (_req, res) =>
  res.json(gpuOffers.map((o) => ({ ...o, capacity: o.available, available: Math.max(0, o.available - gpusInUse(o.id)) }))),
);

api.get("/gpu/jobs", (_req, res) => {
  const viewer = viewerOf(res)?.address ?? null;
  const list = [...db.gpuJobs].reverse().filter((j) => visibleTo(j.owner, viewer));
  res.json(mineFirst(list, viewer).map(({ logs, ...rest }) => ({ ...rest, owner: rest.owner ?? null, lastLog: logs.at(-1) ?? null })));
});

function getJob(req: Request, res: Response) {
  const viewer = viewerOf(res)?.address ?? null;
  const job = db.gpuJobs.find((j) => j.id === param(req, "id") && visibleTo(j.owner, viewer));
  if (!job) res.status(404).json({ error: "Job not found." });
  return job;
}

api.get("/gpu/jobs/:id", (req, res) => {
  const job = getJob(req, res);
  if (job) res.json({ ...job, owner: job.owner ?? null });
});

api.post("/gpu/jobs", async (req, res) => {
  const viewer = requireViewer(res, "launch a GPU job");
  if (!viewer) return;
  const body = z
    .object({
      name: z.string().min(3).max(40).regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and dashes"),
      offerId: z.string(),
      count: z.number().int().min(1).max(8),
      image: z.string().min(3).max(200),
      hours: z.number().min(0.5).max(168),
    })
    .parse(req.body);
  const { tier } = await holderProfile(viewer.address);
  if (body.count > tier.maxGpusPerJob) {
    res.status(403).json({
      error: `${tier.label} wallets can use up to ${tier.maxGpusPerJob} GPU${tier.maxGpusPerJob === 1 ? "" : "s"} per job. Hold more $ECLS to raise the limit.`,
      code: "quota",
    });
    return;
  }
  try {
    res.status(201).json(createGpuJob({ ...body, owner: viewer.address, discountPct: tier.discountPct }));
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

api.post("/gpu/jobs/:id/cancel", (req, res) => {
  const job = getJob(req, res);
  if (!job) return;
  if (!job.owner) {
    res.status(403).json({ error: DEMO_READ_ONLY, code: "demo" });
    return;
  }
  if (job.status === "queued" || job.status === "running") {
    job.status = "cancelled";
    job.finishedAt = new Date().toISOString();
    job.logs.push({ t: job.finishedAt, line: "cancelled by owner, GPU memory scrubbed" });
    emit("gpu.progress", { jobId: job.id, name: job.name, status: job.status, progress: job.progress }, job.owner);
    persist();
  }
  res.json({ ...job, owner: job.owner });
});

/* --------------------------------- secrets -------------------------------- */

api.get("/secrets", (_req, res) => {
  const viewer = viewerOf(res)?.address ?? null;
  const list = [...db.secrets].reverse().filter((s) => visibleTo(s.owner, viewer));
  res.json(mineFirst(list, viewer).map((s) => ({ ...publicSecret(s), owner: s.owner ?? null })));
});

api.post("/secrets", (req, res) => {
  const viewer = requireViewer(res, "seal a secret");
  if (!viewer) return;
  const body = z
    .object({
      name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/, "Use UPPER_SNAKE_CASE, starting with a letter").max(64),
      value: z.string().min(1).max(4096),
      appId: z.string().max(64).nullable().optional(),
    })
    .parse(req.body);
  const appId = body.appId ?? null;
  if (appId && !db.cvms.some((c) => c.appId === appId && c.owner === viewer.address)) {
    res.status(400).json({ error: "You can only bind a secret to one of your own workloads." });
    return;
  }
  const sealed = { ...seal(body.name, body.value, appId), owner: viewer.address };
  // Same name and scope rotates the value in place instead of leaving two candidates.
  const existing = db.secrets.find((s) => s.owner === viewer.address && s.name === body.name && s.appId === appId);
  if (existing) Object.assign(existing, { ...sealed, id: existing.id });
  else db.secrets.push(sealed);
  const secret = existing ?? sealed;
  emit("secret.sealed", { id: secret.id, name: secret.name, appId: secret.appId, fingerprint: secret.fingerprint }, viewer.address);
  persist();
  res.status(existing ? 200 : 201).json({ ...publicSecret(secret), owner: secret.owner, rotated: Boolean(existing) });
});

api.delete("/secrets/:id", (req, res) => {
  const viewer = viewerOf(res)?.address ?? null;
  const secret = db.secrets.find((s) => s.id === param(req, "id") && visibleTo(s.owner, viewer));
  if (!secret) {
    res.status(404).json({ error: "Secret not found." });
    return;
  }
  if (!secret.owner) {
    res.status(403).json({ error: DEMO_READ_ONLY, code: "demo" });
    return;
  }
  db.secrets = db.secrets.filter((s) => s !== secret);
  persist();
  res.status(204).end();
});

/* -------------------------------- waitlist -------------------------------- */

api.post("/waitlist", (req, res) => {
  const { contact } = z
    .object({
      contact: z
        .string()
        .trim()
        .max(120)
        .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^@?[A-Za-z0-9_]{2,15}$/.test(v), "Enter an email or an X handle"),
    })
    .parse(req.body);
  const normalized = contact.toLowerCase();
  if (!db.waitlist.some((w) => w.contact === normalized)) {
    db.waitlist.push({ id: id("wl"), contact: normalized, createdAt: new Date().toISOString() });
    persist();
  }
  res.status(201).json({ ok: true, position: db.waitlist.findIndex((w) => w.contact === normalized) + 1 });
});

/* ------------------------- OpenAI-compatible gateway ------------------------ */

openai.get("/models", (_req, res) => {
  res.json({
    object: "list",
    data: models.map((m) => ({ id: m.id, object: "model", owned_by: m.provider, context_length: m.contextTokens })),
  });
});
openai.post("/chat/completions", chatCompletions);
openai.get("/signature/:chatId", (req, res) => {
  const sig = signatureFor(param(req, "chatId"));
  if (!sig) {
    res.status(404).json({ error: "Unknown chat id." });
    return;
  }
  res.json(sig);
});
openai.get("/attestation/report", (req, res) => {
  const model = String(req.query.model ?? models[0].id);
  res.json(attestModel(model));
});

