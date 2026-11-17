"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AttestationReport, Cvm, ModelEntry } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type Item = { id: string; group: string; label: string; hint?: string; href: string };

const shortcuts: Item[] = [
  { id: "p-overview", group: "Pages", label: "Overview", hint: "Enclave map", href: "/dashboard" },
  { id: "p-agents", group: "Pages", label: "Agent sandbox", href: "/dashboard/agents" },
  { id: "p-models", group: "Pages", label: "Private LLM", href: "/dashboard/models" },
  { id: "p-gpu", group: "Pages", label: "GPU market", href: "/dashboard/gpu" },
  { id: "p-attest", group: "Pages", label: "Attestations", href: "/dashboard/attestations" },
  { id: "p-vault", group: "Pages", label: "Vault", href: "/dashboard/vault" },
  { id: "p-pass", group: "Pages", label: "Holder pass", hint: "$ECLS tier and perks", href: "/dashboard/pass" },
  { id: "a-deploy", group: "Actions", label: "Deploy a workload", href: "/dashboard/agents?deploy=1" },
  { id: "a-key", group: "Actions", label: "Create an API key", href: "/dashboard/models#keys" },
  { id: "a-paste", group: "Actions", label: "Verify a report someone sent you", href: "/dashboard/attestations?tab=paste" },
];

/** Jump to any page, workload, model or recent quote. Opens with Cmd+K or Ctrl+K. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const { data: cvms } = useApi<Cvm[]>(open ? "/api/cvms" : null);
  const { data: models } = useApi<{ data: ModelEntry[] }>(open ? "/api/models" : null);
  const { data: quotes } = useApi<AttestationReport[]>(open ? "/api/attestations?limit=15" : null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shortcuts;
    const all: Item[] = [
      ...shortcuts,
      ...(cvms ?? []).map((c) => ({ id: c.id, group: "Workloads", label: c.name, hint: c.status, href: `/dashboard/agents?open=${c.id}` })),
      ...(models?.data ?? []).map((m) => ({ id: m.id, group: "Models", label: m.name, hint: m.id, href: "/dashboard/models" })),
      ...(quotes ?? []).map((r) => ({ id: r.id, group: "Quotes", label: r.subject.name, hint: r.id, href: `/dashboard/attestations?id=${r.id}` })),
    ];
    return all.filter((i) => `${i.label} ${i.hint ?? ""} ${i.group}`.toLowerCase().includes(q)).slice(0, 40);
  }, [cvms, models, quotes, query]);

  const index = Math.min(active, Math.max(0, items.length - 1));

  useEffect(() => {
    list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setQuery("");
      setActive(0);
    }
  }

  function go(item: Item | undefined) {
    if (!item) return;
    close(false);
    router.push(item.href);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent showCloseButton={false} className="top-[12dvh] translate-y-0 gap-0 border-line-strong bg-ink-2 p-0 font-mono sm:max-w-xl">
        <DialogTitle className="sr-only">Search the console</DialogTitle>
        <DialogDescription className="sr-only">Type to filter pages, workloads, models and quotes. Use the arrow keys and Enter.</DialogDescription>
        <label className="flex items-center gap-3 border-b border-line px-4">
          <MagnifyingGlassIcon className="size-4 shrink-0 text-bone-faint" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive(Math.min(index + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive(Math.max(index - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(items[index]);
              }
            }}
            placeholder="Search pages, workloads, models, quotes"
            aria-label="Search the console"
            className="h-14 w-full bg-transparent text-sm text-bone outline-none placeholder:text-bone-faint"
          />
          <kbd className="hidden shrink-0 border border-line-strong px-1.5 py-0.5 text-[10px] text-bone-faint sm:inline">ESC</kbd>
        </label>
        <ul ref={list} role="listbox" aria-label="Results" className="max-h-[min(60dvh,420px)] overflow-y-auto p-2" data-lenis-prevent>
          {items.length === 0 && <li className="px-3 py-8 text-center text-xs text-bone-faint">Nothing matches “{query}”.</li>}
          {items.map((item, i) => (
            <li key={`${item.group}-${item.id}`} role="presentation">
              {(i === 0 || items[i - 1].group !== item.group) && <p className="micro px-3 pt-3 pb-1.5 text-bone-faint">{item.group}</p>}
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                data-index={i}
                onMouseMove={() => i !== index && setActive(i)}
                onClick={() => go(item)}
                className={cn("flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[12.5px]", i === index ? "bg-ink-4 text-bone" : "text-bone/80")}
              >
                <span className="min-w-0 truncate">{item.label}</span>
                {item.hint && <span className="max-w-[45%] truncate text-[11px] text-bone-faint">{item.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
