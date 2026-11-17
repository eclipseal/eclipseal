"use client";

import type { CSSProperties } from "react";
import { WalletIcon } from "@phosphor-icons/react";
import type { HolderMe } from "@/lib/api";
import { useHolder } from "@/lib/wallet";
import { num, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tag } from "./hud";
import { primaryButton } from "./page-header";

export const discounted = (price: number, pct = 0) => (price * (100 - pct)) / 100;

/** Inline sign-in, so a visitor who hits a gated action finishes it without leaving the screen. */
export function SignInGate({ action, className }: { action: string; className?: string }) {
  const holder = useHolder();
  const label = holder.busy === "connect" ? "Approve in your wallet" : holder.busy === "sign" ? "Sign the message in your wallet" : "Connect wallet and sign in";
  return (
    <div className={cn("grid gap-3 border border-ember/40 bg-ember/5 p-4", className)}>
      <div>
        <p className="text-sm text-bone">Sign in with your wallet to {action}.</p>
        <p className="mt-1.5 text-xs leading-relaxed text-bone-dim">
          What you create stays private to your wallet. Holding $ECLS raises your limits and lowers compute prices. Signing is free and sends no transaction.
        </p>
      </div>
      <button
        type="button"
        disabled={Boolean(holder.busy) || !holder.mounted}
        onClick={() => void holder.signIn()}
        className={primaryButton}
        style={{ "--cut": "9px" } as CSSProperties}
      >
        <WalletIcon className="size-4" /> {label}
      </button>
    </div>
  );
}

export function OwnerTag({ owner, viewer }: { owner: string | null; viewer: string | null }) {
  if (owner && owner === viewer) return <Tag tone="signal">Yours</Tag>;
  return <Tag>Demo</Tag>;
}

export function balanceLabel(me: HolderMe) {
  const { amount, source } = me.balance;
  if (source === "pre-launch") return "Token not live yet";
  if (amount === null) return "Balance unavailable";
  return `${num(amount)} $ECLS${source === "dev-override" ? " (devnet)" : ""}`;
}

export function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <span className="text-bone-dim">{label}</span>
        <span className={cn("tabular-nums", pct >= 100 ? "text-danger" : "text-bone")}>
          {num(value)} / {num(max)}
        </span>
      </div>
      <div className="mt-1.5 h-1 bg-line" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <div className={cn("h-1 transition-[width] duration-500", pct >= 100 ? "bg-danger" : "bg-ember")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** List price, struck through when the wallet's tier discount applies. */
export function Price({ value, pct = 0, digits = 2, suffix }: { value: number; pct?: number; digits?: number; suffix?: string }) {
  return (
    <span className="tabular-nums">
      {pct > 0 && <span className="mr-1.5 text-bone-faint line-through">{usd(value, digits)}</span>}
      <span className="text-bone">{usd(discounted(value, pct), digits)}</span>
      {suffix && <span className="text-bone-dim">{suffix}</span>}
    </span>
  );
}
