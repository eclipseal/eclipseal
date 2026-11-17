import type { Metadata } from "next";
import { Suspense } from "react";
import { AttestationsView } from "@/components/dashboard/attestations-view";

export const metadata: Metadata = { title: "Attestations" };

export default function AttestationsPage() {
  // AttestationsView reads ?id= and ?tab= via useSearchParams, which needs a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <AttestationsView />
    </Suspense>
  );
}
