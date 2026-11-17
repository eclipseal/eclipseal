import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentsView } from "@/components/dashboard/agents-view";

export const metadata: Metadata = { title: "Agent sandbox" };

export default function AgentsPage() {
  // AgentsView reads ?deploy=1 via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AgentsView />
    </Suspense>
  );
}
