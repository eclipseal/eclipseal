import type { Metadata } from "next";
import { VaultView } from "@/components/dashboard/vault-view";

export const metadata: Metadata = { title: "Vault" };

export default function VaultPage() {
  return <VaultView />;
}
