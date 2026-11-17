"use client";

import { useState, type CSSProperties } from "react";
import { LockKeyIcon, TrashIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HudPanel, Tag } from "./hud";
import { PageHeader, primaryButton } from "./page-header";
import { ConfirmDialog } from "./confirm-dialog";
import { OwnerTag, SignInGate } from "./holder-ui";
import { api, ApiError, type Cvm, type SecretMeta } from "@/lib/api";
import { useApi, useSticky } from "@/lib/hooks";
import { useHolder } from "@/lib/wallet";
import { ago } from "@/lib/format";

export function VaultView() {
  const holder = useHolder();
  const viewer = holder.address;
  const { data: secrets, reload } = useApi<SecretMeta[]>("/api/secrets", 6000);
  const { data: cvms } = useApi<Cvm[]>("/api/cvms", 15_000);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [scope, setScope] = useState("global");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [destroying, setDestroying] = useState<SecretMeta | null>(null);
  const destroyingShown = useSticky(destroying);

  const myWorkloads = (cvms ?? []).filter((c) => c.owner && c.owner === viewer);
  // A scope can go stale if its workload was deleted; fall back to global instead of sending a dead app id.
  const scopeValue = scope === "global" || myWorkloads.some((c) => c.appId === scope) ? scope : "global";
  const appName = (appId: string | null) => (appId ? (cvms?.find((c) => c.appId === appId)?.name ?? `${appId.slice(0, 14)}…`) : "Global");
  const nameProblem = name && !/^[A-Z_][A-Z0-9_]*$/.test(name) ? "Start with a letter or underscore." : null;
  const existing = secrets?.find((s) => s.owner === viewer && s.name === name && (s.appId ?? "global") === scopeValue);

  async function seal(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !value || nameProblem) return;
    setBusy(true);
    setError(null);
    try {
      const sealed = await api<SecretMeta>("/api/secrets", { method: "POST", json: { name, value, appId: scopeValue === "global" ? null : scopeValue } });
      toast.success(sealed.rotated ? `${name} rotated, the old value is gone` : `${name} sealed`);
      setName("");
      setValue("");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not seal the secret.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(s: SecretMeta) {
    try {
      await api(`/api/secrets/${s.id}`, { method: "DELETE" });
      toast.success(`${s.name} destroyed`);
      reload();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      return false;
    }
  }

  const mine = (s: SecretMeta) => Boolean(s.owner && s.owner === viewer);

  return (
    <>
      <PageHeader title="Vault" sub="Secrets are sealed with AES-256-GCM under a per-app key. The key is released only to an enclave whose measurements match, so plaintext never comes back out of this API." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <HudPanel title="Seal a secret">
          {!viewer ? (
            <SignInGate action="seal secrets" />
          ) : (
            <form onSubmit={seal} className="grid gap-4" noValidate>
              <div className="grid gap-2">
                <Label htmlFor="s-name" className="text-xs text-bone-dim">Name (UPPER_SNAKE_CASE)</Label>
                <Input
                  id="s-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_").slice(0, 64))}
                  placeholder="OPENAI_COMPAT_KEY"
                  aria-invalid={Boolean(nameProblem)}
                  autoComplete="off"
                  className="h-10 border-line-strong bg-ink font-mono"
                />
                {nameProblem && <p className="text-[11px] text-danger">{nameProblem}</p>}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="s-value" className="text-xs text-bone-dim">Value</Label>
                <Input id="s-value" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} className="h-10 border-line-strong bg-ink font-mono" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="s-scope" className="text-xs text-bone-dim">Release to</Label>
                <Select value={scopeValue} onValueChange={setScope}>
                  <SelectTrigger id="s-scope" className="h-10 w-full border-line-strong bg-ink text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global" className="text-xs">
                      Any of my measured workloads
                    </SelectItem>
                    {myWorkloads.map((c) => (
                      <SelectItem key={c.appId} value={c.appId} className="text-xs">
                        {c.name} only
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {existing && <p className="text-[11.5px] text-ember">{name} already exists in this scope. Sealing again rotates it and destroys the old value.</p>}
              {error && <p className="text-sm text-danger">{error}</p>}
              <button type="submit" disabled={busy || !name || !value || Boolean(nameProblem)} className={primaryButton} style={{ "--cut": "9px" } as CSSProperties}>
                <LockKeyIcon className="size-4" /> {busy ? "Sealing" : existing ? "Rotate secret" : "Seal secret"}
              </button>
            </form>
          )}
        </HudPanel>
        <HudPanel title={`Sealed ${secrets ? `(${secrets.length})` : ""}`}>
          {!secrets ? (
            <Skeleton className="h-60" />
          ) : secrets.length === 0 ? (
            <p className="py-10 text-center text-sm text-bone-dim">Nothing sealed yet.</p>
          ) : (
            <>
              <ul className="grid gap-2 md:hidden">
                {secrets.map((s) => (
                  <li key={s.id} className="border border-line bg-ink-3/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-mono text-[13px] break-all text-bone">{s.name}</p>
                      {mine(s) && (
                        <button type="button" aria-label={`Destroy ${s.name}`} onClick={() => setDestroying(s)} className="-m-1 grid size-9 shrink-0 place-items-center text-bone-faint hover:text-danger">
                          <TrashIcon className="size-4" />
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Tag tone={s.appId ? "cobalt" : "muted"}>{appName(s.appId)}</Tag>
                      <OwnerTag owner={s.owner} viewer={viewer} />
                    </div>
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[11px]">
                      <dt className="text-bone-faint">Fingerprint</dt>
                      <dd className="truncate text-right font-mono text-bone-dim">{s.fingerprint}</dd>
                      <dt className="text-bone-faint">Size</dt>
                      <dd className="text-right text-bone-dim tabular-nums">{s.bytes} B</dd>
                      <dt className="text-bone-faint">Sealed</dt>
                      <dd className="text-right text-bone-dim">{ago(s.sealedAt)}</dd>
                    </dl>
                  </li>
                ))}
              </ul>
              <Table className="hidden text-[12px] md:table">
                <TableHeader>
                  <TableRow className="border-line hover:bg-transparent">
                    {["Name", "Released to", "Fingerprint", "Size", "Sealed", ""].map((h) => (
                      <TableHead key={h} className="text-[10.5px] tracking-wider text-bone-faint uppercase">
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {secrets.map((s) => (
                    <TableRow key={s.id} className="border-line hover:bg-ink-3/60">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-bone">{s.name}</span>
                          <OwnerTag owner={s.owner} viewer={viewer} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Tag tone={s.appId ? "cobalt" : "muted"}>{appName(s.appId)}</Tag>
                      </TableCell>
                      <TableCell className="font-mono text-bone-dim">{s.fingerprint}</TableCell>
                      <TableCell className="text-bone-dim tabular-nums">{s.bytes} B</TableCell>
                      <TableCell className="text-bone-dim">{ago(s.sealedAt)}</TableCell>
                      <TableCell className="w-10">
                        {mine(s) && (
                          <button type="button" aria-label={`Destroy ${s.name}`} onClick={() => setDestroying(s)} className="grid size-8 place-items-center text-bone-faint hover:text-danger">
                            <TrashIcon className="size-4" />
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </HudPanel>
      </div>
      <ConfirmDialog
        open={Boolean(destroying)}
        onOpenChange={(v) => !v && setDestroying(null)}
        title={`Destroy ${destroyingShown?.name ?? "secret"}?`}
        body="The sealed value is erased. Workloads that read it lose access on their next boot. This cannot be undone."
        confirmLabel="Destroy secret"
        onConfirm={() => (destroying ? remove(destroying) : Promise.resolve(true))}
      />
    </>
  );
}
