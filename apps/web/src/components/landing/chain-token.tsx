"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { ArrowRightIcon, ArrowUpRightIcon, CheckCircleIcon, CopyIcon, LockKeyIcon, ShieldCheckIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { gsap, useGSAP } from "@/lib/gsap";
import { useApi, usePrefersReducedMotion } from "@/lib/hooks";
import type { ChainStatus, TokenInfo } from "@/lib/api";
import { site } from "@/lib/site";
import { compact, num, short } from "@/lib/format";
import { cn } from "@/lib/utils";

const fallbackUtility: TokenInfo["utility"] = [
  { key: "compute", title: "Pay for compute", body: "Settle CVM, GPU and inference bills in $ECLS at a discount to card pricing." },
  { key: "operators", title: "Stake to operate", body: "Node operators bond $ECLS to list TEE hardware; failed attestations are slashed." },
  { key: "buyback", title: "Revenue buybacks", body: "A share of protocol fees buys $ECLS on its Pons pool." },
  { key: "governance", title: "Govern the allowlist", body: "Holders vote on which OS images and GPU firmware the verifier trusts." },
];

const steps = [
  { title: "Bridge ETH", body: "Move ETH to Robinhood Chain (chain id 4663) through the canonical Arbitrum bridge." },
  { title: "Open Pons", body: "Go to ponsfamily.com and connect the same wallet." },
  { title: "Paste the contract", body: "Search by the official $ECLS address only. Names and tickers on Pons can be copied." },
  { title: "Swap", body: "Buy against WETH in the locked pool. Review the transaction preview before signing." },
  { title: "Use it", body: "Sign in to the console with the same wallet. Your balance sets your tier: a private workspace, lower compute prices and higher limits." },
];

