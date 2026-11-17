"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowSquareOutIcon, CopyIcon, IdentificationCardIcon, SignOutIcon, SwapIcon, WalletIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useHolder } from "@/lib/wallet";
import { num, short } from "@/lib/format";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

const base =
  "chamfer inline-flex h-10 items-center gap-2 border bg-ink-3 px-3 font-mono text-xs whitespace-nowrap text-bone transition-colors disabled:opacity-60";

/** Header account control: one click connects and signs in; afterwards it shows the wallet and its tier. */
export function AccountButton({ className }: { className?: string }) {
  const holder = useHolder();
  const cut = { "--cut": "8px" } as CSSProperties;

  if (!holder.address) {
    const label = !holder.mounted ? "Connect wallet" : holder.busy === "connect" ? "Approve in wallet" : holder.busy === "sign" ? "Sign in wallet" : "Connect wallet";
    return (
      <button
        type="button"
        onClick={() => void holder.signIn()}
        disabled={!holder.mounted || Boolean(holder.busy)}
        className={cn(base, "border-ember/60 hover:border-ember", className)}
        style={cut}
      >
        <WalletIcon className="size-4 text-ember" />
        {label}
      </button>
    );
  }

  const { me } = holder;
  // The pass carries the checksummed form; the session only has lowercase.
  const address = me?.address ?? holder.address;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(base, "border-line-strong hover:border-bone/60", className)} style={cut} aria-label={`Account ${address}`}>
          <span className={cn("size-1.5 shrink-0", holder.account && !holder.chainOk ? "bg-ember" : "bg-signal")} aria-hidden />
          {short(address, 6, 4)}
          {me && <span className="border-l border-line-strong pl-2 text-[10.5px] tracking-wider text-ember uppercase">{me.tier.label}</span>}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 font-mono text-xs">
        <DropdownMenuLabel className="grid gap-1 py-2 font-normal">
          <span className="text-bone">{short(address, 10, 8)}</span>
          <span className="text-bone-dim">
            {me ? `${me.tier.label} · ${me.balance.amount === null ? (me.token.status === "live" ? "balance unavailable" : "pre-launch") : `${num(me.balance.amount)} $ECLS`}` : "Loading pass"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/dashboard/pass">
            <IdentificationCardIcon /> Holder pass
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void navigator.clipboard
              .writeText(address)
              .then(() => toast.success("Address copied"))
              .catch(() => toast.error("Copy failed"))
          }
        >
          <CopyIcon /> Copy address
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`${site.chain.explorer}/address/${address}`} target="_blank" rel="noreferrer">
            <ArrowSquareOutIcon /> View on Blockscout
          </a>
        </DropdownMenuItem>
        {holder.account && !holder.chainOk && (
          <DropdownMenuItem onSelect={() => void holder.switchChain()}>
            <SwapIcon /> Switch to Robinhood Chain
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => void holder.signOut()}>
          <SignOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
