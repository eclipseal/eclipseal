"use client";

import Image from "next/image";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import { useApi, usePrefersReducedMotion } from "@/lib/hooks";
import type { GpuOffer, ModelEntry } from "@/lib/api";
import { fallbackGpus, fallbackModels } from "@/lib/site";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";

type Product = {
  n: string;
  title: string;
  body: string;
  code: string[];
  img: string;
  crop: string;
  footer: React.ReactNode;
};

export function Products() {
  const wrap = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const { data: models } = useApi<{ data: ModelEntry[] }>("/api/models");
  const { data: offers } = useApi<GpuOffer[]>("/api/gpu/offers");

  const modelList = models?.data ?? fallbackModels;
  const gpuList = offers ?? fallbackGpus;
  const cheapestModel = Math.min(...modelList.map((m) => m.inputPerM));
  const byGpu = ["H100", "H200", "B300"].map((g) => ({
    gpu: g,
    price: Math.min(...gpuList.filter((o) => o.gpu === g).map((o) => o.pricePerGpuHour)),
    vram: gpuList.find((o) => o.gpu === g)?.vramGb,
  }));

  const products: Product[] = [
    {
      n: "01",
      title: "Agent sandbox",
      body: "Agents that hold keys and trade on Robinhood Chain run in a confidential VM. The host cannot read memory, so keys and strategy stay sealed.",
      code: [
        "$ ecls deploy -c docker-compose.yml -n atlas-trader",
        "selecting CPU TEE: Intel TDX",
        "injecting encrypted env (3 sealed keys)",
        "cvm ready: https://atlas-trader.eclipseal.xyz",
      ],
      img: "/art/art-agent.webp",
      crop: "object-[50%_42%]",
      footer: <span>Intel TDX and AMD SEV-SNP. From {usd(0.069, 3)} per hour.</span>,
    },
    {
      n: "02",
      title: "Private LLM",
      body: `OpenAI-compatible endpoints for ${modelList
        .slice(0, 4)
        .map((m) => m.provider)
        .join(", ")} and more. Prompts are decrypted only inside the GPU enclave, and every reply is signed.`,
      code: [
        "POST /v1/chat/completions",
        '{ "model": "deepseek/deepseek-v4.1-flash" }',
        '"signature": "ed25519:6QpK…w2Q"',
        '"attestation_id": "att_7f3a…c91e"',
      ],
      img: "/art/art-llm.webp",
      crop: "object-[50%_50%]",
      footer: (
        <span>
          {modelList.length} models. From {usd(cheapestModel)} per million input tokens.
        </span>
      ),
    },
    {
      n: "03",
      title: "Confidential GPU",
      body: "Rent H100, H200 and B300 with NVIDIA confidential computing switched on. Fine-tune on private data; checkpoints are sealed to your key.",
      code: byGpu.map((g) => `${g.gpu.padEnd(5)} ${String(g.vram ?? "").padStart(3)} GB   ${usd(g.price)}/GPU/hr`),
      img: "/art/art-gpu.webp",
      crop: "object-[50%_40%]",
      footer: <span>Hourly billing. Attestation before the first byte of your data loads.</span>,
    },
  ];

  useGSAP(
    () => {
      if (reduced || !track.current || !wrap.current) return;
      const distance = () => track.current!.scrollWidth - window.innerWidth;
      const pan = gsap.to(track.current, {
        x: () => -distance(),
        ease: "none",
        scrollTrigger: {
          trigger: wrap.current,
          start: "top top",
          end: () => `+=${distance()}`,
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          anticipatePin: 1,
        },
      });

      // Cards swing in from depth like pages of a dossier, then swing out the other side.
      gsap.utils.toArray<HTMLElement>(".prod-card").forEach((card) => {
        gsap.fromTo(
          card,
          { rotateY: 38, z: -260, opacity: 0.35 },
          {
            rotateY: 0,
            z: 0,
            opacity: 1,
            ease: "power1.out",
            scrollTrigger: { trigger: card, containerAnimation: pan, start: "left right", end: "center 55%", scrub: true },
          },
        );
        gsap.to(card, {
          rotateY: -24,
          z: -180,
          opacity: 0.4,
          ease: "power1.in",
          scrollTrigger: { trigger: card, containerAnimation: pan, start: "center 40%", end: "right left", scrub: true },
        });
        const img = card.querySelector(".prod-img");
        if (img) {
          gsap.fromTo(img, { xPercent: -12 }, { xPercent: 12, ease: "none", scrollTrigger: { trigger: card, containerAnimation: pan, start: "left right", end: "right left", scrub: true } });
        }
      });

      gsap.fromTo(".prod-progress", { scaleX: 0 }, { scaleX: 1, ease: "none", scrollTrigger: { trigger: wrap.current, start: "top top", end: () => `+=${distance()}`, scrub: true } });
    },
    { scope: wrap, dependencies: [reduced] },
  );

  return (
    <section ref={wrap} id="products" className="relative overflow-hidden bg-ink">
      <div
        ref={track}
        className={cn(
          "flex items-center gap-[6vw] px-4 md:px-[6vw]",
          reduced ? "flex-col py-24 md:flex-row md:overflow-x-auto" : "h-[100svh] w-max",
        )}
        style={{ perspective: "1400px" }}
      >
        <div className="w-[86vw] shrink-0 md:w-[34vw]">
          <p className="micro text-ember">What you can run</p>
          <h2 className="type-display mt-5 text-[12vw] text-bone md:text-[5.2vw]">
            Three ways to run in the dark
          </h2>
          <p className="mt-6 max-w-[42ch] text-base leading-relaxed text-bone-dim md:text-lg">
            Bring a Docker Compose file. Eclipseal boots it inside a confidential VM, seals its secrets and hands back a quote anyone can check.
          </p>
        </div>

        {products.map((p) => (
          <article
            key={p.n}
            className="prod-card relative flex h-[74svh] min-h-[520px] w-[86vw] shrink-0 flex-col border border-line bg-ink-2 md:w-[min(46vw,620px)]"
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className="relative h-[30%] overflow-hidden border-b border-line">
              <Image
                src={p.img}
                alt=""
                fill
                sizes="(max-width: 768px) 86vw, 46vw"
                className={cn("prod-img scale-[1.3] object-cover", p.crop)}
              />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink-2 via-ink-2/10 to-transparent" />
            </div>
            <div className="flex flex-1 flex-col p-5 md:p-8">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="type-display text-[8.4vw] text-bone md:text-[2.7vw]">{p.title}</h3>
                <span className="type-display text-[8vw] text-transparent [-webkit-text-stroke:1px_var(--line-strong)] md:text-[3.4vw]">{p.n}</span>
              </div>
              <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-bone-dim">{p.body}</p>
              <pre className="mt-auto overflow-x-auto border border-line bg-ink p-4 font-mono text-[11.5px] leading-6 text-bone/85 no-scrollbar md:text-[12.5px]">
                {p.code.map((line, i) => (
                  <span key={i} className={cn("block whitespace-pre", i === 0 && "text-ember")}>
                    {line}
                  </span>
                ))}
              </pre>
              <p className="mt-4 text-[13px] text-bone/70">{p.footer}</p>
            </div>
          </article>
        ))}
        <div className="hidden w-[6vw] shrink-0 md:block" />
      </div>
      {!reduced && (
        <div className="absolute inset-x-4 bottom-6 h-px bg-line md:inset-x-[6vw]">
          <div className="prod-progress h-px origin-left bg-ember" />
        </div>
      )}
    </section>
  );
}
