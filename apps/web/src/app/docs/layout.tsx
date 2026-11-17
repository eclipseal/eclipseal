import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Docs",
  description: "How Eclipseal seals AI workloads in TEEs, how to verify what ran, the API, and what $ECLS does.",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return children;
}
