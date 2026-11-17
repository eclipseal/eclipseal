"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import {
  ArrowSquareOutIcon,
  CpuIcon,
  GraphicsCardIcon,
  IdentificationCardIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RocketLaunchIcon,
  SealCheckIcon,
  StackIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Brackets, HudPanel, Kpi, Row, Tag, statusTone } from "./hud";
import { ChordRing, HistoryBars, Sparkline } from "./charts";
import { ReportVerifier } from "./report-view";
import { describeEvent } from "./event-text";
import { balanceLabel, Meter } from "./holder-ui";
import { primaryButton } from "./page-header";
import type { Callout } from "./enclave-core";
import { useApi, useEvents, useInView, usePrefersReducedMotion } from "@/lib/hooks";
import type { AttestationReport, Cvm, NetworkStats } from "@/lib/api";
import { useHolder } from "@/lib/wallet";
import { ago, clock, compact, num, short } from "@/lib/format";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const EnclaveCore = dynamic(() => import("./enclave-core"), { ssr: false, loading: () => <Skeleton className="absolute inset-0" /> });

const actions = [
  { href: "/dashboard/agents?deploy=1", icon: RocketLaunchIcon, title: "Deploy agent", body: "Ship a docker-compose into a TDX enclave" },
  { href: "/dashboard/models", icon: CpuIcon, title: "Private inference", body: "Signed answers from sealed models" },
  { href: "/dashboard/gpu", icon: GraphicsCardIcon, title: "Launch GPU job", body: "H100, H200, B300 in CC mode" },
  { href: "/dashboard/attestations", icon: SealCheckIcon, title: "Verify a quote", body: "Check measurements and signature" },
];

/** The holder's entry point on the map: sign in, or see tier and limits at a glance. */
function HolderCard({ className }: { className?: string }) {
  const holder = useHolder();
  const { me } = holder;

  if (!holder.address) {
    return (
      <HudPanel
        title="Holder pass"
        action={<IdentificationCardIcon className="size-4 text-ember" />}
        className={cn("flex flex-1 flex-col", className)}
        bodyClassName="flex flex-1 flex-col justify-between"
      >
        <div>
          <p className="text-[12px] leading-relaxed text-bone-dim">
            Hold $ECLS and sign in with the same wallet: a private workspace, lower compute prices and your own API key.
          </p>
          <ul className="mt-3.5 space-y-2 border-t border-line pt-3 text-[11px] text-bone/85">
            <li className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 bg-signal" />
              <span>Zero-leak confidential VM enclaves</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 bg-ember" />
              <span>Hardware quote verified on Robinhood Chain</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 bg-cobalt-soft" />
              <span>Up to 8 GPUs & private LLM API keys</span>
            </li>
          </ul>
        </div>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            disabled={!holder.mounted || Boolean(holder.busy)}
            onClick={() => void holder.signIn()}
            className={primaryButton}
            style={{ "--cut": "9px" } as CSSProperties}
          >
            {holder.busy ? "Check your wallet" : "Connect wallet"}
          </button>
          <Link href="/dashboard/pass" className="py-1 text-center text-[10.5px] tracking-wider text-bone-dim uppercase hover:text-bone">
            See tiers and perks
          </Link>
        </div>
      </HudPanel>
    );
  }

  return (
    <HudPanel
      title="Holder pass"
      action={
        <Link href="/dashboard/pass" className="text-[10.5px] tracking-wider text-bone-dim uppercase hover:text-bone">
          Open
        </Link>
      }
      className={cn("flex flex-1 flex-col", className)}
      bodyClassName="flex flex-1 flex-col justify-between"
    >
      {me ? (
        <>
          <div>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="micro text-bone-faint">Tier</p>
                <p className="mt-1 font-heading text-[24px] leading-none font-semibold text-ember uppercase [font-stretch:112%]">{me.tier.label}</p>
              </div>
              <p className="font-mono text-[11px] text-bone-dim">{balanceLabel(me)}</p>
            </div>
            <div className="mt-4 space-y-3">
              <Meter label="Workloads" value={me.usage.workloads} max={me.tier.maxWorkloads} />
              <Meter label="LLM requests today" value={me.usage.llmRequestsToday} max={me.tier.llmRequestsPerDay} />
            </div>
          </div>
          <div className="mt-4 border-t border-line pt-2.5 text-[11px] text-bone-dim">
            {me.tier.discountPct ? `${me.tier.discountPct}% off compute` : "List prices"} · up to {me.tier.maxGpusPerJob} GPU{me.tier.maxGpusPerJob === 1 ? "" : "s"} per job
          </div>
        </>
      ) : (
        <Skeleton className="h-36" />
      )}
    </HudPanel>
  );
}

