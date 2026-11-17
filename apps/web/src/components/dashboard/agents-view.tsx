"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { DotsThreeVerticalIcon, RocketLaunchIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { HudPanel, Tag, statusTone } from "./hud";
import { PageHeader, primaryButton } from "./page-header";
import { ReportVerifier } from "./report-view";
import { ConfirmDialog } from "./confirm-dialog";
import { OwnerTag, Price, SignInGate } from "./holder-ui";
import { api, ApiError, type AttestationReport, type Cvm, type TeeProfile } from "@/lib/api";
import { useApi, useSessionToken, useSticky } from "@/lib/hooks";
import { useHolder } from "@/lib/wallet";
import { ago, clock } from "@/lib/format";
import { cn } from "@/lib/utils";

type Action = "start" | "stop" | "restart" | "attest";

const sampleCompose = `services:
  agent:
    image: ghcr.io/eclipseal-labs/eliza-trader:1.4.0
    restart: unless-stopped
    environment:
      - RPC_URL=\${RPC_URL}
      - SIGNER_KEY=\${SIGNER_KEY}
    volumes:
      - /var/run/ecls.sock:/var/run/ecls.sock
`;
const sampleEnv = "RPC_URL=https://rpc.mainnet.chain.robinhood.com\nSIGNER_KEY=0xyour-private-key";

const regions = ["US East", "US West", "EU Central", "APAC Singapore"];

const randomName = () => `agent-${Math.random().toString(36).slice(2, 6)}`;

function nameProblem(name: string) {
  if (name.length < 3) return "Use at least 3 characters.";
  if (name.length > 32) return "Use 32 characters at most.";
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) return "Lowercase letters, numbers and dashes, starting and ending with a letter or number.";
  return null;
}

function parseEnv(text: string): { values: Record<string, string>; problem: string | null } {
  const values: Record<string, string> = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) return { values, problem: `Line ${i + 1} must look like KEY=value.` };
    const key = line.slice(0, eq).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) return { values, problem: `Line ${i + 1}: ${key} must be UPPER_SNAKE_CASE.` };
    values[key] = line.slice(eq + 1).trim();
  }
  return { values, problem: null };
}

const teeLabel = (c: Cvm) => (c.gpu ? `TDX + ${c.gpu.replace("NVIDIA ", "")}` : c.cpu);
const statusLabel = (c: Cvm) => (c.status === "provisioning" ? `boot ${Math.min(c.stage, 8)}/8` : c.status);

