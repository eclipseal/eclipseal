"use client";

import { useMemo } from "react";
import type { DayStat } from "@/lib/api";
import { compact } from "@/lib/format";
import { cn } from "@/lib/utils";

const SERIES = [
  { key: "attestations", label: "Attestations", color: "var(--bone)" },
  { key: "deployments", label: "Deployments", color: "var(--ember)" },
  { key: "gpuHours", label: "GPU hours", color: "var(--cobalt-soft)" },
] as const;

/** Grouped dotted bars (one bar per series per day), each series normalised to its own max. */
export function HistoryBars({ data }: { data: DayStat[] }) {
  const max = useMemo(
    () => Object.fromEntries(SERIES.map((s) => [s.key, Math.max(1, ...data.map((d) => d[s.key]))])) as Record<(typeof SERIES)[number]["key"], number>,
    [data],
  );
  // Labels count back from today (the last bar), so today is always labelled.
  const step = data.length > 10 ? Math.ceil(data.length / 5) : 2;
  const labelled = (i: number) => (data.length - 1 - i) % step === 0;
  return (
    <figure>
      <div className="relative h-40" role="img" aria-label="Daily attestations, deployments and GPU hours, each scaled to its own peak">
        {[0.25, 0.5, 0.75, 1].map((y) => (
          <div key={y} className="absolute inset-x-0 border-t border-dashed border-line" style={{ bottom: `${y * 100}%` }}>
            <span className="absolute -top-2 -left-0.5 bg-ink-2 pr-1 font-mono text-[9px] text-bone-faint">{y.toFixed(2)}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[3px] pl-7">
          {data.map((d, i) => (
            <div key={d.date} className="group relative flex h-full flex-1 items-end justify-center gap-[2px]">
              {SERIES.map((s) => (
                <span
                  key={s.key}
                  className="w-[3px] max-w-[5px] flex-1 transition-[height] duration-700"
                  style={{
                    height: `${Math.max(4, (d[s.key] / max[s.key]) * 100)}%`,
                    background: `repeating-linear-gradient(to top, ${s.color} 0 2px, transparent 2px 4px)`,
                    opacity: 0.85,
                  }}
                />
              ))}
              <div
                className={cn(
                  "pointer-events-none absolute -top-2 z-10 hidden -translate-y-full border border-line-strong bg-ink px-2 py-1.5 font-mono text-[10px] whitespace-nowrap text-bone group-hover:block",
                  // Edge bars anchor the tooltip inward so it never spills off a phone screen.
                  i < data.length / 3 ? "left-0" : i >= (data.length * 2) / 3 ? "right-0" : "left-1/2 -translate-x-1/2",
                )}
              >
                {d.date.slice(5)} · {compact(d.attestations)} att · {d.deployments} dep · {compact(d.gpuHours)} gpu-h
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex h-3.5 gap-[3px] pl-7 font-mono text-[9.5px] leading-none text-bone-faint" aria-hidden>
        {data.map((d, i) => (
          <span key={d.date} className="relative flex-1">
            {labelled(i) && (
              <span className={cn("absolute top-0 whitespace-nowrap", i === data.length - 1 ? "right-0" : "left-1/2 -translate-x-1/2")}>
                <span className="hidden sm:inline">Day </span>
                {new Date(d.date).getUTCDate()}
              </span>
            )}
          </span>
        ))}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-4 text-[10.5px] text-bone-dim">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-1" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export function Sparkline({ values, color = "var(--cobalt-soft)", height = 36 }: { values: number[]; color?: string; height?: number }) {
  const path = useMemo(() => {
    if (values.length < 2) return "";
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return values
      .map((v, i) => `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * 100).toFixed(2)},${(height - 3 - ((v - min) / span) * (height - 6)).toFixed(2)}`)
      .join(" ");
  }, [values, height]);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <path d={path} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Chord ring: one node per workload, chords for workloads that share an attestor. */
export function ChordRing({ nodes, center }: { nodes: { id: string; gpu: boolean; active: boolean }[]; center: string }) {
  const r = 46;
  const points = nodes.map((n, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    return { ...n, x: 60 + Math.cos(a) * r, y: 60 + Math.sin(a) * r };
  });
  const chords: [number, number][] = [];
  points.forEach((_, i) => {
    for (let j = i + 1; j < points.length; j++) if ((i * 7 + j * 3) % 3 !== 0) chords.push([i, j]);
  });
  return (
    <svg viewBox="0 0 120 120" className="mx-auto w-full max-w-[220px]" role="img" aria-label={`${nodes.length} workloads sharing the attestation service`}>
      <circle cx="60" cy="60" r="56" fill="none" stroke="var(--cobalt-soft)" strokeOpacity="0.35" />
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line-strong)" />
      {chords.map(([a, b]) => (
        <path
          key={`${a}-${b}`}
          d={`M${points[a].x},${points[a].y} Q60,60 ${points[b].x},${points[b].y}`}
          fill="none"
          stroke={points[a].gpu || points[b].gpu ? "var(--cobalt-soft)" : "var(--bone)"}
          strokeOpacity={points[a].active && points[b].active ? 0.55 : 0.15}
          strokeWidth="0.6"
        />
      ))}
      {points.map((p) => (
        <circle key={p.id} cx={p.x} cy={p.y} r="2.4" fill={p.active ? (p.gpu ? "var(--cobalt-soft)" : "var(--ember)") : "var(--bone-faint)"} />
      ))}
      <text x="60" y="63" textAnchor="middle" className="fill-bone font-mono text-[7px]">
        {center}
      </text>
    </svg>
  );
}