export function Overview() {
  const { data: net, error: netError } = useApi<NetworkStats>("/api/network", 5000);
  const { data: cvms } = useApi<Cvm[]>("/api/cvms", 4000);
  const { data: reports } = useApi<AttestationReport[]>("/api/attestations?limit=30", 5000);
  const { events, connected } = useEvents(undefined, 40);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [range, setRange] = useState("14");
  const [zoom, setZoom] = useState(1);
  // The spine turns by default; with reduced motion it starts still until the visitor presses play.
  const reduced = usePrefersReducedMotion();
  const [spinChoice, setSpin] = useState<boolean | null>(null);
  const spin = spinChoice ?? !reduced;
  const [showCallouts, setShowCallouts] = useState(true);
  const [dialog, setDialog] = useState<{ open: boolean; report: AttestationReport | null }>({ open: false, report: null });
  const [coreRef, coreInView] = useInView<HTMLDivElement>("80px", true);

  const selected = useMemo(() => cvms?.find((c) => c.id === selectedId) ?? cvms?.find((c) => c.status === "running") ?? cvms?.[0], [cvms, selectedId]);
  // The quote panel, callouts and dialog all describe the selected workload's own latest quote.
  const { data: fetchedQuote } = useApi<AttestationReport>(selected?.lastAttestationId ? `/api/attestations/${selected.lastAttestationId}` : null);
  const quote = fetchedQuote && selected && fetchedQuote.subject.id === selected.id ? fetchedQuote : null;
  const history = net?.history.slice(-Number(range)) ?? [];
  const todayStat = net?.history.at(-1);
  const avgAtt = net ? Math.round(net.history.slice(-8, -1).reduce((s, h) => s + h.attestations, 0) / 7) : 0;

  const cpuTrail = selected?.telemetry.trail ?? [];

  const quoteGaps = useMemo(() => {
    const times = (reports ?? []).map((r) => Date.parse(r.issuedAt)).sort((a, b) => a - b);
    return times.slice(1).map((t, i) => (t - times[i]) / 1000);
  }, [reports]);

  const callouts: Callout[] = quote
    ? [
        { id: "MRTD-01", label: "OS image", detail: short(quote.measurements.mrtd, 10, 6), status: "Verified", tone: "signal" },
        { id: "RTMR-3", label: "Workload compose", detail: short(quote.composeHash, 10, 6), status: "Measured", tone: "ember" },
        {
          id: quote.tee.gpu ? "GPU-CC" : "TDX-QE",
          label: quote.tee.gpu ?? "Quoting enclave",
          detail: short(quote.reportData, 10, 6),
          status: quote.tee.gpu ? "CC on" : "Signed",
          tone: "cobalt",
        },
      ]
    : [];

  const composition: [string, number][] = net
    ? [
        ["CPU TEE", net.composition.cpuTee],
        ["GPU TEE", net.composition.gpuTee],
        ["Models", net.composition.models],
      ]
    : [];
  const compositionMax = Math.max(1, ...composition.map(([, v]) => v));

  const offline = Boolean(netError) && !net;

  return (
    <div className="space-y-4">
      {offline && (
        <div className="flex items-center gap-3 border border-danger/40 bg-danger/5 p-4 text-sm text-danger">
          <WarningIcon className="size-5 shrink-0" /> Control plane unreachable. Start it with <code className="font-mono">npm run dev</code> in the project root, then this view reconnects on its own.
        </div>
      )}

      {/* Top Page Header */}
      <div className="flex flex-col gap-3 px-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-[28px] leading-none font-semibold tracking-tight uppercase [font-stretch:112%] md:text-[34px]">
              ENCLAVE MAP
            </h1>
            <Tag tone={connected ? "cobalt" : "danger"}>{connected ? "Active sync" : "Stream offline"}</Tag>
          </div>
          <p className="mt-1.5 text-[11px] tracking-[0.14em] text-bone-dim uppercase">
            Cluster ECLS-01 · {net?.mode ?? "devnet"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {quote && (
            <Tag tone="ember">
              TCB: {quote.tee.tcbStatus === "UpToDate" ? "Up to date" : "Out of date"}
            </Tag>
          )}
          {net && (
            <span className="hidden font-mono text-[11px] text-bone-dim sm:inline-block">
              Chain block #{net.chain.live && net.chain.blockNumber ? num(net.chain.blockNumber) : "..."}
            </span>
          )}
        </div>
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2.8fr)_minmax(0,3.2fr)_minmax(0,3.6fr)_minmax(0,4.4fr)]">
        {/* column 1 */}
        <div className="flex h-full flex-col gap-4">
          <HudPanel title="Proof analytics" action={<StackIcon className="size-4 text-bone-faint" />}>
            {net ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 py-2">
                <Kpi label="Attestations today" value={num(net.totals.attestationsToday)} hint={`7d avg ${num(avgAtt)}`} />
                <Kpi label="Running enclaves" value={`${net.totals.running}/${net.totals.workloads}`} hint={`${net.totals.gpuJobsActive} GPU jobs live`} />
                <Kpi label="GPU hours, 30d" value={compact(net.totals.gpuHours30d)} />
                <Kpi label="Sealed tokens, 30d" value={`${compact(net.totals.tokensM30d * 1e6)}`} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-6 py-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            )}
            <div className="mt-5 space-y-2">
              {actions.map((a) => (
                <Link
                  key={a.title}
                  href={a.href}
                  className="chamfer group flex items-center justify-between gap-3 border border-line bg-ink-3/60 px-3 py-2.5 transition-colors hover:border-bone/40 hover:bg-ink-3"
                  style={{ "--cut": "8px" } as CSSProperties}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <a.icon className="size-5 shrink-0 text-bone-dim transition-colors group-hover:text-ember" />
                    <span className="min-w-0">
                      <span className="block text-[11.5px] tracking-[0.1em] text-bone uppercase">{a.title}</span>
                      <span className="line-clamp-2 block text-[11px] leading-snug text-bone-faint">{a.body}</span>
                    </span>
                  </div>
                  <ArrowSquareOutIcon className="size-3.5 shrink-0 text-bone-faint opacity-0 transition-opacity group-hover:text-ember group-hover:opacity-100" />
                </Link>
              ))}
            </div>
          </HudPanel>

          <HolderCard />
        </div>

        {/* column 2 */}
        <div className="flex h-full flex-col gap-4">
          <HudPanel title="Workload data" action={quote && <Tag tone="ember">TCB: {quote.tee.tcbStatus === "UpToDate" ? "up to date" : "out of date"}</Tag>}>
            {selected ? (
              <>
                <p className="font-mono text-[11px] text-cobalt-soft">{selected.id.toUpperCase()}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate font-sans text-2xl font-semibold text-bone">{selected.name}</p>
                  <Select value={selected.id} onValueChange={setSelectedId}>
                    <SelectTrigger aria-label="Select workload" className="h-8 w-auto shrink-0 gap-1 border-line-strong bg-ink px-2 text-[11px]">
                      <SelectValue placeholder="Switch" />
                    </SelectTrigger>
                    <SelectContent>
                      {cvms?.map((c) => (
                        <SelectItem key={c.id} value={c.id} className="font-mono text-xs">
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Tag tone={statusTone(selected.status)}>{selected.status}</Tag>
                  <Tag>{selected.kind}</Tag>
                  <Tag>{selected.gpu ? "GPU TEE" : "CPU TEE"}</Tag>
                </div>
                <div className="mt-3 divide-y divide-line">
                  <Row k="Profile" v={`${selected.cpu}${selected.gpu ? ` + ${selected.gpu}` : ""}`} />
                  <Row k="Region" v={selected.region} />
                  <Row k="Endpoint" v={selected.url} mono />
                  <Row k="Compose hash" v={short(selected.composeHash, 8, 6)} mono />
                  <Row k="Sealed env" v={`${selected.envKeys.length} key${selected.envKeys.length === 1 ? "" : "s"}`} />
                  <Row k="Last quote" v={quote ? ago(quote.issuedAt) : selected.status === "running" ? "loading" : "none while stopped"} />
                </div>
                <div className="relative mt-4 h-32 overflow-hidden">
                  <Brackets />
                  <Image src="/art/art-gate.webp" alt="" fill sizes="320px" className="object-cover object-[50%_45%] opacity-80" />
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgb(10_10_11/0.35)_0_1px,transparent_1px_3px)]" aria-hidden />
                  <p className="absolute right-2 bottom-2 font-mono text-[10px] text-bone/80">
                    {selected.vcpu} vCPU · {selected.memoryGb} GB
                  </p>
                </div>
              </>
            ) : (
              <Skeleton className="h-72" />
            )}
          </HudPanel>

          <HudPanel
            title="History"
            className="flex flex-1 flex-col"
            bodyClassName="flex flex-1 flex-col justify-between"
            action={
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger aria-label="History range" className="h-8 w-auto gap-1 border-line-strong bg-ink px-2 text-[11px] uppercase">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            <div>
              <div className="mb-4 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-[10.5px] text-bone-dim">Attestations</p>
                  <p className="font-heading text-xl font-semibold [font-stretch:110%]">{todayStat ? compact(todayStat.attestations) : "n/a"}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-bone-dim">Deployments</p>
                  <p className="font-heading text-xl font-semibold [font-stretch:110%]">{todayStat?.deployments ?? "n/a"}</p>
                </div>
                <div>
                  <p className="text-[10.5px] text-bone-dim">GPU hours</p>
                  <p className="font-heading text-xl font-semibold [font-stretch:110%]">{todayStat ? compact(todayStat.gpuHours) : "n/a"}</p>
                </div>
              </div>
              {history.length ? <HistoryBars data={history} /> : <Skeleton className="h-44" />}
            </div>
            <div className="mt-3.5 flex items-center justify-between border-t border-line pt-2 text-[10.5px] font-mono text-bone-dim">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 bg-signal" /> 100% verified
              </span>
              <span>Avg quote: 1.8s</span>
              <span>Cluster load: 83%</span>
            </div>
          </HudPanel>
        </div>

        {/* column 3: the core */}
        <HudPanel className="flex h-full min-h-[580px] flex-col xl:min-h-0" bodyClassName="relative flex-1 min-h-[520px] p-0" cut={18}>
          <div ref={coreRef} className="absolute inset-0">
            <EnclaveCore callouts={callouts} zoom={zoom} spin={spin} showCallouts={showCallouts} active={coreInView} />
          </div>
          <div className="pointer-events-none absolute top-4 left-4 font-mono text-[10px] tracking-wider text-bone-faint uppercase">
            <p>Attestation spine</p>
            <p className="text-bone-dim">{selected?.name ?? "loading"}</p>
          </div>
          <div className="absolute right-4 bottom-4 flex flex-col gap-2">
            <button type="button" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(1.8, z + 0.2))} className="chamfer grid size-10 place-items-center border border-line-strong bg-ink-3 text-bone transition-colors hover:border-bone hover:text-ember" style={{ "--cut": "8px" } as CSSProperties}>
              <PlusIcon className="size-4" />
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))} className="chamfer grid size-10 place-items-center border border-line-strong bg-ink-3 text-bone transition-colors hover:border-bone hover:text-ember" style={{ "--cut": "8px" } as CSSProperties}>
              <MinusIcon className="size-4" />
            </button>
          </div>
          <div className="absolute bottom-4 left-4 flex gap-2">
            <button type="button" aria-pressed={!spin} aria-label={spin ? "Pause rotation" : "Resume rotation"} onClick={() => setSpin(!spin)} className="chamfer grid size-10 place-items-center border border-line-strong bg-ink-3 text-bone transition-colors hover:border-bone hover:text-ember" style={{ "--cut": "8px" } as CSSProperties}>
              {spin ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
            </button>
            <button type="button" aria-pressed={showCallouts} aria-label="Toggle measurement callouts" onClick={() => setShowCallouts((s) => !s)} className={cn("chamfer grid size-10 place-items-center border bg-ink-3 transition-colors", showCallouts ? "border-ember/60 text-ember" : "border-line-strong text-bone hover:border-bone")} style={{ "--cut": "8px" } as CSSProperties}>
              <StackIcon className="size-4" />
            </button>
          </div>
        </HudPanel>

        {/* column 4 */}
        <div className="flex h-full flex-col gap-4">
          <HudPanel title="Attestation data" action={quote && <span className="font-mono text-[10.5px] text-bone-dim">ID <span className="text-cobalt-soft">{short(quote.id, 8, 4)}</span></span>}>
            {quote ? (
              <div className="grid grid-cols-[96px_1fr] gap-4">
                <div className="relative aspect-square">
                  <Brackets />
                  <Image src="/art/emblem-3d.webp" alt="" fill sizes="96px" className="object-cover p-1" />
                </div>
                <div className="min-w-0 divide-y divide-line">
                  <Row k="Subject" v={quote.subject.name} />
                  <Row k="Type" v={quote.subject.type} />
                  <Row k="TEE" v={quote.tee.gpu ? "TDX + CC" : quote.tee.cpu} />
                  <Row k="Issued" v={clock(quote.issuedAt)} mono />
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-3">
                  <div className="border border-line bg-ink-3/50 p-3">
                    <p className="text-[10.5px] text-bone-dim">Network quote interval</p>
                    <p className="font-heading text-xl font-semibold [font-stretch:110%]">
                      {quoteGaps.length ? `${(quoteGaps.slice(-8).reduce((s, v) => s + v, 0) / Math.min(8, quoteGaps.length)).toFixed(1)}s` : "n/a"}
                    </p>
                    <Sparkline values={quoteGaps.slice(-20)} color="var(--cobalt-soft)" />
                  </div>
                  <div className="border border-line bg-ink-3/50 p-3">
                    <p className="text-[10.5px] text-bone-dim">Enclave CPU</p>
                    <p className="font-heading text-xl font-semibold [font-stretch:110%]">{selected ? `${Math.round(selected.telemetry.cpu)}%` : "n/a"}</p>
                    <Sparkline values={cpuTrail} color="var(--ember)" />
                  </div>
                </div>
              </div>
            ) : selected && !selected.lastAttestationId ? (
              <div className="py-8 text-center">
                <p className="text-sm text-bone">No quote for {selected.name} yet</p>
                <p className="mt-1 text-xs text-bone-dim">A quote is issued as soon as the workload is running.</p>
              </div>
            ) : (
              <Skeleton className="h-56" />
            )}
          </HudPanel>

          {/* Bottom 2 subcards side-by-side matching Image 1 */}
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Card 1: Composition (Genome Analytics) */}
            <HudPanel
              title="Composition"
              className="flex flex-col h-full"
              bodyClassName="flex flex-col justify-between flex-1 p-3"
              action={<span className="font-mono text-[10px] text-bone-faint">{cvms?.length ?? 0} cvms</span>}
            >
              <div>
                <div className="py-1">
                  <ChordRing
                    nodes={(cvms ?? []).map((c) => ({ id: c.id, gpu: Boolean(c.gpu), active: c.status === "running" }))}
                    center={selected?.name ?? ""}
                  />
                </div>
                <div className="mt-2 space-y-1.5 text-[11px]">
                  {composition.map(([k, v]) => (
                    <div key={k}>
                      <div className="flex justify-between font-mono text-[10px]">
                        <span className="text-bone-dim">{k}</span>
                        <span className="tabular-nums text-bone">{v}</span>
                      </div>
                      <div className="mt-0.5 h-1 bg-ink-4">
                        <div className="h-1 bg-ember" style={{ width: `${(v / compositionMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-right font-mono text-[9.5px] text-bone-faint">All enclaves attested</p>
            </HudPanel>

            {/* Card 2: Chain anchor (DNA Analytics) with integrated View report button */}
            <HudPanel
              title="Chain anchor"
              className="flex flex-col h-full"
              bodyClassName="flex flex-col justify-between flex-1 p-3"
              action={
                <a
                  href={site.chain.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] tracking-wider text-bone-dim uppercase hover:text-bone"
                >
                  Blockscout <ArrowSquareOutIcon className="size-3" />
                </a>
              }
            >
              <div className="divide-y divide-line text-[11px]">
                <Row k="Network" v={site.chain.name} />
                <Row k="Chain id" v={String(net?.chain.chainId ?? site.chain.id)} mono />
                <Row k="Block" v={net?.chain.live && net.chain.blockNumber ? num(net.chain.blockNumber) : net ? "RPC offline" : "Connecting"} mono />
                <Row k="Gas" v={net?.chain.live && net.chain.gasPriceGwei !== null ? `${net.chain.gasPriceGwei} gwei` : "n/a"} mono />
                <Row k="Last anchor" v={quote ? short(quote.anchor.txHash, 6, 4) : "n/a"} mono />
              </div>

              <button
                type="button"
                disabled={!quote}
                onClick={() => quote && setDialog({ open: true, report: quote })}
                className="chamfer mt-3 flex h-9 w-full items-center justify-center gap-1.5 border border-line-strong bg-ink-3 px-2 text-[10.5px] font-mono tracking-wider text-bone uppercase transition-colors hover:border-ember hover:bg-ink-4 hover:text-ember disabled:opacity-50"
                style={{ "--cut": "6px" } as CSSProperties}
              >
                <SealCheckIcon className="size-3.5" /> View report
              </button>
            </HudPanel>
          </div>

          {/* The dialog keeps the report it was opened with, even as newer quotes arrive. */}
          <Dialog open={dialog.open} onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}>
            <DialogContent className="max-h-[88dvh] overflow-y-auto border-line-strong bg-ink-2 font-mono sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="pr-8 text-sm tracking-wider break-all uppercase">{dialog.report?.id}</DialogTitle>
                {dialog.report && (
                  <p className="text-xs text-bone-dim">
                    {dialog.report.subject.name} · issued {clock(dialog.report.issuedAt)} ·{" "}
                    <Link href={`/dashboard/attestations?id=${dialog.report.id}`} className="text-bone underline-offset-4 hover:underline">
                      open in Attestations
                    </Link>
                  </p>
                )}
              </DialogHeader>
              {dialog.report && <ReportVerifier report={dialog.report} />}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* event feed */}
      <HudPanel title="Live event stream" className="xl:col-span-4" action={<span className="font-mono text-[10.5px] text-bone-faint">{events.length} events</span>}>
        <ScrollArea className="h-64 sm:h-40">
          <ol className="space-y-2 pr-3 sm:space-y-1.5">
            {[...events].reverse().map((e) => {
              const d = describeEvent(e);
              return (
                <li key={e.id} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-[11.5px] sm:grid-cols-[72px_80px_1fr]">
                  <span className="font-mono text-bone-faint">{clock(e.at)}</span>
                  <Tag tone={d.tone} className="justify-self-start">
                    {d.tag}
                  </Tag>
                  <span className="col-span-2 line-clamp-2 break-words text-bone/85 sm:col-span-1 sm:line-clamp-1">{d.text}</span>
                </li>
              );
            })}
            {!events.length && <li className="text-[12px] text-bone-faint">Waiting for the first event from the control plane.</li>}
          </ol>
        </ScrollArea>
      </HudPanel>
    </div>
  );
}
