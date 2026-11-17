"use client";

import { useState, type CSSProperties } from "react";
import { CheckIcon, CopyIcon, KeyIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProofConsole } from "@/components/proof-console";
import { HudPanel, Tag } from "./hud";
import { PageHeader, primaryButton } from "./page-header";
import { ConfirmDialog } from "./confirm-dialog";
import { Meter, Price, SignInGate } from "./holder-ui";
import { api, API_URL, type ApiKeyMeta, type ModelEntry } from "@/lib/api";
import { useApi, useSticky } from "@/lib/hooks";
import { useHolder } from "@/lib/wallet";
import { ago, compact } from "@/lib/format";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          })
          .catch(() => toast.error("Copy failed"))
      }
      className="inline-flex h-7 items-center gap-1.5 border border-line-strong px-2 text-[10.5px] tracking-wider text-bone-dim uppercase transition-colors hover:text-bone"
    >
      {done ? <CheckIcon className="size-3.5 text-signal" /> : <CopyIcon className="size-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="micro text-bone-faint">{label}</p>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto border border-line bg-ink p-3 text-[11px] leading-5 text-bone/85" data-lenis-prevent>
        {code}
      </pre>
    </div>
  );
}

function ApiKeys() {
  const holder = useHolder();
  const me = holder.me;
  const { data, reload } = useApi<ApiKeyMeta[]>(holder.address ? "/api/me/keys" : null);
  const keys = data?.filter((k) => k.address === holder.address);
  const [name, setName] = useState("my-app");
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const secretShown = useSticky(secret);
  const [revoking, setRevoking] = useState<ApiKeyMeta | null>(null);
  const revokingShown = useSticky(revoking);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api<{ secret: string; key: ApiKeyMeta }>("/api/me/keys", { method: "POST", json: { name: name.trim() || "key" } });
      setSecret(res.secret);
      reload();
      void holder.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the key.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ApiKeyMeta) {
    try {
      await api(`/api/me/keys/${key.id}`, { method: "DELETE" });
      toast.success(`${key.name} revoked`);
      reload();
      void holder.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke the key.");
      return false;
    }
  }

  if (!holder.address) return <SignInGate action="get an API key" />;

  return (
    <div className="grid grid-cols-1 gap-4">
      {me ? <Meter label={`Requests today, ${me.tier.label} pass`} value={me.usage.llmRequestsToday} max={me.tier.llmRequestsPerDay} /> : <Skeleton className="h-8" />}
      <form onSubmit={create} className="flex gap-2">
        <Label htmlFor="key-name" className="sr-only">Key name</Label>
        <Input id="key-name" value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="Key name" autoComplete="off" className="h-10 min-w-0 flex-1 border-line-strong bg-ink" />
        <button type="submit" disabled={busy || !name.trim()} className={primaryButton} style={{ "--cut": "9px" } as CSSProperties}>
          <KeyIcon className="size-4" /> {busy ? "Creating" : "Create key"}
        </button>
      </form>
      {!keys ? (
        <Skeleton className="h-16" />
      ) : keys.length === 0 ? (
        <p className="text-xs text-bone-dim">No keys yet. Requests with a key count toward your daily quota and keep receipts tied to your wallet.</p>
      ) : (
        <ul className="divide-y divide-line border border-line">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-[12.5px] text-bone">{k.name}</p>
                <p className="truncate font-mono text-[11px] text-bone-faint">
                  {k.prefix} · {k.lastUsedAt ? `used ${ago(k.lastUsedAt)}` : `created ${ago(k.createdAt)}`}
                </p>
              </div>
              <button type="button" onClick={() => setRevoking(k)} className="shrink-0 text-[11px] tracking-wider text-bone-dim uppercase hover:text-danger">
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={Boolean(secret)} onOpenChange={(v) => !v && setSecret(null)}>
        <DialogContent className="border-line-strong bg-ink-2 font-mono sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm tracking-[0.14em] uppercase">Copy your key now</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-bone-dim">It is shown once. Store it as ECLS_API_KEY; if you lose it, revoke it and create another.</DialogDescription>
          </DialogHeader>
          <p className="border border-line-strong bg-ink p-3 font-mono text-[12px] break-all text-bone">{secretShown}</p>
          <div className="flex justify-end">
            <CopyButton text={secretShown ?? ""} label="Copy key" />
          </div>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(revoking)}
        onOpenChange={(v) => !v && setRevoking(null)}
        title={`Revoke ${revokingShown?.name ?? "key"}?`}
        body="Apps using this key start getting 401 errors right away. This cannot be undone."
        confirmLabel="Revoke key"
        onConfirm={() => (revoking ? revoke(revoking) : Promise.resolve(true))}
      />
    </div>
  );
}

