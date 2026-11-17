"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { ScrollTrigger, useGSAP } from "@/lib/gsap";
import { useInView, useIsMobile, usePrefersReducedMotion } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const StackScene = dynamic(() => import("./stack-scene"), { ssr: false });

const layers = [
  {
    title: "Silicon",
    body: "Intel TDX or AMD SEV-SNP CPUs and NVIDIA H100 to B300 GPUs in confidential mode. The attestation keys are fused into the chip.",
    tag: "Root of trust",
  },
  {
    title: "Measured boot",
    body: "Firmware, kernel and OS image are hashed into MRTD and RTMR0 to RTMR2 before a single line of your code runs.",
    tag: "MRTD, RTMR0-2",
  },
  {
    title: "Confidential VM",
    body: "Memory is encrypted per VM. The host, the hypervisor and Eclipseal operators only ever see ciphertext.",
    tag: "Encrypted memory",
  },
  {
    title: "Your workload",
    body: "Your docker-compose file is hashed into RTMR3. Change one byte and the measurement changes with it.",
    tag: "RTMR3",
  },
  {
    title: "Signed quote",
    body: "The hardware signs every measurement. The report digest is anchored on Robinhood Chain so anyone can check what ran.",
    tag: "Chain 4663",
  },
];

export function ProofStack() {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [step, setStep] = useState(0);
  const reduced = usePrefersReducedMotion();
  const mobile = useIsMobile();
  const [viewRef, inView] = useInView<HTMLDivElement>("120px");

  useGSAP(
    () => {
      if (reduced) {
        progress.current = 0.99;
        setStep(layers.length - 1);
        return;
      }
      ScrollTrigger.create({
        trigger: root.current,
        start: "top top",
        end: "+=420%",
        pin: true,
        scrub: true,
        anticipatePin: 1,
        onUpdate: (self) => {
          progress.current = self.progress;
          const next = Math.min(layers.length - 1, Math.floor(self.progress * layers.length * 0.999));
          setStep((prev) => (prev === next ? prev : next));
        },
      });
    },
    { scope: root, dependencies: [reduced] },
  );

  const current = layers[step];

  return (
    <section ref={root} id="proof" className="relative h-[100svh] overflow-hidden bg-ink">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_60%_at_68%_50%,rgb(47_75_216/0.16),transparent_70%)]" />
      <div className="relative mx-auto grid h-full max-w-[1440px] grid-rows-[52svh_1fr] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:grid-rows-1">
        <div className="order-2 flex flex-col justify-center px-4 pb-8 md:order-1 md:px-8 md:pb-0">
          <h2 className="type-display text-[10vw] text-bone md:text-[4.4vw]">Prove what ran</h2>
          <div className="mt-6 flex gap-1.5 md:mt-10" aria-hidden>
            {layers.map((l, i) => (
              <span key={l.title} className={cn("h-[3px] flex-1 transition-colors duration-500", i <= step ? "bg-ember" : "bg-line-strong")} />
            ))}
          </div>
          <ol className="mt-6 hidden space-y-1 md:block">
            {layers.map((l, i) => (
              <li
                key={l.title}
                className={cn(
                  "type-wide flex items-baseline justify-between border-b border-line py-3 text-xl transition-colors duration-500",
                  i === step ? "text-bone" : "text-bone/25",
                )}
              >
                <span>{l.title}</span>
                <span className={cn("micro", i === step ? "text-ember" : "text-transparent")}>{l.tag}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 min-h-[7.5rem] md:mt-8" aria-live="polite">
            <p className="type-wide text-lg text-bone md:hidden">{current.title}</p>
            <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-bone-dim md:mt-0 md:text-base">{current.body}</p>
          </div>
        </div>
        <div ref={viewRef} className="relative order-1 md:order-2">
          <StackScene progress={progress} active={inView} mobile={mobile} />
        </div>
      </div>
    </section>
  );
}
