"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { GraphicsCardIcon, MinusIcon, PlusIcon, SealCheckIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HudPanel, Tag, statusTone } from "./hud";
import { PageHeader, primaryButton } from "./page-header";
import { ConfirmDialog } from "./confirm-dialog";
import { OwnerTag, Price, SignInGate } from "./holder-ui";
import { api, type GpuJob, type GpuOffer } from "@/lib/api";
import { useApi, useSticky } from "@/lib/hooks";
import { useHolder } from "@/lib/wallet";
import { ago, usd } from "@/lib/format";
import { cn } from "@/lib/utils";

const hourPresets = [1, 2, 6, 12, 24];

/** Live log line while a job runs; afterwards the image identifies it better than its last log. */
const jobLine = (j: GpuJob) => (j.status === "running" || j.status === "queued" ? (j.lastLog?.line ?? j.image) : j.image);

function LaunchDialog({ offer, onClose, onLaunched }: { offer: GpuOffer | null; onClose: () => void; onLaunched: () => void }) {
  const holder = useHolder();
  // Keeps the offer on screen while the dialog animates closed.
  const shown = useSticky(offer);
  const me = holder.me;
  const [name, setName] = useState("finetune-private-set");
  const [count, setCount] = useState(1);
  const [hoursText, setHoursText] = useState("2");
  const [image, setImage] = useState("ghcr.io/eclipseal-labs/axolotl:0.9");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tierMax = me?.tier.maxGpusPerJob ?? 8;
  const maxCount = Math.max(0, Math.min(8, shown?.available ?? 0, tierMax));
  const gpus = Math.min(Math.max(1, count), Math.max(1, maxCount));
  const hours = Number(hoursText);
  const problems = {
    name: !/^[a-z0-9-]{3,40}$/.test(name) ? "3 to 40 lowercase letters, numbers or dashes." : null,
    image: image.trim().length < 3 ? "Enter the container image to pull." : null,
    hours: !Number.isFinite(hours) || hours < 0.5 || hours > 168 ? "Between 0.5 and 168 hours." : null,
  };
  const invalid = Boolean(problems.name || problems.image || problems.hours) || maxCount < 1;
  const listCost = shown && !problems.hours ? shown.pricePerGpuHour * gpus * hours : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!shown || invalid) return;
    setBusy(true);
    setError(null);
    try {
      await api<GpuJob>("/api/gpu/jobs", { method: "POST", json: { name, offerId: shown.id, count: gpus, image: image.trim(), hours } });
      toast.success(`${name} queued on ${gpus}x ${shown.gpu}`);
      onLaunched();
      onClose();
      void holder.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Launch failed.");
    } finally {
      setBusy(false);
    }
  }

  const stepper = "grid size-10 place-items-center border border-line-strong bg-ink text-bone transition-colors hover:border-bone/60 disabled:opacity-30";

  return (
    <Dialog open={Boolean(offer)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-line-strong bg-ink-2 font-mono sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm tracking-[0.14em] uppercase">
            Launch on {shown?.gpu} · {shown?.region}
          </DialogTitle>
          <DialogDescription className="text-xs text-bone-dim">The GPU is attested in confidential mode before your image is pulled.</DialogDescription>
        </DialogHeader>
        {!holder.address ? (
          <SignInGate action="launch a GPU job" />
        ) : (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <div className="grid gap-2">
              <Label htmlFor="g-name" className="text-xs text-bone-dim">Job name</Label>
              <Input id="g-name" value={name} onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, "-"))} aria-invalid={Boolean(problems.name)} autoComplete="off" className="h-10 border-line-strong bg-ink" />
              {problems.name && <p className="text-[11px] text-danger">{problems.name}</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="g-image" className="text-xs text-bone-dim">Container image</Label>
              <Input id="g-image" value={image} onChange={(e) => setImage(e.target.value)} aria-invalid={Boolean(problems.image)} autoComplete="off" className="h-10 border-line-strong bg-ink" />
              {problems.image && <p className="text-[11px] text-danger">{problems.image}</p>}
            </div>
            <div className="grid gap-2">
              <p className="text-xs text-bone-dim" id="g-count-label">GPUs</p>
              <div className="flex items-center gap-2" role="group" aria-labelledby="g-count-label">
                <button type="button" aria-label="One GPU fewer" disabled={gpus <= 1} onClick={() => setCount(gpus - 1)} className={stepper}>
                  <MinusIcon className="size-4" />
                </button>
                <output aria-live="polite" className="grid h-10 w-14 place-items-center border border-line-strong font-heading text-lg font-semibold tabular-nums">
                  {maxCount < 1 ? 0 : gpus}
                </output>
                <button type="button" aria-label="One GPU more" disabled={gpus >= maxCount} onClick={() => setCount(gpus + 1)} className={stepper}>
                  <PlusIcon className="size-4" />
                </button>
                <p className="ml-1 text-[11px] leading-snug text-bone-faint">
                  {maxCount < 1
                    ? "None free in this region right now."
                    : tierMax < Math.min(8, shown?.available ?? 0)
                      ? `Your ${me?.tier.label ?? ""} pass allows ${tierMax} per job.`
                      : `${shown?.available} free here.`}
                </p>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="g-hours" className="text-xs text-bone-dim">Hours</Label>
              <div className="flex flex-wrap gap-1.5">
                {hourPresets.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHoursText(String(h))}
                    className={cn("h-9 min-w-11 border px-2.5 text-xs tabular-nums transition-colors", hours === h ? "border-ember text-ember" : "border-line-strong text-bone-dim hover:text-bone")}
                  >
                    {h}h
                  </button>
                ))}
                <Input
                  id="g-hours"
                  inputMode="decimal"
                  value={hoursText}
                  onChange={(e) => setHoursText(e.target.value.replace(/[^0-9.]/g, ""))}
                  aria-invalid={Boolean(problems.hours)}
                  aria-label="Custom hours"
                  className="h-9 w-20 border-line-strong bg-ink text-xs"
                />
              </div>
              {problems.hours && <p className="text-[11px] text-danger">{problems.hours}</p>}
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3 text-xs text-bone-dim">
              <span>
                Estimated cost
                {me?.tier.discountPct ? <span className="block text-[11px] text-ember">{me.tier.label}: {me.tier.discountPct}% off</span> : null}
              </span>
              <span className="font-heading text-2xl font-semibold [font-stretch:110%]">
                <Price value={listCost} pct={me?.tier.discountPct} />
              </span>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={busy || invalid} className={primaryButton} style={{ "--cut": "9px" } as CSSProperties}>
              {busy ? "Queuing" : "Launch sealed job"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function JobActions({ job, mine, onCancel }: { job: GpuJob; mine: boolean; onCancel: (j: GpuJob) => void }) {
  return (
    <div className="flex items-center justify-end gap-3">
      {job.attestationId && (
        <Link href={`/dashboard/attestations?id=${job.attestationId}`} className="inline-flex items-center gap-1 text-[11px] tracking-wider text-bone-dim uppercase hover:text-bone">
          <SealCheckIcon className="size-3.5" /> Quote
        </Link>
      )}
      {mine && (job.status === "running" || job.status === "queued") && (
        <button type="button" onClick={() => onCancel(job)} className="text-[11px] tracking-wider text-bone-dim uppercase hover:text-danger">
          Cancel
        </button>
      )}
    </div>
  );
}

export function GpuView() {
  const holder = useHolder();
  const viewer = holder.address;
  const { data: offers, reload: reloadOffers } = useApi<GpuOffer[]>("/api/gpu/offers", 5000);
  const { data: jobs, reload } = useApi<GpuJob[]>("/api/gpu/jobs", 2500);
  const [offer, setOffer] = useState<GpuOffer | null>(null);
  const [cancelling, setCancelling] = useState<GpuJob | null>(null);
  const cancellingShown = useSticky(cancelling);
  const mine = (j: GpuJob) => Boolean(j.owner && j.owner === viewer);

  async function cancel(job: GpuJob) {
    try {
      await api(`/api/gpu/jobs/${job.id}/cancel`, { method: "POST" });
      toast.success(`${job.name} cancelled`);
      reload();
      reloadOffers();
      void holder.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed");
      return false;
    }
  }

  return (
    <>
      <PageHeader title="GPU market" sub="H100, H200 and B300 capacity with NVIDIA confidential computing on. Data, weights and checkpoints stay encrypted outside the GPU." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {(offers ?? Array.from({ length: 5 }, () => null)).map((o, i) =>
          o ? (
            <HudPanel key={o.id} bodyClassName="flex h-full flex-col gap-3 p-5">
              <div className="flex items-start justify-between">
                <p className="font-heading text-4xl font-semibold [font-stretch:115%]">{o.gpu}</p>
                <GraphicsCardIcon className="size-6 text-bone-faint" />
              </div>
              <p className="text-[11.5px] text-bone-dim">
                {o.vramGb} GB · {o.vcpu} vCPU · {o.region}
              </p>
              <Tag tone="cobalt" className="self-start">
                {o.tee}
              </Tag>
              <p className="mt-auto font-heading text-2xl font-semibold [font-stretch:110%]">
                {holder.me?.tier.discountPct ? usd((o.pricePerGpuHour * (100 - holder.me.tier.discountPct)) / 100) : usd(o.pricePerGpuHour)}
                <span className="ml-1 font-mono text-[11px] font-normal text-bone-dim">/GPU/hr</span>
              </p>
              <div>
                <div className="flex justify-between text-[11px]">
                  <span className={o.available ? "text-bone-faint" : "text-danger"}>{o.available ? `${o.available} of ${o.capacity} free` : "Fully booked"}</span>
                  {holder.me?.tier.discountPct ? <span className="text-ember">−{holder.me.tier.discountPct}%</span> : null}
                </div>
                <div className="mt-1.5 h-px bg-line">
                  <div className="h-px bg-cobalt-soft" style={{ width: `${o.capacity ? (o.available / o.capacity) * 100 : 0}%` }} />
                </div>
              </div>
              <button type="button" disabled={!o.available} onClick={() => setOffer(o)} className={primaryButton} style={{ "--cut": "9px" } as CSSProperties}>
                {o.available ? "Launch" : "No capacity"}
              </button>
            </HudPanel>
          ) : (
            <Skeleton key={i} className="h-64" />
          ),
        )}
      </div>
      <HudPanel title="Jobs" className="mt-4">
        {!jobs ? (
          <Skeleton className="h-40" />
        ) : jobs.length === 0 ? (
          <p className="py-10 text-center text-sm text-bone-dim">No jobs yet. Pick an offer above to launch one.</p>
        ) : (
          <>
            <ul className="grid gap-2 md:hidden">
              {jobs.map((j) => (
                <li key={j.id} className="border border-line bg-ink-3/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] text-bone">{j.name}</p>
                      <p className="truncate text-[11px] text-bone-faint">{jobLine(j)}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-bone-dim">{j.count}x {j.gpu}</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <Tag tone={statusTone(j.status)}>{j.status}</Tag>
                    <OwnerTag owner={j.owner} viewer={viewer} />
                    <span className="ml-auto text-[11px] text-bone-dim">{ago(j.createdAt)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Progress value={Math.round(j.progress * 100)} className="h-1 bg-line [&>div]:bg-ember" />
                    <span className="w-9 text-right text-[11px] text-bone-dim tabular-nums">{Math.round(j.progress * 100)}%</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-2.5 text-[11.5px]">
                    <Price value={j.listCost ?? j.costEstimate} pct={j.listCost ? j.discountPct : 0} />
                    <JobActions job={j} mine={mine(j)} onCancel={setCancelling} />
                  </div>
                </li>
              ))}
            </ul>
            <Table className="hidden text-[12px] md:table">
              <TableHeader>
                <TableRow className="border-line hover:bg-transparent">
                  {["Job", "Hardware", "Status", "Progress", "Estimate", "Created", ""].map((h) => (
                    <TableHead key={h} className="text-[10.5px] tracking-wider text-bone-faint uppercase">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((j) => (
                  <TableRow key={j.id} className="border-line hover:bg-ink-3/60">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-bone">{j.name}</span>
                        <OwnerTag owner={j.owner} viewer={viewer} />
                      </div>
                      <p className="max-w-[260px] truncate text-[11px] text-bone-faint">{jobLine(j)}</p>
                    </TableCell>
                    <TableCell className="text-bone/80">
                      {j.count}x {j.gpu}
                    </TableCell>
                    <TableCell>
                      <Tag tone={statusTone(j.status)}>{j.status}</Tag>
                    </TableCell>
                    <TableCell className="min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <Progress value={Math.round(j.progress * 100)} className="h-1 bg-line [&>div]:bg-ember" />
                        <span className="w-9 text-right text-bone-dim tabular-nums">{Math.round(j.progress * 100)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Price value={j.listCost ?? j.costEstimate} pct={j.listCost ? j.discountPct : 0} />
                    </TableCell>
                    <TableCell className="text-bone-dim">{ago(j.createdAt)}</TableCell>
                    <TableCell>
                      <JobActions job={j} mine={mine(j)} onCancel={setCancelling} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </HudPanel>
      <LaunchDialog
        offer={offer}
        onClose={() => setOffer(null)}
        onLaunched={() => {
          reload();
          reloadOffers();
        }}
      />
      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(v) => !v && setCancelling(null)}
        title={`Cancel ${cancellingShown?.name ?? "job"}?`}
        body="The job stops now and its GPU memory is scrubbed. Progress that was not checkpointed is lost."
        confirmLabel="Cancel job"
        dismissLabel="Keep running"
        onConfirm={() => (cancelling ? cancel(cancelling) : Promise.resolve(true))}
      />
    </>
  );
}
