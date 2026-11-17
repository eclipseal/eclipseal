import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Chamfered HUD panel. Two clipped layers (border + fill) give a crisp 1px
 * outline that follows the cut corners, which a plain border cannot do.
 */
export function HudPanel({
  title,
  action,
  children,
  className,
  bodyClassName,
  cut = 14,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  cut?: number;
}) {
  // Mathematically accurate offset for uniform 1px border along the 45° chamfer cut
  const innerCut = Math.max(0, cut - 3.41);
  return (
    <section
      className={cn("chamfer relative isolate min-w-0", className)}
      style={{ "--cut": `${cut}px` } as CSSProperties}
    >
      <div aria-hidden className="chamfer absolute inset-0 -z-10 bg-line-strong" style={{ "--cut": `${cut}px` } as CSSProperties} />
      <div aria-hidden className="chamfer absolute inset-px -z-10 bg-ink-2" style={{ "--cut": `${innerCut}px` } as CSSProperties} />
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-3.5 pt-3.5">
          {title ? <HudTab>{title}</HudTab> : <span />}
          {action}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function HudTab({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn("chamfer micro inline-flex items-center bg-ink-4 px-3 py-1.5 text-[10.5px] text-bone", className)}
      style={{ "--cut": "7px" } as CSSProperties}
    >
      {children}
    </h2>
  );
}

/** Corner brackets used to frame visuals, like a targeting reticle. */
export function Brackets({ className, color = "border-bone/40" }: { className?: string; color?: string }) {
  const base = cn("absolute size-3", color);
  return (
    <span aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      <span className={cn(base, "top-0 left-0 border-t border-l")} />
      <span className={cn(base, "top-0 right-0 border-t border-r")} />
      <span className={cn(base, "bottom-0 left-0 border-b border-l")} />
      <span className={cn(base, "right-0 bottom-0 border-r border-b")} />
    </span>
  );
}

export function Kpi({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("relative pl-3", className)}>
      <span aria-hidden className="absolute top-1 bottom-1 left-0 w-px bg-line-strong" />
      <p className="font-heading text-[30px] leading-none font-semibold tracking-tight text-bone tabular-nums [font-stretch:110%]">{value}</p>
      <p className="mt-1.5 text-[11px] leading-tight text-bone-dim">{label}</p>
      {hint && <p className="mt-1 font-mono text-[10px] text-bone-faint">{hint}</p>}
    </div>
  );
}

type Tone = "ember" | "signal" | "cobalt" | "danger" | "muted";

const toneClass: Record<Tone, string> = {
  ember: "border-ember/60 text-ember bg-ember/10",
  signal: "border-signal/50 text-signal bg-signal/10",
  cobalt: "border-cobalt-soft/50 text-cobalt-soft bg-cobalt/15",
  danger: "border-danger/60 text-danger bg-danger/10",
  muted: "border-line-strong text-bone-dim bg-ink-3",
};

export function Tag({ tone = "muted", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("chamfer inline-flex h-6 items-center border px-2 font-mono text-[10px] tracking-wider whitespace-nowrap uppercase", toneClass[tone], className)} style={{ "--cut": "5px" } as CSSProperties}>
      {children}
    </span>
  );
}

export function statusTone(status: string): Tone {
  if (status === "running" || status === "completed" || status === "pass") return "signal";
  if (status === "provisioning" || status === "queued" || status === "warn") return "ember";
  if (status === "failed" || status === "fail") return "danger";
  return "muted";
}

export function Row({ k, v, mono = false }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-[12px]">
      <span className="shrink-0 text-bone-dim">{k}</span>
      <span className={cn("min-w-0 truncate text-right text-bone", mono && "font-mono text-[11.5px]")}>{v}</span>
    </div>
  );
}