export function ChainToken() {
  const root = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();
  const { data: chain } = useApi<ChainStatus>("/api/chain", 12_000);
  const { data: token } = useApi<TokenInfo>("/api/token");
  const utility = token?.utility ?? fallbackUtility;
  const address = token?.address ?? null;
  const paidTiers = (token?.tiers ?? []).filter((t) => t.minBalance > 0).slice(0, 3);

  useGSAP(
    () => {
      if (reduced) return;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: ".tok-zoom", start: "top top", end: "bottom bottom", scrub: 0.6 },
      });
      tl.fromTo(".tok-img", { scale: 1.45, yPercent: 6 }, { scale: 1, yPercent: 0, ease: "none" }, 0)
        .fromTo(".tok-veil", { opacity: 0.2 }, { opacity: 0.72, ease: "none" }, 0)
        .fromTo(".tok-head", { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, ease: "power2.out", duration: 0.45 }, 0.15)
        .fromTo(".tok-hud", { y: 40, opacity: 0 }, { y: 0, opacity: 1, ease: "power2.out", duration: 0.3 }, 0.45);

      gsap.utils.toArray<HTMLElement>(".tok-step").forEach((el, i) => {
        gsap.fromTo(
          el,
          { opacity: 0, x: 40, rotateY: -25 },
          { opacity: 1, x: 0, rotateY: 0, ease: "power3.out", duration: 0.9, delay: i * 0.08, scrollTrigger: { trigger: el, start: "top 88%", toggleActions: "play none none reverse" } },
        );
      });
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    // overflow-x-clip (not hidden) keeps the sticky gate working while the steps swing in from the side.
    <section ref={root} id="token" className="relative overflow-x-clip bg-ink">
      {/* zoom parallax: the gate settles into frame */}
      <div className={cn("tok-zoom relative", reduced ? "h-[100svh]" : "h-[190svh]")}>
        <div className="sticky top-0 h-[100svh] overflow-hidden">
          <Image
            src="/art/art-chain.webp"
            alt="A line of colossal stone rings receding across a dark desert, each glowing at its base"
            fill
            sizes="100vw"
            className="tok-img object-cover object-[50%_45%]"
          />
          <div aria-hidden className="tok-veil absolute inset-0 bg-ink opacity-40" />
          <div className="relative flex h-full flex-col justify-end px-4 pb-10 md:px-8 md:pb-14">
            <h2 className="tok-head type-display max-w-[14ch] text-[11vw] text-bone md:text-[5.6vw]">
              Every proof lands on Robinhood Chain
            </h2>
            <dl className="tok-hud mt-8 grid max-w-[960px] grid-cols-2 gap-px border border-line-strong bg-line-strong md:grid-cols-4">
              {[
                ["Chain id", String(chain?.chainId ?? site.chain.id)],
                ["Latest block", chain?.live && chain.blockNumber ? num(chain.blockNumber) : chain ? "RPC offline" : "Connecting"],
                ["Gas", chain?.live && chain.gasPriceGwei !== null ? `${chain.gasPriceGwei} gwei` : "n/a"],
                ["Anchor", "Report digest per run"],
              ].map(([k, v]) => (
                <div key={k} className="bg-ink/80 p-4 backdrop-blur-sm">
                  <dt className="micro text-bone-faint">{k}</dt>
                  <dd className="mt-1.5 font-mono text-sm text-bone md:text-base">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* token */}
      <div className="mx-auto grid max-w-[1440px] gap-14 px-4 py-24 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-20 md:px-8 md:py-36">
        <div>
          <p className="micro text-ember">{token?.status === "live" ? "Live on Pons" : "Launching on Pons"}</p>
          <p className="type-display mt-4 text-[22vw] text-bone md:text-[9vw]">
            <span className="text-ember">$</span>ECLS
          </p>
          <p className="mt-6 max-w-[44ch] text-base leading-relaxed text-bone-dim md:text-lg">
            The unit of account for sealed compute. {token?.status === "live" ? "It trades on Pons" : "It launches on Pons"}, the token launchpad native to Robinhood Chain, with a fixed supply and liquidity locked by the Pons contracts.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6">
            {[
              ["Network", "Robinhood Chain"],
              ["Pair", token?.pair ?? "WETH"],
              ["Supply", num(token?.supply ?? 1_000_000_000)],
              ["Liquidity", "Locked by Pons"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="micro text-bone-faint">{k}</dt>
                <dd className="mt-1 text-[15px] text-bone">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-8 border border-line bg-ink-2 p-4">
            <p className="micro text-bone-faint">Official contract</p>
            {address ? (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(address);
                  toast.success("Contract address copied");
                }}
                className="mt-2 flex w-full items-center justify-between gap-3 font-mono text-sm text-bone"
              >
                {short(address, 10, 8)} <CopyIcon className="size-4 text-bone-dim" />
              </button>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-bone-dim">
                Published here and on X at launch. Until then, any $ECLS you see on Pons is not ours.
              </p>
            )}
          </div>
          <a
            href={token?.launchpadUrl ?? site.pons}
            target="_blank"
            rel="noreferrer"
            className="group mt-6 inline-flex h-12 w-full items-center justify-center gap-3 bg-ember px-6 text-sm font-semibold tracking-wide text-ink uppercase transition-transform hover:-translate-y-0.5 sm:w-auto"
          >
            Open Pons launchpad
            <ArrowUpRightIcon className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" weight="bold" />
          </a>

          {/* How the seal works, and what holding unlocks. The badge says devnet until workloads run on TEE hardware. */}
          <div className="mt-8 border border-line bg-ink-2/60 p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <p className="micro text-bone font-medium tracking-wider uppercase">How the seal works</p>
              <Link href="/docs#devnet-status" className="flex items-center gap-1.5 font-mono text-[11px] text-ember hover:underline">
                <span className="size-1.5 bg-ember" /> Devnet status
              </Link>
            </div>

            {/* 3 Hardware Security Specifications */}
            <div className="mt-4 space-y-2.5 font-mono text-xs">
              <div className="border border-line/50 bg-ink/70 p-3">
                <div className="flex items-center justify-between text-bone">
                  <span className="flex items-center gap-2 font-semibold">
                    <ShieldCheckIcon className="size-4 text-signal" /> Silicon Encryption
                  </span>
                  <span className="text-[10.5px] text-bone-dim">CPU + GPU</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-bone-dim">
                  The processor encrypts enclave memory with keys it never releases. The host and the hypervisor only see ciphertext.
                </p>
              </div>

              <div className="border border-line/50 bg-ink/70 p-3">
                <div className="flex items-center justify-between text-bone">
                  <span className="flex items-center gap-2 font-semibold">
                    <CheckCircleIcon className="size-4 text-ember" /> Cryptographic Attestation
                  </span>
                  <span className="text-[10.5px] text-bone-dim">Signed report</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-bone-dim">
                  Every run produces a signed report anyone can verify, anchored on Robinhood Chain. On devnet the signer is a development key and the anchor is computed.
                </p>
              </div>

              <div className="border border-line/50 bg-ink/70 p-3">
                <div className="flex items-center justify-between text-bone">
                  <span className="flex items-center gap-2 font-semibold">
                    <LockKeyIcon className="size-4 text-cobalt-soft" /> Zero Operator Access
                  </span>
                  <span className="text-[10.5px] text-bone-dim">Isolated CVM</span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-bone-dim">
                  On TEE hardware, cloud providers and node hosts cannot read what runs inside the enclave.
                </p>
              </div>
            </div>

            {/* Holder Compute Privileges Strip */}
            <div className="mt-5 border-t border-line pt-4">
              <div className="flex items-center justify-between">
                <p className="micro text-bone font-medium tracking-wider uppercase">Holder Compute Access</p>
                <Link href="/dashboard/pass" className="inline-flex items-center gap-1 font-mono text-[11px] tracking-wider text-ember uppercase hover:underline">
                  Tiers <ArrowRightIcon className="size-3" />
                </Link>
              </div>
              {/* Paid tiers straight from the API, so this strip always matches the console. */}
              {paidTiers.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[11px]">
                  {paidTiers.map((t, i) => (
                    <div key={t.id} className={cn("border p-2 text-center", i === paidTiers.length - 1 ? "border-ember/40 bg-ember/5" : "border-line/60 bg-ink/40")}>
                      <p className={cn("text-[9.5px]", i === paidTiers.length - 1 ? "text-ember" : "text-bone-faint")}>{compact(t.minBalance)} $ECLS</p>
                      <p className={cn("mt-0.5 font-semibold", i === paidTiers.length - 1 ? "text-ember" : "text-bone")}>{t.discountPct}% OFF</p>
                      <p className="text-[9.5px] text-bone-dim">{t.maxWorkloads} workloads</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-14">
          <ol className="grid gap-px bg-line sm:grid-cols-2" style={{ perspective: "1000px" }}>
            {steps.map((s, i) => (
              <li key={s.title} className={cn("tok-step bg-ink p-6", i === steps.length - 1 && "sm:col-span-2")}>
                <span className="type-display text-4xl text-transparent [-webkit-text-stroke:1px_var(--ember)]">{i + 1}</span>
                <p className="type-wide mt-4 text-lg text-bone">{s.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-bone-dim">{s.body}</p>
                {i === steps.length - 1 && (
                  <Link href="/dashboard/pass" className="group mt-4 inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-ember uppercase">
                    See holder tiers
                    <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" weight="bold" />
                  </Link>
                )}
              </li>
            ))}
          </ol>

          <div className="grid gap-px bg-line sm:grid-cols-[1.25fr_1fr]">
            {utility.map((u, i) => (
              <div
                key={u.key}
                className={cn(
                  "relative overflow-hidden p-6",
                  i === 0 ? "bg-[linear-gradient(135deg,rgb(217_115_47/0.22),transparent_60%)] sm:row-span-3" : "bg-ink-2",
                  i === 3 && "bg-[linear-gradient(160deg,rgb(47_75_216/0.25),transparent_70%)]",
                )}
              >
                <p className={cn("type-wide text-bone", i === 0 ? "text-2xl md:text-3xl" : "text-lg")}>{u.title}</p>
                <p className="mt-3 max-w-[40ch] text-sm leading-relaxed text-bone-dim">{u.body}</p>
                {i === 0 && (
                  <Image src="/art/emblem-3d.webp" alt="" width={320} height={320} className="pointer-events-none absolute -right-14 -bottom-14 w-56 opacity-70" />
                )}
              </div>
            ))}
          </div>
          <p className="text-xs leading-relaxed text-bone-faint">
            Token mechanics shown are the planned design and may change. Nothing here is investment advice. Tokens launched on Pons are experimental and can lose all value.
          </p>
        </div>
      </div>
    </section>
  );
}
