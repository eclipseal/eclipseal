import type { Request, Response } from "express";
import { z } from "zod";
import { config, isSimulatedLlm } from "./config.js";
import { models } from "./catalog.js";
import { attestModel } from "./engine.js";
import { attestorPublicKey, signText } from "./attestor.js";
import { canonicalize, id, sha256 } from "./lib/canonical.js";
import { db, persist, trim } from "./store.js";
import { emit } from "./events.js";
import { today } from "./engine.js";
import { countLlmRequest, gatewayCaller, llmUsedToday } from "./auth.js";
import { holderProfile } from "./holders.js";

export const chatSchema = z.object({
  model: z.string().min(1).max(120),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string().max(16_000),
      }),
    )
    .min(1)
    .max(40),
  stream: z.boolean().optional(),
  max_tokens: z.number().int().positive().max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

type ChatBody = z.infer<typeof chatSchema>;

function simulate(body: ChatBody, modelName: string, gpu: string) {
  const prompt = [...body.messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const text = prompt.toLowerCase();
  if (/\b(tee|enclave|trusted execution|confidential)\b/.test(text)) {
    return "A trusted execution environment is an isolated region of a CPU or GPU. Its memory is encrypted, so the host OS, the hypervisor and the cloud operator cannot read it. The chip also signs a quote that lists exactly which code was loaded, which is why this answer can come with a proof.";
  }
  if (/\b(attest|proof|prove|verify|signature)\b/.test(text)) {
    return "This reply was hashed and signed by a key that only exists inside the model enclave. Check the signature against the attestation report: if the measurements match the published image, you know which model and which code produced this text.";
  }
  if (/\b(price|pricing|cost|cheap|token)\b/.test(text)) {
    return `${modelName} is billed per million tokens, and prompts are encrypted from your client to the enclave. You pay for compute, not for your data being read.`;
  }
  const words = prompt.trim().split(/\s+/).filter(Boolean).length;
  return `Your ${words}-word prompt was decrypted only inside TEE memory on an ${gpu} enclave and processed by ${modelName}. Nothing outside the enclave saw it in plaintext, and this reply was signed before it left the boundary.`;
}

async function upstream(body: ChatBody) {
  const res = await fetch(`${config.upstreamLlm.baseUrl!.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${config.upstreamLlm.apiKey}` },
    body: JSON.stringify({ ...body, stream: false }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Upstream returned ${res.status}`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return json.choices?.[0]?.message?.content ?? "";
}

function sealReceipt(body: ChatBody, content: string, caller: string | null) {
  const attestation = attestModel(body.model);
  const requestHash = sha256(canonicalize({ model: body.model, messages: body.messages }));
  const responseHash = sha256(content);
  const signedText = `${body.model}:${requestHash}:${responseHash}`;
  const record = {
    id: id("chatcmpl", 10),
    model: body.model,
    requestHash,
    responseHash,
    signedText,
    signature: signText(signedText),
    attestationId: attestation.id,
    simulated: isSimulatedLlm,
    createdAt: new Date().toISOString(),
  };
  db.chats.push(record);
  trim(db.chats, 300);
  today().tokensM += 1;
  persist();
  emit("chat.signed", { chatId: record.id, model: record.model, attestationId: record.attestationId }, caller);
  return {
    record,
    receipt: {
      chat_id: record.id,
      request_hash: requestHash,
      response_hash: responseHash,
      signed_text: signedText,
      signature: record.signature,
      signing_algo: "ed25519",
      public_key: attestorPublicKey,
      attestation_id: attestation.id,
      simulated: record.simulated,
    },
  };
}

export async function chatCompletions(req: Request, res: Response) {
  // No key: the public demo, limited per IP. A key or console session: the wallet's daily tier quota.
  const caller = gatewayCaller(req);
  if (caller === null) {
    res.status(401).json({ error: { message: "Invalid API key. Create one in the Eclipseal console under Private LLM.", type: "invalid_api_key" } });
    return;
  }
  const body = chatSchema.parse(req.body);
  const model = models.find((m) => m.id === body.model);
  if (!model) {
    res.status(404).json({ error: { message: `Unknown model ${body.model}`, type: "invalid_request_error" } });
    return;
  }
  if (caller) {
    const { tier } = await holderProfile(caller.address);
    const used = llmUsedToday(caller.address);
    res.setHeader("x-ecls-quota-limit", String(tier.llmRequestsPerDay));
    res.setHeader("x-ecls-quota-remaining", String(Math.max(0, tier.llmRequestsPerDay - used - 1)));
    if (used >= tier.llmRequestsPerDay) {
      res.setHeader("x-ecls-quota-remaining", "0");
      res.status(429).json({
        error: {
          message: `Daily limit of ${tier.llmRequestsPerDay.toLocaleString("en-US")} requests reached for ${tier.label} wallets. It resets at 00:00 UTC, and holding more $ECLS raises it.`,
          type: "quota_exceeded",
        },
      });
      return;
    }
  }

  let content: string;
  try {
    content = isSimulatedLlm ? simulate(body, model.name, model.gpu) : await upstream(body);
  } catch (err) {
    res.status(502).json({ error: { message: (err as Error).message, type: "upstream_error" } });
    return;
  }

  if (caller) countLlmRequest(caller.address);
  const { record, receipt } = sealReceipt(body, content, caller?.address ?? null);
  const created = Math.floor(Date.now() / 1000);
  const usage = {
    prompt_tokens: Math.ceil(canonicalize(body.messages).length / 4),
    completion_tokens: Math.ceil(content.length / 4),
    total_tokens: 0,
  };
  usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
  res.setHeader("x-eclipseal-signature", receipt.signature);
  res.setHeader("x-eclipseal-attestation", receipt.attestation_id);

  if (!body.stream) {
    res.json({
      id: record.id,
      object: "chat.completion",
      created,
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage,
      eclipseal: receipt,
    });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const chunk = (delta: Record<string, unknown>, finish: string | null, extra = {}) =>
    `data: ${JSON.stringify({ id: record.id, object: "chat.completion.chunk", created, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`;

  res.write(chunk({ role: "assistant" }, null));
  // Pieces concatenate back to exactly `content`, so the client-side hash matches the signed one.
  const pieces = content.match(/\s*\S+\s*/g) ?? [content];
  // res, not req: a request emits "close" as soon as its body has been read.
  let closed = false;
  res.on("close", () => {
    closed = true;
  });
  for (const piece of pieces) {
    if (closed) return;
    res.write(chunk({ content: piece }, null));
    await new Promise((r) => setTimeout(r, 28));
  }
  res.write(chunk({}, "stop", { usage, eclipseal: receipt }));
  res.write("data: [DONE]\n\n");
  res.end();
}

export function signatureFor(chatId: string) {
  const record = db.chats.find((c) => c.id === chatId);
  if (!record) return null;
  return {
    chat_id: record.id,
    text: record.signedText,
    signature: record.signature,
    signing_algo: "ed25519",
    public_key: attestorPublicKey,
    attestation_id: record.attestationId,
  };
}
