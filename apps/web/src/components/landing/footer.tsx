"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogoMark } from "@/components/brand/logo";
import { api, ApiError } from "@/lib/api";
import { site } from "@/lib/site";

export function Footer() {
  const [contact, setContact] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    try {
      const res = await api<{ position: number }>("/api/waitlist", { method: "POST", json: { contact } });
      setState("done");
      toast.success(`You are on the list, position ${res.position}.`);
    } catch (err) {
      setState("idle");
      setError(err instanceof ApiError ? err.message.replace(/^contact: /, "") : "Something went wrong.");
    }
  }

  return (
    <footer className="relative overflow-hidden border-t border-line bg-ink">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-4 pt-20 pb-10 md:grid-cols-[minmax(0,6fr)_minmax(0,6fr)] md:px-8 md:pt-28">
        <div>
          <h2 className="type-wide max-w-[18ch] text-3xl leading-tight text-bone md:text-5xl">Get first access to the GPU enclaves</h2>
          {state === "done" ? (
            <p className="mt-8 text-base text-signal">Thanks. We will reach out before public launch.</p>
          ) : (
            <form onSubmit={join} className="mt-8 grid max-w-md gap-2" noValidate>
              <Label htmlFor="wl" className="text-sm text-bone-dim">
                Email or X handle
              </Label>
              <div className="flex gap-2">
                <Input
                  id="wl"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="you@studio.xyz or @handle"
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "wl-error" : undefined}
                  className="h-12 flex-1 border-line-strong bg-ink-2 text-base placeholder:text-bone-faint"
                />
                <button
                  type="submit"
                  disabled={state === "sending" || contact.trim().length < 3}
                  className="h-12 shrink-0 bg-bone px-5 text-sm font-semibold tracking-wide text-ink uppercase transition-colors hover:bg-ember disabled:opacity-50"
                >
                  {state === "sending" ? "Joining" : "Join the list"}
                </button>
              </div>
              {error && (
                <p id="wl-error" className="text-sm text-danger">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-3 md:justify-self-end">
          <div className="space-y-3">
            <p className="micro text-bone-faint">Product</p>
            <Link href="/dashboard" className="block text-bone/80 hover:text-bone">Dashboard</Link>
            <Link href="/dashboard/models" className="block text-bone/80 hover:text-bone">Private LLM</Link>
            <Link href="/dashboard/gpu" className="block text-bone/80 hover:text-bone">GPU market</Link>
            <Link href="/dashboard/attestations" className="block text-bone/80 hover:text-bone">Verifier</Link>
          </div>
          <div className="space-y-3">
            <p className="micro text-bone-faint">Chain</p>
            <a href={site.chain.explorer} target="_blank" rel="noreferrer" className="block text-bone/80 hover:text-bone">Blockscout</a>
            <a href={site.chain.bridge} target="_blank" rel="noreferrer" className="block text-bone/80 hover:text-bone">Bridge</a>
            <a href={site.pons} target="_blank" rel="noreferrer" className="block text-bone/80 hover:text-bone">Pons</a>
          </div>
          <div className="space-y-3">
            <p className="micro text-bone-faint">Social</p>
            <a href={site.x} target="_blank" rel="noreferrer" className="block text-bone/80 hover:text-bone">X</a>
            <a href="#faq" className="block text-bone/80 hover:text-bone">FAQ</a>
          </div>
        </nav>
      </div>
      <div className="relative px-2 md:px-4" aria-hidden>
        <p className="type-display ink-distress -mb-[0.1em] text-center text-[10.2vw] leading-none whitespace-nowrap select-none">Eclipseal</p>
      </div>
      <div className="flex flex-col items-start justify-between gap-3 border-t border-line px-4 py-5 text-xs text-bone-faint md:flex-row md:items-center md:px-8">
        <span className="flex items-center gap-2">
          <LogoMark className="size-4" /> Eclipseal. Independent project, not affiliated with Robinhood Markets, Inc.
        </span>
        <span>Built on Robinhood Chain, chain id 4663.</span>
      </div>
    </footer>
  );
}