export function ModelsView() {
  const holder = useHolder();
  const pct = holder.me?.tier.discountPct ?? 0;
  const { data } = useApi<{ mode: string; data: ModelEntry[] }>("/api/models");
  const curl = `curl ${API_URL}/v1/chat/completions \\
  -H "authorization: Bearer $ECLS_API_KEY" \\
  -H "content-type: application/json" \\
  -d '{"model":"deepseek/deepseek-v4.1-flash",
       "messages":[{"role":"user","content":"hello"}]}'

# every response carries a receipt
"eclipseal": { "signature": "...", "attestation_id": "att_..." }`;
  const python = `import os
from openai import OpenAI

client = OpenAI(base_url="${API_URL}/v1", api_key=os.environ["ECLS_API_KEY"])
reply = client.chat.completions.create(
    model="qwen/qwen3.8-27b",
    messages=[{"role": "user", "content": "Summarise this contract"}],
)`;

  return (
    <>
      <PageHeader
        title="Private LLM"
        sub="OpenAI-compatible endpoints. Prompts are decrypted only inside the GPU enclave, and each reply is signed by the enclave key so clients can check it."
        action={data && <Tag tone={data.mode === "simulated" ? "ember" : "signal"}>{data.mode === "simulated" ? "Gateway: simulation" : "Gateway: upstream"}</Tag>}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <HudPanel title="Catalog" action={pct ? <Tag tone="ember">{pct}% off</Tag> : undefined}>
          {!data ? (
            <Skeleton className="h-64" />
          ) : (
            <>
              <ul className="grid gap-2 md:hidden">
                {data.data.map((m) => (
                  <li key={m.id} className="border border-line bg-ink-3/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] text-bone">{m.name}</p>
                        <p className="truncate text-[11px] text-bone-faint">{m.id}</p>
                      </div>
                      <Tag tone="cobalt">{m.gpu}</Tag>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-2.5 text-[11px]">
                      <div>
                        <dt className="text-bone-faint">Context</dt>
                        <dd className="text-bone tabular-nums">{compact(m.contextTokens)}</dd>
                      </div>
                      <div>
                        <dt className="text-bone-faint">Input /M</dt>
                        <dd>
                          <Price value={m.inputPerM} pct={pct} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-bone-faint">Output /M</dt>
                        <dd>
                          <Price value={m.outputPerM} pct={pct} />
                        </dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
              <Table className="hidden text-[12px] md:table">
                <TableHeader>
                  <TableRow className="border-line hover:bg-transparent">
                    {["Model", "Context", "Input /M", "Output /M", "Enclave"].map((h) => (
                      <TableHead key={h} className="text-[10.5px] tracking-wider text-bone-faint uppercase">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((m) => (
                    <TableRow key={m.id} className="border-line hover:bg-ink-3/60">
                      <TableCell>
                        <p className="text-bone">{m.name}</p>
                        <p className="text-[11px] text-bone-faint">{m.id}</p>
                      </TableCell>
                      <TableCell className="text-bone/80 tabular-nums">{compact(m.contextTokens)}</TableCell>
                      <TableCell>
                        <Price value={m.inputPerM} pct={pct} />
                      </TableCell>
                      <TableCell>
                        <Price value={m.outputPerM} pct={pct} />
                      </TableCell>
                      <TableCell>
                        <Tag tone="cobalt">{m.gpu}</Tag>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </HudPanel>
        <div className="grid grid-cols-1 content-start gap-4">
          <HudPanel title="API keys">
            <div id="keys" className="scroll-mt-24">
              <ApiKeys />
            </div>
          </HudPanel>
          <HudPanel title="Use it">
            <div className="grid grid-cols-1 gap-4">
              <CodeBlock label="curl" code={curl} />
              <CodeBlock label="python, openai sdk" code={python} />
            </div>
          </HudPanel>
        </div>
      </div>
      <HudPanel title="Playground" className="mt-4" bodyClassName="p-3">
        <ProofConsole compact authed onSent={() => void holder.refresh()} />
      </HudPanel>
    </>
  );
}
