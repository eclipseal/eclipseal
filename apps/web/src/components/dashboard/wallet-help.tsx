"use client";

import type { CSSProperties } from "react";
import { ArrowSquareOutIcon, CopyIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/lib/hooks";
import { primaryButton } from "./page-header";

/** Shown when the browser has no injected wallet: install one on desktop, or open the page inside a wallet app on a phone. */
export function WalletHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const mobile = useIsMobile();
  const url = typeof window === "undefined" ? "" : window.location.href;
  const metamask = `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}`;

  function copy() {
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success("Link copied. Paste it into your wallet's browser."))
      .catch(() => toast.error("Copy failed. Long-press the address bar to copy the link."));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-line-strong bg-ink-2 font-mono sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm tracking-[0.14em] uppercase">Connect a wallet</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-bone-dim">
            {mobile
              ? "Phone browsers cannot reach wallet apps. Open Eclipseal inside your wallet's own browser, then sign in there."
              : "No browser wallet was found. Install one, add Robinhood Chain, then reload this page."}
          </DialogDescription>
        </DialogHeader>
        {mobile ? (
          <div className="grid gap-2">
            <a href={metamask} className={primaryButton} style={{ "--cut": "9px" } as CSSProperties}>
              Open in MetaMask <ArrowSquareOutIcon className="size-4" />
            </a>
            <button type="button" onClick={copy} className="inline-flex h-11 items-center justify-center gap-2 border border-line-strong text-xs tracking-wider text-bone uppercase">
              <CopyIcon className="size-4" /> Copy link for another wallet
            </button>
            <p className="mt-1 text-[11.5px] leading-relaxed text-bone-faint">Robinhood Wallet, Rabby and Coinbase Wallet all have a built-in browser: paste the link there.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {[
              ["MetaMask", "https://metamask.io/download/"],
              ["Rabby", "https://rabby.io/"],
            ].map(([name, href]) => (
              <a
                key={name}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex h-11 items-center justify-between border border-line-strong px-3 text-xs tracking-wider text-bone uppercase transition-colors hover:border-bone/60"
              >
                Install {name} <ArrowSquareOutIcon className="size-4 text-bone-dim" />
              </a>
            ))}
            <p className="mt-1 text-[11.5px] leading-relaxed text-bone-faint">Already use Robinhood Wallet on your phone? Open this page in its browser instead.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
