"use client";

import { useRef, useState } from "react";
import { CheckCircleIcon, PaperPlaneRightIcon, ShieldCheckIcon, WarningIcon, XCircleIcon } from "@phosphor-icons/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api, API_URL, ApiError, session, type AttestationReport, type ChatReceipt, type ModelEntry, type VerifyResult } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { fallbackModels } from "@/lib/site";
import { short } from "@/lib/format";
import { cn } from "@/lib/utils";

const presets = ["What is a TEE?", "How do I verify this answer?", "What does a sealed inference cost?"];

type Phase = "idle" | "streaming" | "done" | "error";

/**
 * Real round trip against the control plane: stream a completion, then verify the
 * enclave signature and the model's attestation report. In the console (`authed`)
 * requests carry the wallet session, so they count toward the holder's daily quota.
 */
export function ProofConsole({ className, compact = false, authed = false, onSent }: { className?: string; compact?: boolean; authed?: boolean; onSent?: () => void }) {
  const { data: models } = useApi<{ data: ModelEntry[]; mode: string }>("/api/models");
  const list = models?.data ?? fallbackModels;
  const [model, setModel] = useState(fallbackModels[0].id);
  const [sentModel, setSentModel] = useState(model);
  const [prompt, setPrompt] = useState(presets[0]);
  const [answer, setAnswer] = useState("");
  const [receipt, setReceipt] = useState<ChatReceipt | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<"unchecked" | "valid" | "invalid">("unchecked");
  const [tampered, setTampered] = useState(false);
  const [report, setReport] = useState<AttestationReport | null>(null);
  const [verdict, setVerdict] = useState<VerifyResult | null>(null);
  const [checking, setChecking] = useState<"signature" | "enclave" | null>(null);
  const abort = useRef<AbortController | null>(null);

  async function send() {
    if (!prompt.trim() || phase === "streaming") return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setPhase("streaming");
    setSentModel(model);
    setAnswer("");
    setReceipt(null);
    setSig("unchecked");
    setTampered(false);
    setReport(null);
    setVerdict(null);
    setError(null);
    try {
      const request = (token: string | null) =>
        fetch(`${API_URL}/v1/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ model, stream: true, messages: [{ role: "user", content: prompt.trim() }] }),
          signal: controller.signal,
        });
      const token = authed ? session.token() : null;
      let res = await request(token);
      if (res.status === 401 && token) {
        // The session expired: drop it and answer as the public demo instead of failing.
        session.set(null);
        res = await request(null);
      }
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? body?.error ?? `Gateway returned ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (data === "[DONE]") continue;
          const chunk = JSON.parse(data);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) setAnswer((a) => a + delta);
          if (chunk.eclipseal) setReceipt(chunk.eclipseal as ChatReceipt);
        }
      }
      setPhase("done");
      onSent?.();
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setPhase("error");
      setError((e as Error).message.includes("fetch") ? "Gateway unreachable. Start the API with npm run dev." : (e as Error).message);
    }
  }

  async function verifySignature() {
    if (!receipt) return;
    setChecking("signature");
    setError(null);
    // The hash is recomputed from the text on screen, so editing the answer breaks the proof.
    try {
      const { valid } = await api<{ valid: boolean }>("/api/signatures/verify-chat", {
        method: "POST",
        json: { model: sentModel, request_hash: receipt.request_hash, response: answer, signature: receipt.signature },
      });
      setSig(valid ? "valid" : "invalid");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed.");
    } finally {
      setChecking(null);
    }
  }

  async function verifyEnclave() {
    if (!receipt) return;
    setChecking("enclave");
    setError(null);
    try {
      // Check the exact quote the receipt names; fall back to the model's current quote if it was pruned.
      const r = await api<AttestationReport>(`/api/attestations/${receipt.attestation_id}`).catch(() =>
        api<AttestationReport>(`/v1/attestation/report?model=${encodeURIComponent(sentModel)}`),
      );
      setReport(r);
      setVerdict(await api<VerifyResult>("/api/attestations/verify", { method: "POST", json: { report: r } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not fetch the attestation report.");
    } finally {
      setChecking(null);
    }
  }

  return (
    <div className={cn("grid gap-px bg-line md:grid-cols-2", className)}>
      {/* request */}
      <div className="flex flex-col gap-4 bg-ink-2 p-5 md:p-7">
        <div className="grid gap-2">
          <Label htmlFor="pc-model" className="micro text-bone-dim">Model</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger id="pc-model" className="h-11 w-full border-line-strong bg-ink font-mono text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {list.map((m) => (
                <SelectItem key={m.id} value={m.id} className="font-mono text-sm">
                  {m.name} <span className="text-bone-faint">({m.gpu})</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pc-prompt" className="micro text-bone-dim">Prompt</Label>
          <Textarea
            id="pc-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
            rows={compact ? 3 : 4}
            className="resize-none border-line-strong bg-ink text-[15px] leading-relaxed"
          />
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPrompt(p)}
                className={cn(
                  "border px-2.5 py-1.5 text-xs transition-colors",
                  prompt === p ? "border-ember text-ember" : "border-line-strong text-bone-dim hover:text-bone",
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void send()}
          disabled={phase === "streaming" || !prompt.trim()}
          className="mt-auto inline-flex h-12 items-center justify-center gap-2 bg-ember text-sm font-semibold tracking-wide text-ink uppercase transition-transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
        >
          <PaperPlaneRightIcon className="size-4" weight="bold" />
          {phase === "streaming" ? "Running in enclave" : "Send sealed prompt"}
        </button>
        {models?.mode === "simulated" && (
          <p className="text-xs leading-relaxed text-bone-faint">
            Gateway is in simulation mode: responses are templated, signatures and attestation checks are real. Set an upstream provider in the API env to run live inference.
          </p>
        )}
      </div>

      {/* response + proof */}
      <div className="flex min-h-[420px] flex-col gap-4 bg-ink p-5 md:p-7">
        <div className="micro flex items-center justify-between text-bone-dim">
          <span>Response</span>
          {receipt && <span className="text-bone-faint">{short(receipt.chat_id, 12, 4)}</span>}
        </div>
        {phase === "idle" && <p className="text-[15px] leading-relaxed text-bone-faint">Send a prompt. The answer streams back from the enclave with a signature you can check yourself.</p>}
        {phase === "error" && (
          <p className="flex items-start gap-2 text-sm text-danger">
            <WarningIcon className="mt-0.5 size-4 shrink-0" /> {error}
          </p>
        )}
        {(phase === "streaming" || phase === "done") && (
          <div className="relative">
            <Textarea
              aria-label="Response text"
              value={answer}
              readOnly={phase !== "done"}
              onChange={(e) => {
                setAnswer(e.target.value);
                setTampered(true);
                setSig("unchecked");
              }}
              rows={compact ? 5 : 6}
              className="resize-none border-line bg-ink-2 text-[15px] leading-relaxed"
            />
            {phase === "streaming" && <span className="animate-blink absolute right-3 bottom-3 h-4 w-2 bg-ember" />}
          </div>
        )}
        {receipt && (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-mono text-[11.5px]">
              <dt className="text-bone-faint">request</dt>
              <dd className="truncate text-bone/80">{short(receipt.request_hash, 18, 6)}</dd>
              <dt className="text-bone-faint">response</dt>
              <dd className="truncate text-bone/80">{short(receipt.response_hash, 18, 6)}</dd>
              <dt className="text-bone-faint">signature</dt>
              <dd className="truncate text-bone/80">{short(receipt.signature, 18, 6)}</dd>
              <dt className="text-bone-faint">enclave</dt>
              <dd className="truncate text-bone/80">{receipt.attestation_id}</dd>
            </dl>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={checking !== null || phase !== "done"}
                onClick={() => void verifySignature()}
                className="inline-flex h-10 items-center gap-2 border border-line-strong px-3 text-xs font-semibold tracking-wide uppercase transition-colors hover:border-bone disabled:opacity-50"
              >
                <ShieldCheckIcon className="size-4" /> {checking === "signature" ? "Verifying" : "Verify signature"}
              </button>
              <button
                type="button"
                disabled={checking !== null || phase !== "done"}
                onClick={() => void verifyEnclave()}
                className="inline-flex h-10 items-center gap-2 border border-line-strong px-3 text-xs font-semibold tracking-wide uppercase transition-colors hover:border-bone disabled:opacity-50"
              >
                {checking === "enclave" ? "Checking" : "Check enclave quote"}
              </button>
            </div>
            {phase === "done" && error && (
              <p className="flex items-start gap-2 text-sm text-danger">
                <WarningIcon className="mt-0.5 size-4 shrink-0" /> {error}
              </p>
            )}
            {sig !== "unchecked" && (
              <p className={cn("flex items-center gap-2 text-sm", sig === "valid" ? "text-signal" : "text-danger")}>
                {sig === "valid" ? <CheckCircleIcon className="size-4" weight="fill" /> : <XCircleIcon className="size-4" weight="fill" />}
                {sig === "valid"
                  ? "Signature valid. This exact text left the enclave."
                  : tampered
                    ? "Signature invalid. The text was edited after it was signed."
                    : "Signature invalid."}
              </p>
            )}
            {sig === "valid" && !tampered && (
              <p className="text-xs text-bone-faint">Try editing one word of the response, then verify again.</p>
            )}
            {verdict && report && (
              <div className="border border-line bg-ink-2 p-3">
                <p className={cn("micro mb-2 break-words", verdict.valid ? "text-signal" : "text-danger")}>
                  {verdict.verdict}: {report.tee.cpu} + {report.tee.gpu} · {short(report.id, 10, 4)}
                </p>
                <ul className="space-y-1 text-[12.5px]">
                  {verdict.checks.map((c) => (
                    <li key={c.id} className="flex gap-2">
                      <span
                        className={cn(
                          "w-10 shrink-0 font-mono text-[11px] uppercase",
                          c.status === "pass" && "text-signal",
                          c.status === "fail" && "text-danger",
                          c.status === "warn" && "text-ember",
                          c.status === "skip" && "text-bone-faint",
                        )}
                      >
                        {c.status}
                      </span>
                      <span className="text-bone/80">{c.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
