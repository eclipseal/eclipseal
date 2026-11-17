"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Confirmation for actions that cannot be undone. Stays open (and busy) until the action settles. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  dismissLabel = "Cancel",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  dismissLabel?: string;
  /** Resolve false to keep the dialog open (the caller has already reported the error). */
  onConfirm: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    const done = await onConfirm().catch(() => false);
    setBusy(false);
    if (done) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="border-line-strong bg-ink-2 font-mono sm:max-w-md" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle className="text-sm tracking-[0.14em] uppercase">{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-xs leading-relaxed text-bone-dim">{body}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="h-11 border border-line-strong px-4 text-xs tracking-wider text-bone uppercase transition-colors hover:border-bone/60 disabled:opacity-50"
          >
            {dismissLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className={cn("chamfer h-11 bg-danger px-4 text-xs font-semibold tracking-wider text-ink uppercase disabled:opacity-60")}
            style={{ "--cut": "8px" } as CSSProperties}
          >
            {busy ? "Working" : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
