import type { Metadata } from "next";
import { PassView } from "@/components/dashboard/pass-view";

export const metadata: Metadata = { title: "Holder pass" };

export default function PassPage() {
  return <PassView />;
}