function DeployDialog({ open, onOpenChange, onDeployed }: { open: boolean; onOpenChange: (v: boolean) => void; onDeployed: (c: Cvm) => void }) {
  const holder = useHolder();
  const { data: profiles } = useApi<TeeProfile[]>(open ? "/api/tee-profiles" : null);
  const [name, setName] = useState(randomName);
  const [profileId, setProfileId] = useState("tdx.medium");
  const [region, setRegion] = useState(regions[0]);
  const [compose, setCompose] = useState(sampleCompose);
  const [envText, setEnvText] = useState(sampleEnv);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profile = profiles?.find((p) => p.id === profileId);
  const me = holder.me;
  const env = parseEnv(envText);
  const problems = {
    name: nameProblem(name),
    compose: compose.trim().length < 10 ? "Paste the docker-compose file to measure." : null,
    env: env.problem,
  };
  const invalid = Boolean(problems.name || problems.compose || problems.env);
  const atLimit = me ? me.usage.workloads >= me.tier.maxWorkloads : false;
  const show = (field: keyof typeof problems) => (touched || field !== "name" ? problems[field] : null);

  function reset() {
    setName(randomName());
    setProfileId("tdx.medium");
    setRegion(regions[0]);
    setCompose(sampleCompose);
    setEnvText(sampleEnv);
    setTouched(false);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (invalid || atLimit) return;
    setBusy(true);
    setError(null);
    try {
      const cvm = await api<Cvm>("/api/cvms", { method: "POST", json: { name, profileId, region, compose, env: env.values, kind: "agent" } });
      toast.success(`Deploying ${cvm.name}`);
      onDeployed(cvm);
      onOpenChange(false);
      reset();
      void holder.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-line-strong bg-ink-2 font-mono sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm tracking-[0.14em] uppercase">Deploy a confidential workload</DialogTitle>
          <DialogDescription className="text-xs text-bone-dim">
            Same as <code>ecls deploy -c docker-compose.yml</code>. Env values are sealed to this app and never shown again.
          </DialogDescription>
        </DialogHeader>
        {!holder.address ? (
          <SignInGate action="deploy a workload" />
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid content-start gap-2">
                <Label htmlFor="d-name" className="text-xs text-bone-dim">Name</Label>
                <Input
                  id="d-name"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                  onBlur={() => setTouched(true)}
                  aria-invalid={Boolean(show("name"))}
                  aria-describedby="d-name-hint"
                  autoComplete="off"
                  className="h-10 border-line-strong bg-ink"
                />
                <p id="d-name-hint" className={cn("text-[11px] leading-snug", show("name") ? "text-danger" : "text-bone-faint")}>
                  {show("name") ?? `${name || "name"}.eclipseal.xyz`}
                </p>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="d-profile" className="text-xs text-bone-dim">TEE profile</Label>
                <Select value={profileId} onValueChange={setProfileId}>
                  <SelectTrigger id="d-profile" className="h-10 w-full border-line-strong bg-ink text-xs">
                    <SelectValue placeholder="Loading profiles" />
                  </SelectTrigger>
                  <SelectContent>
                    {(profiles ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="d-region" className="text-xs text-bone-dim">Region</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger id="d-region" className="h-10 w-full border-line-strong bg-ink text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((r) => (
                      <SelectItem key={r} value={r} className="text-xs">
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {profile && (
              <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-y border-line py-2.5 text-[11.5px] text-bone-dim">
                <span>
                  {profile.cpu}
                  {profile.gpu ? ` + ${profile.gpu}` : ""} · {profile.vcpu} vCPU · {profile.memoryGb} GB
                </span>
                <Price value={profile.pricePerHour} pct={me?.tier.discountPct} digits={3} suffix=" /hr" />
              </p>
            )}
            <div className="grid gap-2">
              <Label htmlFor="d-compose" className="text-xs text-bone-dim">docker-compose.yml</Label>
              <Textarea id="d-compose" value={compose} onChange={(e) => setCompose(e.target.value)} rows={9} aria-invalid={Boolean(show("compose"))} className="border-line-strong bg-ink text-xs leading-5" />
              {show("compose") && <p className="text-[11px] text-danger">{show("compose")}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="d-env" className="text-xs text-bone-dim">Encrypted env, one KEY=value per line</Label>
              <Textarea id="d-env" value={envText} onChange={(e) => setEnvText(e.target.value)} rows={3} aria-invalid={Boolean(show("env"))} className="border-line-strong bg-ink text-xs leading-5" />
              {show("env") && <p className="text-[11px] text-danger">{show("env")}</p>}
            </div>
            {me && (
              <p className={cn("text-[11.5px]", atLimit ? "text-danger" : "text-bone-dim")}>
                {atLimit ? (
                  <>
                    Your {me.tier.label} pass runs {me.tier.maxWorkloads} workload{me.tier.maxWorkloads === 1 ? "" : "s"} and all are in use. Delete one, or{" "}
                    <Link href="/dashboard/pass" className="text-bone underline underline-offset-4">
                      raise the limit
                    </Link>
                    .
                  </>
                ) : (
                  `${me.usage.workloads} of ${me.tier.maxWorkloads} workloads used on your ${me.tier.label} pass.`
                )}
              </p>
            )}
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={busy || atLimit} className={primaryButton} style={{ "--cut": "9px" } as CSSProperties}>
              <RocketLaunchIcon className="size-4" /> {busy ? "Submitting" : "Deploy to enclave"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Actions a viewer may take: demo workloads only accept a fresh quote. */
function WorkloadMenu({ cvm, mine, onOpen, onAct, onDelete }: { cvm: Cvm; mine: boolean; onOpen: () => void; onAct: (c: Cvm, a: Action) => void; onDelete: (c: Cvm) => void }) {
  const can = (a: Action) => cvm.allowedActions.includes(a);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Actions for ${cvm.name}`} className="grid size-9 shrink-0 place-items-center text-bone-dim hover:text-bone">
          <DotsThreeVerticalIcon className="size-4" weight="bold" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 font-mono text-xs">
        <DropdownMenuItem onSelect={onOpen}>View details</DropdownMenuItem>
        <DropdownMenuItem disabled={!can("attest")} onSelect={() => onAct(cvm, "attest")}>
          Attest now
        </DropdownMenuItem>
        {mine ? (
          <>
            {can("start") && <DropdownMenuItem onSelect={() => onAct(cvm, "start")}>Start</DropdownMenuItem>}
            <DropdownMenuItem disabled={!can("stop")} onSelect={() => onAct(cvm, "stop")}>
              Stop
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!can("restart")} onSelect={() => onAct(cvm, "restart")}>
              Restart
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDelete(cvm)}>
              Delete
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuLabel className="text-[11px] leading-snug font-normal text-bone-faint">Demo workload. Deploy your own to start, stop or delete.</DropdownMenuLabel>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function CvmSheet({
  id,
  viewer,
  onClose,
  onAct,
  onDelete,
}: {
  id: string | null;
  viewer: string | null;
  onClose: () => void;
  onAct: (c: Cvm, a: Action) => void;
  onDelete: (c: Cvm) => void;
}) {
  const token = useSessionToken();
  const [loaded, setLoaded] = useState<Cvm | null>(null);
  const [fetched, setFetched] = useState<AttestationReport | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  // Only ever show the workload that is open, never the previous one while the next loads.
  // Links may name a workload by id or by name; the API resolves both.
  const cvm = loaded && (loaded.id === id || loaded.name === id) ? loaded : null;
  const report = fetched && cvm && fetched.subject.id === cvm.id ? fetched : null;
  const mine = Boolean(cvm?.owner && cvm.owner === viewer);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = () =>
      api<Cvm>(`/api/cvms/${id}`)
        .then((c) => alive && setLoaded(c))
        .catch((err) => {
          if (!alive || !(err instanceof ApiError) || err.status !== 404) return;
          alive = false;
          toast("That workload is gone or belongs to another wallet.");
          close.current();
        });
    void load();
    const timer = setInterval(load, 1200);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [id, token]);

  useEffect(() => {
    if (cvm?.lastAttestationId && fetched?.id !== cvm.lastAttestationId) {
      void api<AttestationReport>(`/api/attestations/${cvm.lastAttestationId}`).then(setFetched).catch(() => undefined);
    }
  }, [cvm?.lastAttestationId, fetched?.id]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "nearest" });
  }, [cvm?.logs?.length]);

  const can = (a: Action) => Boolean(cvm?.allowedActions.includes(a));
  const smallButton = "inline-flex h-9 items-center border border-line-strong px-3 text-[11px] tracking-wider text-bone uppercase transition-colors hover:border-bone/60 disabled:opacity-40";

  return (
    <Sheet open={Boolean(id)} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="overflow-y-auto border-line-strong bg-ink-2 p-0 font-mono data-[side=right]:w-full data-[side=right]:sm:max-w-xl" data-lenis-prevent>
        <SheetHeader className="border-b border-line p-5 pr-12">
          <SheetTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="break-all">{cvm?.name ?? "Loading"}</span>
            {cvm && <Tag tone={statusTone(cvm.status)}>{statusLabel(cvm)}</Tag>}
            {cvm && <OwnerTag owner={cvm.owner} viewer={viewer} />}
          </SheetTitle>
          <SheetDescription className="text-xs break-all">{cvm ? `https://${cvm.url}` : " "}</SheetDescription>
          {cvm && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={!can("attest")} onClick={() => onAct(cvm, "attest")} className={smallButton}>
                Attest now
              </button>
              {mine && (
                <>
                  {can("start") ? (
                    <button type="button" onClick={() => onAct(cvm, "start")} className={smallButton}>
                      Start
                    </button>
                  ) : (
                    <button type="button" disabled={!can("stop")} onClick={() => onAct(cvm, "stop")} className={smallButton}>
                      Stop
                    </button>
                  )}
                  <button type="button" disabled={!can("restart")} onClick={() => onAct(cvm, "restart")} className={smallButton}>
                    Restart
                  </button>
                  <button type="button" onClick={() => onDelete(cvm)} className={cn(smallButton, "border-danger/50 text-danger hover:border-danger")}>
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
          {cvm && !mine && <p className="mt-2 text-[11px] text-bone-faint">Demo workload: anyone can request a quote, only owners can change it.</p>}
        </SheetHeader>
        {cvm ? (
          <div className="space-y-6 p-5">
            <div>
              <p className="micro mb-2 text-bone-faint">Deployment log</p>
              <div className="max-h-64 overflow-y-auto border border-line bg-ink p-3 text-[11.5px] leading-6" data-lenis-prevent>
                {(cvm.logs ?? []).map((l, i) => (
                  <p key={i} className={cn("break-words", l.line.startsWith("$") ? "text-ember" : l.line.startsWith("cvm ready") ? "text-signal" : "text-bone/80")}>
                    <span className="mr-3 text-bone-faint">{clock(l.t)}</span>
                    {l.line}
                  </p>
                ))}
                {cvm.status === "provisioning" && <span className="animate-blink inline-block h-3.5 w-2 bg-ember align-middle" />}
                <div ref={logEnd} />
              </div>
            </div>
            <div>
              <p className="micro mb-2 text-bone-faint">Measured compose</p>
              <pre className="max-h-48 overflow-auto border border-line bg-ink p-3 text-[11px] leading-5 text-bone/80">{cvm.compose}</pre>
            </div>
            {report ? (
              <div>
                <p className="micro mb-2 text-bone-faint">Latest attestation</p>
                <ReportVerifier report={report} />
              </div>
            ) : (
              <p className="text-xs text-bone-dim">
                {cvm.status === "provisioning" ? "The attestation report appears as soon as the enclave finishes booting." : cvm.status === "running" ? "Loading the latest quote." : "No quote while the workload is stopped."}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3 p-5">
            <Skeleton className="h-40" />
            <Skeleton className="h-32" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function AgentsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const holder = useHolder();
  const viewer = holder.address;
  const { data: cvms, error, reload } = useApi<Cvm[]>("/api/cvms", 3000);
  const [deployOpen, setDeployOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Cvm | null>(null);
  const deletingShown = useSticky(deleting);
  const [handledLink, setHandledLink] = useState("");

  // Deep links (?deploy=1 from the overview, ?open=<id> from search) are handled once, then cleared.
  const link = params.toString();
  if (link !== handledLink) {
    setHandledLink(link);
    if (params.has("deploy")) setDeployOpen(true);
    const target = params.get("open");
    if (target) setOpenId(target);
  }
  useEffect(() => {
    if (link) router.replace(pathname, { scroll: false });
  }, [link, pathname, router]);

  const closeSheet = useCallback(() => setOpenId(null), []);

  async function act(cvm: Cvm, action: Action) {
    try {
      await api(`/api/cvms/${cvm.id}/actions`, { method: "POST", json: { action } });
      toast.success(action === "attest" ? `Fresh quote issued for ${cvm.name}` : `${cvm.name}: ${action} requested`);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function remove(cvm: Cvm) {
    try {
      await api(`/api/cvms/${cvm.id}`, { method: "DELETE" });
      toast.success(`${cvm.name} deleted`);
      if (openId === cvm.id || openId === cvm.name) setOpenId(null);
      reload();
      void holder.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      return false;
    }
  }

  const mine = (c: Cvm) => Boolean(c.owner && c.owner === viewer);
  const ownedCount = cvms?.filter(mine).length ?? 0;

  return (
    <>
      <PageHeader
        title="Agent sandbox"
        sub="Confidential VMs for agents and services. Each workload boots from a measured image, receives sealed env and publishes a quote you can verify."
        action={
          <button type="button" onClick={() => setDeployOpen(true)} className={primaryButton} style={{ "--cut": "9px" } as CSSProperties}>
            <RocketLaunchIcon className="size-4" /> Deploy workload
          </button>
        }
      />
      <HudPanel
        title={`Workloads ${cvms ? `(${cvms.length})` : ""}`}
        action={viewer && cvms ? <span className="text-[10.5px] tracking-wider text-bone-dim uppercase">{ownedCount} yours</span> : undefined}
      >
        {error && !cvms ? (
          <p className="py-8 text-center text-sm text-danger">{error.message}</p>
        ) : !cvms ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-11" />
            ))}
          </div>
        ) : cvms.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-bone">No workloads yet.</p>
            <p className="mt-1 text-xs text-bone-dim">Deploy a docker-compose file to boot your first enclave.</p>
          </div>
        ) : (
          <>
            {/* Phones: one card per workload. */}
            <ul className="grid gap-2 md:hidden">
              {cvms.map((c) => (
                <li key={c.id} className="border border-line bg-ink-3/40">
                  <div className="flex items-start gap-2 p-3 pb-2">
                    <button type="button" onClick={() => setOpenId(c.id)} className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[13px] text-bone">{c.name}</span>
                      <span className="block truncate text-[11px] text-bone-faint">{c.url}</span>
                    </button>
                    <WorkloadMenu cvm={c} mine={mine(c)} onOpen={() => setOpenId(c.id)} onAct={act} onDelete={setDeleting} />
                  </div>
                  <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                    <Tag tone={statusTone(c.status)}>{statusLabel(c)}</Tag>
                    <OwnerTag owner={c.owner} viewer={viewer} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line px-3 py-2.5 text-[11px]">
                    <div className="min-w-0">
                      <dt className="text-bone-faint">TEE</dt>
                      <dd className="truncate text-bone/85">{teeLabel(c)}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-bone-faint">Region</dt>
                      <dd className="truncate text-bone/85">{c.region}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-bone-faint">Price</dt>
                      <dd>
                        <Price value={c.pricePerHour} pct={c.discountPct} digits={3} suffix=" /hr" />
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-bone-faint">Updated</dt>
                      <dd className="text-bone/85">{ago(c.updatedAt)}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>

            <Table className="hidden text-[12px] md:table">
              <TableHeader>
                <TableRow className="border-line hover:bg-transparent">
                  {["Workload", "Status", "TEE", "Region"].map((h) => (
                    <TableHead key={h} className="text-[10.5px] tracking-wider text-bone-faint uppercase">
                      {h}
                    </TableHead>
                  ))}
                  <TableHead className="text-right text-[10.5px] tracking-wider text-bone-faint uppercase">$/hr</TableHead>
                  <TableHead className="text-[10.5px] tracking-wider text-bone-faint uppercase">Updated</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {cvms.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer border-line hover:bg-ink-3/60" onClick={() => setOpenId(c.id)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={(e) => (e.stopPropagation(), setOpenId(c.id))} className="text-left text-bone hover:text-ember">
                          {c.name}
                        </button>
                        <OwnerTag owner={c.owner} viewer={viewer} />
                      </div>
                      <p className="text-[11px] text-bone-faint">{c.url}</p>
                    </TableCell>
                    <TableCell>
                      <Tag tone={statusTone(c.status)}>{statusLabel(c)}</Tag>
                    </TableCell>
                    <TableCell className="text-bone/80">{teeLabel(c)}</TableCell>
                    <TableCell className="text-bone/80">{c.region}</TableCell>
                    <TableCell className="text-right">
                      <Price value={c.pricePerHour} pct={c.discountPct} digits={3} />
                    </TableCell>
                    <TableCell className="text-bone-dim">{ago(c.updatedAt)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <WorkloadMenu cvm={c} mine={mine(c)} onOpen={() => setOpenId(c.id)} onAct={act} onDelete={setDeleting} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </HudPanel>
      <DeployDialog
        open={deployOpen}
        onOpenChange={setDeployOpen}
        onDeployed={(c) => {
          reload();
          setOpenId(c.id);
        }}
      />
      <CvmSheet id={openId} viewer={viewer} onClose={closeSheet} onAct={act} onDelete={setDeleting} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={`Delete ${deletingShown?.name ?? "workload"}?`}
        body={
          <>
            The enclave is torn down and its {deletingShown?.envKeys.length ?? 0} sealed env key{deletingShown?.envKeys.length === 1 ? " is" : "s are"} destroyed with it. Past quotes stay verifiable. This cannot be undone.
          </>
        }
        confirmLabel="Delete workload"
        onConfirm={() => (deleting ? remove(deleting) : Promise.resolve(true))}
      />
    </>
  );
}
