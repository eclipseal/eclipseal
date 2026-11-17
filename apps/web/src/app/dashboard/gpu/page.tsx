import type { Metadata } from "next";
import { GpuView } from "@/components/dashboard/gpu-view";

export const metadata: Metadata = { title: "GPU market" };

export default function GpuPage() {
  return <GpuView />;
}
