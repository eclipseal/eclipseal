import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { MARK_CRESCENT, MARK_DOT, WORDMARK_PATH, WORDMARK_VIEWBOX } from "./logo-paths";

const wordmarkRatio = WORDMARK_VIEWBOX.split(" ").slice(2).join(" / ");

/**
 * Eclipse mark: a bone corona with the moon offset until it almost touches the rim,
 * and one ember dot where the light breaks out (the diamond-ring moment).
 * `detail="ui"` enlarges the dot for sizes under ~48px, where the display dot would vanish.
 */
export function LogoMark({
  className,
  title = "Eclipseal",
  detail = "ui",
}: {
  className?: string;
  title?: string;
  detail?: "ui" | "display";
}) {
  const dot = MARK_DOT[detail];
  return (
    <svg viewBox="0 0 64 64" role="img" aria-label={title} className={cn("size-8", className)}>
      <path fill="#e8e4da" fillRule="evenodd" d={MARK_CRESCENT} />
      <circle cx={dot.cx} cy={dot.cy} r={dot.r} fill="#d9732f" />
    </svg>
  );
}

/** The Eclipseal wordmark, drawn in currentColor. Decorative unless a title is given. */
export function Wordmark({ className, title, style }: { className?: string; title?: string; style?: CSSProperties }) {
  return (
    <svg
      viewBox={WORDMARK_VIEWBOX}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("h-3 w-auto fill-current", className)}
      style={{ aspectRatio: wordmarkRatio, ...style }}
    >
      <path fillRule="evenodd" d={WORDMARK_PATH} />
    </svg>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-7" />
      {!compact && <Wordmark className="h-[11px]" />}
    </span>
  );
}
