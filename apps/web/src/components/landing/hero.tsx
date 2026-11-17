"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useApi, useInView, useIsMobile, usePrefersReducedMotion } from "@/lib/hooks";
import type { ChainStatus } from "@/lib/api";
import type { PanelState } from "./hero-diorama";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

const HeroDiorama = dynamic(() => import("./hero-diorama"), { ssr: false });

const captions = ["Your agent's keys.", "Your model's weights.", "Your users' prompts.", "Sealed in silicon. Proven on chain."];

// The illustration panel, same rect as the poster: lower right, under the headline.
const PANEL = "top-[39svh] right-[3vw] bottom-[21svh] left-[36vw] md:top-[40svh] md:right-[2.2vw] md:bottom-[4.5svh] md:left-[39vw]";

const stageVars = {
  // Wordmark size fills the height like the poster; letter-spacing stretches it on tall phones.
  "--wm": "min(calc((100svh - 96px) / 7.65), 22vw)",
  "--col": "calc(1.4vw + var(--wm) * 0.82 + 1.1vw + 6px + 1.8vw)",
} as CSSProperties;

export function Hero() {
  const section = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const windowEl = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const panel = useRef<PanelState>({ cx: 0, cy: 0, ph: 0.55, pw: 0.6, open: 0 });
  const insets = useRef({ t: 0, r: 0, b: 0, l: 0 });
  const [dims, setDims] = useState({ ph: 0.55, pw: 0.6 });
  const [ready, setReady] = useState(false);
  const reduced = usePrefersReducedMotion();
  const mobile = useIsMobile();
  const [viewRef, inView] = useInView<HTMLDivElement>("100px", true);
  const { data: chain } = useApi<ChainStatus>("/api/chain", 15_000);
  const onReady = useCallback(() => setReady(true), []);

  /** Clips the full-screen world to the poster panel; open = 1 shows the whole screen. */
  const applyClip = useCallback((open: number) => {
    const el = windowEl.current;
    if (!el) return;
    const k = 1 - open;
    const i = insets.current;
    el.style.clipPath = `inset(${(i.t * k).toFixed(1)}px ${(i.r * k).toFixed(1)}px ${(i.b * k).toFixed(1)}px ${(i.l * k).toFixed(1)}px)`;
    panel.current.open = open;
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    // ResizeObserver also fires once on observe, which does the first measurement.
    const ro = new ResizeObserver(() => {
      const s = el.getBoundingClientRect();
      const f = frame.current?.getBoundingClientRect();
      if (!f || !s.height) return;
      insets.current = { t: f.top - s.top, r: s.right - f.right, b: s.bottom - f.bottom, l: f.left - s.left };
      const ph = Math.round((f.height / s.height) * 1000) / 1000;
      const pw = Math.round((f.width / s.width) * 1000) / 1000;
      panel.current = { ...panel.current, cx: f.left - s.left + f.width / 2, cy: f.top - s.top + f.height / 2, ph, pw };
      setDims((d) => (d.ph === ph && d.pw === pw ? d : { ph, pw }));
      applyClip(panel.current.open);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [applyClip]);

  useGSAP(
    () => {
      if (reduced) {
        progress.current = 0;
        applyClip(0);
        return;
      }
      const proxy = { open: 0 };
      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: section.current,
          start: "top top",
          end: "bottom bottom",
          scrub: 0.5,
          onUpdate: (self) => {
            progress.current = self.progress;
          },
        },
      });

      // Act 1: the poster dissolves and its illustration opens into the whole screen.
      tl.to(proxy, { open: 1, duration: 0.2, ease: "power1.inOut", onUpdate: () => applyClip(proxy.open) }, 0.02)
        .to(".hero-line-a", { xPercent: -12, z: 260, opacity: 0, duration: 0.13 }, 0)
        .to(".hero-line-b", { xPercent: 14, z: 200, opacity: 0, duration: 0.13 }, 0.01)
        .to(".hero-x", { rotate: 120, scale: 0.4, opacity: 0, duration: 0.1, stagger: 0.008 }, 0)
        .to(".hero-dark", { yPercent: -50, z: 320, opacity: 0, duration: 0.14 }, 0.02)
        .to(".hero-micro", { y: -24, opacity: 0, duration: 0.08 }, 0)
        .to(".hero-vpara", { y: 50, opacity: 0, duration: 0.1 }, 0)
        .to(".hero-copy", { y: 40, opacity: 0, duration: 0.09 }, 0)
        .to(".hero-wordmark", { xPercent: -190, opacity: 0, duration: 0.18, ease: "power2.in" }, 0.04)
        .to(".hero-rule", { scaleY: 0, duration: 0.14 }, 0.03);

      // Act 2: flight toward the core, with the narrative captions.
      const slots = [
        [0.3, 0.44],
        [0.46, 0.6],
        [0.62, 0.75],
        [0.77, 0.9],
      ];
      gsap.utils.toArray<HTMLElement>(".hero-caption").forEach((el, i) => {
        const [a, b] = slots[i];
        tl.fromTo(el, { opacity: 0, y: 46, z: -200 }, { opacity: 1, y: 0, z: 0, duration: 0.05 }, a).to(el, { opacity: 0, y: -46, z: 160, duration: 0.05 }, b - 0.05);
      });

      // Act 3: through the static, into the dark.
      tl.fromTo(".hero-static", { opacity: 0 }, { opacity: 0.5, duration: 0.03 }, 0.89)
        .to(".hero-static", { opacity: 0, duration: 0.05 }, 0.94)
        .fromTo(".hero-fade", { opacity: 0 }, { opacity: 1, duration: 0.07 }, 0.92);
    },
    { scope: section, dependencies: [reduced, applyClip] },
  );

  const block = chain?.live && chain.blockNumber ? `Block ${num(chain.blockNumber)}` : chain ? "RPC offline" : "Connecting";

  return (
    <section ref={section} id="top" aria-label="Eclipseal" className={cn("relative", reduced ? "h-[100svh]" : "h-[360svh]")}>
      <div ref={stage} className="sticky top-0 h-[100svh] w-full overflow-hidden bg-ink" style={stageVars}>
        <div ref={frame} aria-hidden className={cn("pointer-events-none absolute", PANEL)} />

        {/* The world, clipped to the poster's illustration panel until the scroll opens it. */}
        <div ref={viewRef} className="absolute inset-0">
          <div ref={windowEl} className="absolute inset-0 overflow-hidden" style={{ clipPath: "inset(40% 2.2% 4.5% 39%)" }}>
            <div className={cn("absolute", PANEL)}>
              <Image
                src="/art/poster-art.webp"
                alt=""
                fill
                preload
                sizes="(max-width: 768px) 62vw, 60vw"
                className={cn("object-cover object-[50%_42%] transition-opacity duration-700", ready ? "opacity-0" : "opacity-100")}
              />
            </div>
            <div className={cn("absolute inset-0 transition-opacity duration-700", ready ? "opacity-100" : "opacity-0")}>
              <HeroDiorama
                progress={progress}
                panel={panel}
                reduced={reduced}
                mobile={mobile}
                active={inView}
                ph={dims.ph}
                pw={dims.pw}
                onReady={onReady}
                eventSource={stage}
              />
            </div>
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(130%_95%_at_50%_45%,transparent_55%,rgb(7_9_18/0.6)_100%)]" />
          </div>
        </div>

        {/* Poster typography */}
        <div className="pointer-events-none absolute inset-0 z-10 [--h1:13vw] md:[--h1:min(7vw,11.6svh)]" style={{ perspective: "1100px" }}>
          <div className="hero-wordmark absolute top-[72px] bottom-[2.4svh] left-[1.4vw] flex gap-[1.1vw]">
            <h1
              aria-label="Eclipseal"
              className="type-display ink-distress rotate-180 leading-[0.82] select-none [writing-mode:vertical-rl]"
              style={{ fontSize: "var(--wm)", letterSpacing: "max(0px, calc((100svh - 96px - var(--wm) * 7.65) / 8.4))" }}
            >
              Eclipseal
            </h1>
            <span aria-hidden className="hero-rule w-[5px] origin-top bg-ember-deep md:w-[6px]" />
          </div>

          <div className="absolute top-[78px] right-[3vw] left-[var(--col)] md:right-auto" style={{ transformStyle: "preserve-3d" }}>
            <p className="type-display whitespace-nowrap text-bone" style={{ fontSize: "var(--h1)" }}>
              <span className="hero-line-a inline-block">
                Proven<span className="hero-x ml-[0.22em] hidden text-bone/20 md:inline">XX</span>
              </span>
            </p>
            <p className="type-display mt-[0.08em] whitespace-nowrap pl-[0.2em] text-bone md:pl-[1.7em]" style={{ fontSize: "calc(var(--h1) * 0.6)" }}>
              <span className="hero-line-b inline-block">
                <span className="hero-x inline-block text-bone/20">X</span> In the <span className="hero-x inline-block text-bone/20">XX</span>
              </span>
            </p>
          </div>

          <div className="hero-micro micro absolute top-[calc(78px+13vw*1.62)] right-[3vw] left-[var(--col)] grid grid-cols-3 gap-x-3 text-[8px] text-bone/65 md:top-[96px] md:right-[2.2vw] md:left-auto md:w-[min(25vw,350px)] md:grid-cols-[1.25fr_1fr] md:gap-x-7 md:gap-y-4 md:text-[10.5px]">
            <p className="order-last col-span-3 mt-3 text-[9px] leading-snug tracking-normal text-bone/55 normal-case md:order-none md:col-span-1 md:row-span-2 md:mt-0 md:text-[11px]">
              Eclipseal is not a cloud you trust. It is hardware you can check. Every enclave seals its memory from the operator, and every result leaves with a signed quote.
            </p>
            <div className="space-y-1">
              <p>Enclave sealed</p>
              <p>Eclipseal // active</p>
            </div>
            <div className="space-y-1">
              <p>Chain {chain?.chainId ?? 4663}</p>
              <p>{block}</p>
            </div>
            <div className="space-y-1 md:col-start-2">
              <p>Every result</p>
              <p className="text-ember">leaves signed</p>
            </div>
          </div>

          <p className="hero-dark type-display absolute bottom-[calc(61svh+6px)] left-[36vw] text-[15.5vw] text-bone md:bottom-[calc(60svh+10px)] md:left-[39vw] md:text-[min(7.8vw,12svh)]">
            Dark
          </p>

          <div className="hero-vpara absolute top-[39svh] bottom-[21svh] left-[calc(36vw-40px)] flex w-[34px] flex-col justify-between py-1 md:top-[40svh] md:bottom-[4.5svh] md:left-[calc(39vw-58px)] md:w-[48px]">
            <p className="max-h-[46%] rotate-180 text-[8.5px] leading-[1.35] text-bone/70 [writing-mode:vertical-rl] md:text-[12px]">
              Eclipseal seals agent keys, model weights and prompts inside the chip.
            </p>
            <p className="max-h-[46%] rotate-180 text-[8.5px] leading-[1.35] text-bone/70 [writing-mode:vertical-rl] md:text-[12px]">
              Every result leaves with a signed quote. Nothing to trust, everything to check.
            </p>
          </div>

          <div className="hero-copy pointer-events-auto absolute right-[3vw] bottom-[2.6svh] left-[var(--col)] md:right-auto md:bottom-[4.5svh] md:w-[calc(39vw-var(--col)-76px)]">
            <p className="text-[13px] leading-relaxed text-bone/80 md:text-[15px]">
              Run agents, private LLMs and GPU jobs inside hardware-sealed enclaves. Keep secrets private. Prove what ran.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Link
                href="/dashboard"
                className="group inline-flex h-11 items-center justify-center gap-2.5 bg-ember px-4 text-[12px] font-semibold tracking-wide text-ink uppercase transition-transform hover:-translate-y-0.5 active:translate-y-0 md:h-12 md:px-5 md:text-[13px]"
              >
                Launch app
                <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-1" weight="bold" />
              </Link>
              <a
                href="#token"
                className="inline-flex h-11 items-center justify-center border border-bone/30 px-4 text-[12px] font-semibold tracking-wide text-bone uppercase transition-colors hover:border-bone md:h-12 md:px-5 md:text-[13px]"
              >
                Get $ECLS
              </a>
            </div>
          </div>
        </div>

        {/* Flight captions */}
        {!reduced && (
          <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center px-6" style={{ perspective: "900px" }}>
            {captions.map((c) => (
              <p
                key={c}
                className="hero-caption type-display col-start-1 row-start-1 max-w-[16ch] text-center text-[9.5vw] text-bone opacity-0 [text-shadow:0_2px_40px_rgb(7_9_18/0.7)] md:text-[5vw]"
              >
                {c}
              </p>
            ))}
          </div>
        )}

        <div aria-hidden className="hero-static pointer-events-none absolute inset-0 z-30 bg-[url(/textures/grain.png)] bg-[length:160px_160px] opacity-0 mix-blend-screen" />
        <div aria-hidden className="hero-fade pointer-events-none absolute inset-0 z-30 bg-ink opacity-0" />
      </div>
    </section>
  );
}
