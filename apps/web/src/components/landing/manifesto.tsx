"use client";

import Image from "next/image";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { usePrefersReducedMotion } from "@/lib/hooks";

const text =
  "Cloud providers can read your prompts, your model weights and your keys. Eclipseal runs them inside enclaves that even we cannot open, and every result ships with a signed proof of exactly what ran.";

const emphasis = new Set(["read", "cannot", "open,", "signed", "proof"]);

export function Manifesto() {
  const root = useRef<HTMLElement>(null);
  const reduced = usePrefersReducedMotion();

  useGSAP(
    () => {
      if (reduced) return;
      const words = gsap.utils.toArray<HTMLElement>(".mf-word");
      gsap.fromTo(
        words,
        { opacity: 0.12, y: 14, rotateX: -55 },
        {
          opacity: 1,
          y: 0,
          rotateX: 0,
          ease: "none",
          stagger: 0.08,
          scrollTrigger: { trigger: root.current, start: "top 75%", end: "bottom 65%", scrub: 0.6 },
        },
      );
      // the emblem drifts against the text: two depth planes
      gsap.fromTo(
        ".mf-emblem",
        { yPercent: 30, rotate: -8, scale: 0.86 },
        { yPercent: -30, rotate: 10, scale: 1.08, ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: true } },
      );
    },
    { scope: root, dependencies: [reduced] },
  );

  return (
    <section ref={root} id="manifesto" className="relative overflow-hidden bg-ink px-4 py-28 md:px-8 md:py-44">
      <div aria-hidden className="mf-emblem pointer-events-none absolute -right-[18vw] top-[8%] w-[62vw] max-w-[720px] opacity-[0.22] md:-right-[6vw] md:w-[40vw]">
        <Image src="/art/emblem.webp" alt="" width={1024} height={1024} className="h-auto w-full" />
      </div>
      <div className="relative mx-auto max-w-[1200px]">
        <p className="type-wide max-w-[22ch] text-[8.2vw] leading-[1.02] text-bone md:text-[4.1vw]" style={{ perspective: "800px" }}>
          {text.split(" ").map((w, i) => (
            <span key={i} className={`mf-word inline-block origin-bottom pr-[0.26em] ${emphasis.has(w) ? "text-ember" : ""}`}>
              {w}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
