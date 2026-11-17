import type { ReactNode } from "react";

export function PageHeader({ title, sub, action }: { title: string; sub: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-4 px-1 pt-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-heading text-[30px] leading-none font-semibold tracking-tight uppercase [font-stretch:112%] md:text-[38px]">{title}</h1>
        <p className="mt-2 max-w-[70ch] text-[12.5px] leading-relaxed text-bone-dim">{sub}</p>
      </div>
      {action}
    </div>
  );
}

export const primaryButton =
  "chamfer inline-flex h-11 items-center justify-center gap-2 bg-ember px-5 text-xs font-semibold tracking-[0.14em] text-ink uppercase transition-transform hover:-translate-y-px disabled:opacity-50";
