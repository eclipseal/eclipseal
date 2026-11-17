"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ListIcon } from "@phosphor-icons/react";
import { Logo } from "@/components/brand/logo";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollTrigger, useGSAP } from "@/lib/gsap";
import { cn } from "@/lib/utils";

const links = [
  { href: "#products", label: "Products" },
  { href: "#proof", label: "Proof" },
  { href: "#try", label: "Try it" },
  { href: "#token", label: "$ECLS" },
  { href: "/docs", label: "Docs" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const nav = useRef<HTMLElement>(null);
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);

  useGSAP(() => {
    ScrollTrigger.create({
      trigger: "#manifesto",
      start: "top 80px",
      onToggle: (self) => setSolid(self.isActive || self.progress > 0),
      onLeaveBack: () => setSolid(false),
      end: "max",
    });
  });

  return (
    <header
      ref={nav}
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-500",
        solid ? "border-b border-line bg-ink/85 backdrop-blur-md" : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 md:px-8" aria-label="Main">
        <Link href="/" aria-label="Eclipseal home" className="text-bone">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-8 text-[13px] font-medium tracking-wide text-bone/75 uppercase md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="transition-colors hover:text-bone">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="hidden h-10 items-center bg-bone px-4 text-[13px] font-semibold tracking-wide text-ink uppercase transition-colors hover:bg-ember sm:inline-flex"
          >
            Launch app
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                className="inline-flex size-10 items-center justify-center border border-line-strong text-bone md:hidden"
                aria-label="Open menu"
              >
                <ListIcon className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="border-line bg-ink p-0 data-[side=right]:w-[84vw] data-[side=right]:max-w-sm">
              <SheetHeader className="border-b border-line p-5">
                <SheetTitle className="text-left">
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <ul className="flex flex-col p-5">
                {links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className="type-wide block border-b border-line py-4 text-2xl text-bone"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
              <div className="px-5">
                <Link
                  href="/dashboard"
                  className="flex h-12 items-center justify-center bg-ember text-sm font-semibold tracking-wide text-ink uppercase"
                >
                  Launch app
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
