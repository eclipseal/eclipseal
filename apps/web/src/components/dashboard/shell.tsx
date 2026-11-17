"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { BellIcon, ListIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { Logo } from "@/components/brand/logo";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AccountButton } from "./account-button";
import { CommandPalette } from "./command-palette";
import { describeEvent } from "./event-text";
import { Tag } from "./hud";
import type { HubEvent } from "@/lib/api";
import { useEvents } from "@/lib/hooks";
import { HolderProvider } from "@/lib/wallet";
import { clock } from "@/lib/format";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/models", label: "Private LLM" },
  { href: "/dashboard/gpu", label: "GPU market" },
  { href: "/dashboard/attestations", label: "Attestations" },
  { href: "/dashboard/vault", label: "Vault" },
  { href: "/dashboard/pass", label: "Holder pass" },
  { href: "/docs", label: "Docs" },
];

const cut8 = { "--cut": "8px" } as CSSProperties;

/** Worth a badge: milestones on the wallet's own resources, not the network's heartbeat quotes. */
const notable = (e: HubEvent) =>
  Boolean(e.mine) &&
  !e.replay &&
  (e.type === "cvm.status" ||
    e.type === "attestation.created" ||
    e.type === "secret.sealed" ||
    (e.type === "gpu.progress" && ["completed", "failed", "cancelled"].includes(String(e.data.status))));

/** Square HUD button; spreads props and ref so Radix triggers can wrap it. */
function IconButton({ badge, className, children, ...props }: ComponentProps<"button"> & { badge?: number }) {
  return (
    <button
      type="button"
      {...props}
      className={cn("chamfer relative inline-flex size-10 items-center justify-center border border-line-strong bg-ink-3 text-bone/80 transition-colors hover:text-bone", className)}
      style={cut8}
    >
      {children}
      {badge ? <span className="absolute top-0 right-0 grid min-w-4 place-items-center bg-ember px-1 font-mono text-[9px] leading-4 text-ink">{badge > 9 ? "9+" : badge}</span> : null}
    </button>
  );
}

function Notifications() {
  const { events } = useEvents(undefined, 20);
  const [seenId, setSeenId] = useState(0);
  const feed = events.filter((e) => e.type !== "chain.status");
  const unseen = feed.filter((e) => notable(e) && e.id > seenId).length;

  return (
    <DropdownMenu onOpenChange={(open) => open && setSeenId(feed.at(-1)?.id ?? seenId)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <IconButton aria-label={unseen ? `${unseen} new events` : "Events"} badge={unseen}>
              <BellIcon className="size-4" />
            </IconButton>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{unseen ? `${unseen} new events` : "Events"}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[min(92vw,360px)] p-0 font-mono">
        <DropdownMenuLabel className="flex items-center justify-between px-3 py-2.5 text-[10.5px] tracking-wider text-bone-dim uppercase">
          Latest events <span className="normal-case text-bone-faint">live</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-0" />
        <ol className="max-h-80 overflow-y-auto py-1" data-lenis-prevent>
          {feed.length === 0 && <li className="px-3 py-6 text-center text-xs text-bone-faint">Nothing yet. Deploys, quotes and jobs show up here.</li>}
          {[...feed]
            .reverse()
            .slice(0, 12)
            .map((e) => {
              const d = describeEvent(e);
              return (
                <li key={e.id} className="grid grid-cols-[auto_1fr] items-start gap-x-2.5 gap-y-1 px-3 py-2 text-[11.5px]">
                  <Tag tone={d.tone} className="h-5">
                    {d.tag}
                  </Tag>
                  <span className="text-right text-[10.5px] text-bone-faint">
                    {e.mine && <span className="mr-2 text-ember">yours</span>}
                    {clock(e.at)}
                  </span>
                  <span className={cn("col-span-2 line-clamp-2 leading-snug break-words", e.mine ? "text-bone" : "text-bone/70")}>{d.text}</span>
                </li>
              );
            })}
        </ol>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

  return (
    <HolderProvider>
      <div className="min-h-dvh bg-ink bg-[radial-gradient(90%_60%_at_50%_0%,rgb(47_75_216/0.13),transparent_60%)] font-mono text-bone">
        <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-3 px-3 md:px-6">
            <Link href="/" className="shrink-0 font-sans" aria-label="Eclipseal home">
              <Logo />
            </Link>
            <nav aria-label="Dashboard" className="ml-3 hidden min-w-0 flex-1 items-center gap-1.5 xl:flex">
              {tabs.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={isActive(t.href) ? "page" : undefined}
                  className={cn(
                    "chamfer border px-3.5 py-2.5 text-[11px] tracking-[0.12em] whitespace-nowrap uppercase transition-colors 2xl:px-4",
                    isActive(t.href) ? "border-bone/50 bg-ink-4 text-bone" : "border-line text-bone/55 hover:text-bone",
                    t.href === "/dashboard/pass" && !isActive(t.href) && "border-ember/40 text-ember/90",
                  )}
                  style={cut8}
                >
                  {t.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="chamfer hidden h-10 w-44 items-center gap-2 border border-line-strong bg-ink-3 px-3 text-xs tracking-wider text-bone-faint uppercase transition-colors hover:text-bone 2xl:flex"
                style={cut8}
              >
                <MagnifyingGlassIcon className="size-4" /> Search
                <kbd className="ml-auto border border-line-strong px-1 text-[10px] normal-case">⌘K</kbd>
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <IconButton aria-label="Search the console" onClick={() => setPaletteOpen(true)} className="2xl:hidden">
                    <MagnifyingGlassIcon className="size-4" />
                  </IconButton>
                </TooltipTrigger>
                <TooltipContent>Search (⌘K)</TooltipContent>
              </Tooltip>
              <Notifications />
              <AccountButton className="hidden sm:inline-flex" />
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <button type="button" aria-label="Open navigation" className="inline-flex size-10 items-center justify-center border border-line-strong xl:hidden">
                    <ListIcon className="size-5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="border-line bg-ink p-0 font-mono data-[side=right]:w-[86vw] data-[side=right]:max-w-sm">
                  <SheetHeader className="border-b border-line p-5">
                    <SheetTitle className="text-left font-sans">
                      <Logo />
                    </SheetTitle>
                  </SheetHeader>
                  <nav aria-label="Dashboard mobile" className="flex flex-col p-3">
                    {tabs.map((t) => (
                      <Link
                        key={t.href}
                        href={t.href}
                        onClick={() => setOpen(false)}
                        aria-current={isActive(t.href) ? "page" : undefined}
                        className={cn("border-b border-line px-3 py-4 text-sm tracking-[0.12em] uppercase", isActive(t.href) ? "text-ember" : "text-bone/80")}
                      >
                        {t.label}
                      </Link>
                    ))}
                  </nav>
                  <div className="p-5">
                    <AccountButton className="w-full justify-center" />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-[1680px] px-3 py-5 md:px-6 md:py-6">{children}</main>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </HolderProvider>
  );
}
