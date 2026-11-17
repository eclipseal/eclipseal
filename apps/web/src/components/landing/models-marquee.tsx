"use client";

import { useApi } from "@/lib/hooks";
import type { ModelEntry } from "@/lib/api";
import { fallbackModels } from "@/lib/site";
import { usd } from "@/lib/format";

/** The page's single marquee: the private model catalog, which is breadth, not detail. */
export function ModelsMarquee() {
  const { data } = useApi<{ data: ModelEntry[] }>("/api/models");
  const models = data?.data ?? fallbackModels;
  const row = (hidden: boolean) => (
    <ul className="flex shrink-0 items-center" aria-hidden={hidden}>
      {models.map((m) => (
        <li key={m.id} className="flex items-baseline gap-4 px-8 md:px-12">
          <span className="type-wide text-2xl whitespace-nowrap text-bone md:text-4xl">{m.name}</span>
          <span className="font-mono text-xs whitespace-nowrap text-bone-faint">
            {usd(m.inputPerM)}/M in · {m.gpu}
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-label="Private model catalog" className="overflow-hidden border-y border-line bg-ink py-8 md:py-10">
      <div className="animate-marquee flex w-max [--marquee-duration:60s] hover:[animation-play-state:paused]">
        {row(false)}
        {row(true)}
      </div>
    </section>
  );
}
