"use client";

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { ArrowClockwiseIcon, ArrowSquareOutIcon, CheckIcon, CopyIcon, WarningIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { HudPanel, Tag } from "./hud";
import { PageHeader, primaryButton } from "./page-header";
import { balanceLabel, Meter, SignInGate } from "./holder-ui";
import type { HolderTier, TokenInfo } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { useHolder } from "@/lib/wallet";
import { num, short } from "@/lib/format";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const steps = [
  { title: "Get $ECLS", body: "Buy on Pons with the official contract address. Only the address is proof; names and tickers can be copied." },
  { title: "Connect that wallet", body: "Use the same wallet here. Robinhood Wallet, MetaMask, Rabby and other EVM wallets work." },
  { title: "Sign in for free", body: "Sign a short message. No transaction, no gas, nothing is locked or moved." },
  { title: "Use the console", body: "Deploy agents, create an API key and launch GPU jobs with your tier's prices and limits." },
];

function perks(t: HolderTier) {
  return [
    t.discountPct ? `${t.discountPct}% off compute and inference` : "List prices",
    `${num(t.llmRequestsPerDay)} private LLM requests a day`,
    `${t.maxWorkloads} private workload${t.maxWorkloads === 1 ? "" : "s"}`,
    `Up to ${t.maxGpusPerJob} GPU${t.maxGpusPerJob === 1 ? "" : "s"} per job`,
  ];
}

function TierCard({ tier, current, early }: { tier: HolderTier; current: boolean; early: boolean }) {
  return (
    <li className={cn("relative flex flex-col border p-4", current ? "border-ember/70 bg-ember/5" : "border-line bg-ink-3/40")}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-heading text-xl font-semibold uppercase [font-stretch:112%]">{tier.label}</p>
        {current && <Tag tone="ember">{early ? "Early access" : "Your tier"}</Tag>}
      </div>
      <p className="mt-1 text-[11.5px] text-bone-dim">{tier.minBalance ? `Hold ${num(tier.minBalance)} $ECLS` : "Any signed-in wallet"}</p>
      <ul className="mt-4 space-y-2 border-t border-line pt-3 text-[12px]">
        {perks(tier).map((p) => (
          <li key={p} className="flex gap-2 text-bone/85">
            <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-signal" weight="bold" />
            {p}
          </li>
        ))}
      </ul>
    </li>
  );
}

export function PassView() {
  const holder = useHolder();
  const { me } = holder;
  const { data: token } = useApi<TokenInfo>("/api/token");
  const [refreshing, setRefreshing] = useState(false);
  const tiers = me?.tiers ?? token?.tiers;
  const live = (me?.token.status ?? token?.status) === "live";
  const contract = me?.token.address ?? token?.address ?? null;
  const launchpad = me?.token.launchpadUrl ?? token?.launchpadUrl ?? site.pons;
  // Before launch the Holder card stands in for the Early access tier everyone gets.
  const currentId = me ? (me.tier.id === "early" ? "holder" : me.tier.id) : null;
  const progress = me?.nextTier && me.balance.amount !== null ? Math.min(100, (me.balance.amount / me.nextTier.minBalance) * 100) : null;

  async function refresh() {
    setRefreshing(true);
    await holder.refresh(true);
    setRefreshing(false);
  }

  return (
    <>
      <PageHeader
        title="Holder pass"
        sub="Hold $ECLS on Robinhood Chain to unlock a private workspace, lower compute prices and higher limits. The balance is read from the chain; nothing is staked or locked."
        action={
          holder.address ? (
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void refresh()}
              className="chamfer inline-flex h-11 items-center gap-2 border border-line-strong bg-ink-3 px-4 text-xs tracking-wider text-bone uppercase transition-colors hover:border-bone/60 disabled:opacity-60"
              style={{ "--cut": "9px" } as CSSProperties}
            >
              <ArrowClockwiseIcon className={cn("size-4", refreshing && "animate-spin")} /> {refreshing ? "Reading chain" : "Refresh balance"}
            </button>
          ) : undefined
        }
      />

      {(me || token) && !live && (
        <div className="mb-4 flex items-start gap-3 border border-ember/40 bg-ember/5 p-4 text-[12.5px] leading-relaxed text-bone/85">
          <WarningIcon className="mt-0.5 size-4 shrink-0 text-ember" />
          <p>
            $ECLS is not live yet. Until it launches on Pons, every signed-in wallet gets <span className="text-ember">Early access</span> with Holder perks. Tiers switch to real balances automatically once the contract address is published.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <HudPanel title="Your pass">
          {!holder.address ? (
            <SignInGate action="see your tier" />
          ) : !me ? (
            <Skeleton className="h-72" />
          ) : (
            <div className="grid grid-cols-1 gap-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="micro text-bone-faint">Tier</p>
                  <p className="font-heading text-[40px] leading-none font-semibold text-ember uppercase [font-stretch:112%]">{me.tier.label}</p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="micro text-bone-faint">Wallet</p>
                  <a href={`${site.chain.explorer}/address/${me.address}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-bone hover:underline">
                    {short(me.address, 6, 4)} <ArrowSquareOutIcon className="size-3.5 text-bone-dim" />
                  </a>
                </div>
              </div>

              <div className="border-y border-line py-4">
                <p className="micro text-bone-faint">Balance</p>
                <p className="mt-1 font-mono text-lg text-bone">{balanceLabel(me)}</p>
                {me.balance.source === "unavailable" && (
                  <p className="mt-1.5 text-[11.5px] text-danger">Robinhood Chain did not answer ({me.balance.error}). Visitor limits apply until it does.</p>
                )}
                {me.balance.source === "chain" && me.balance.error && <p className="mt-1.5 text-[11.5px] text-bone-dim">Showing the last balance read; the RPC is not answering right now.</p>}
                {me.nextTier && progress !== null && (
                  <div className="mt-3">
                    <div className="h-1 bg-line">
                      <div className="h-1 bg-ember" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-2 text-[11.5px] text-bone-dim">
                      Hold {num(Math.ceil(me.nextTier.remaining))} more $ECLS for <span className="text-bone">{me.nextTier.label}</span>.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <Meter label="Private workloads" value={me.usage.workloads} max={me.tier.maxWorkloads} />
                <Meter label="LLM requests today" value={me.usage.llmRequestsToday} max={me.tier.llmRequestsPerDay} />
                <p className="flex justify-between text-[11px] text-bone-dim">
                  <span>Compute discount</span>
                  <span className="text-bone">{me.tier.discountPct ? `${me.tier.discountPct}%` : "none"}</span>
                </p>
                <p className="flex justify-between text-[11px] text-bone-dim">
                  <span>GPUs per job</span>
                  <span className="text-bone">{me.tier.maxGpusPerJob}</span>
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <a href={launchpad} target="_blank" rel="noreferrer" className={primaryButton} style={{ "--cut": "9px" } as CSSProperties}>
                  {live ? "Buy more on Pons" : "Open Pons"} <ArrowSquareOutIcon className="size-4" />
                </a>
                <Link href="/dashboard/models#keys" className="inline-flex h-11 items-center justify-center border border-line-strong text-xs tracking-wider text-bone uppercase transition-colors hover:border-bone/60">
                  Get an API key
                </Link>
              </div>
            </div>
          )}
        </HudPanel>

        <HudPanel title="How holders use it">
          <ol className="grid gap-px bg-line sm:grid-cols-2">
            {steps.map((s, i) => (
              <li key={s.title} className="bg-ink-2 p-4">
                <span className="font-heading text-2xl font-semibold text-transparent [-webkit-text-stroke:1px_var(--ember)]">{i + 1}</span>
                <p className="mt-2 text-[13px] text-bone uppercase">{s.title}</p>
                <p className="mt-1.5 text-[12px] leading-relaxed text-bone-dim">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-4 flex flex-col gap-3 border border-line bg-ink p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="micro text-bone-faint">Official contract</p>
              <p className="mt-1 truncate font-mono text-[12px] text-bone">{contract ?? "Published here and on X at launch"}</p>
            </div>
            {contract && (
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(contract)
                    .then(() => toast.success("Contract address copied"))
                    .catch(() => toast.error("Copy failed"))
                }
                className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 border border-line-strong px-3 text-[11px] tracking-wider text-bone uppercase hover:border-bone/60"
              >
                <CopyIcon className="size-3.5" /> Copy
              </button>
            )}
          </div>
        </HudPanel>
      </div>

      <HudPanel title="Tiers" className="mt-4">
        {tiers ? (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiers.map((t) => (
              <TierCard key={t.id} tier={t} current={t.id === currentId} early={me?.tier.id === "early"} />
            ))}
          </ul>
        ) : (
          <Skeleton className="h-56" />
        )}
        <p className="mt-4 text-[11px] leading-relaxed text-bone-faint">
          Thresholds and perks can change. A tier follows the wallet&apos;s current balance, so selling below a threshold lowers it. Nothing here is investment advice; tokens on Pons are experimental and can lose all value.
        </p>
      </HudPanel>
    </>
  );
}
