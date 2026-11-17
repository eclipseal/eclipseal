import type { Metadata } from "next";
import { ModelsView } from "@/components/dashboard/models-view";

export const metadata: Metadata = { title: "Private LLM" };

export default function ModelsPage() {
  return <ModelsView />;
}
