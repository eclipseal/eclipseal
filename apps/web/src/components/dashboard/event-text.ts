import type { HubEvent } from "@/lib/api";
import { num } from "@/lib/format";

export type EventTone = "ember" | "signal" | "cobalt" | "muted";

/** One-line, human description of a control-plane event, shared by the feed and the bell. */
export function describeEvent(e: HubEvent): { tag: string; text: string; tone: EventTone } {
  const d = e.data as Record<string, unknown> & { subject?: { name?: string; type?: string } };
  switch (e.type) {
    case "attestation.created":
      return { tag: "Quote", text: `${d.subject?.name ?? "workload"} attested`, tone: "signal" };
    case "deploy.progress":
      return { tag: "Deploy", text: `${d.name}: ${d.line}`, tone: "ember" };
    case "cvm.status":
      return { tag: "CVM", text: `${d.name} is ${d.status}`, tone: "muted" };
    case "gpu.progress":
      return { tag: "GPU", text: `${d.name} ${d.status} ${Math.round(Number(d.progress ?? 0) * 100)}%`, tone: "cobalt" };
    case "chat.signed":
      return { tag: "LLM", text: `signed reply from ${String(d.model).split("/").pop()}`, tone: "cobalt" };
    case "secret.sealed":
      return { tag: "Vault", text: `${d.name} sealed`, tone: "ember" };
    default:
      return { tag: "Chain", text: d.live ? `block ${num(Number(d.blockNumber))}` : "RPC unreachable, using last known state", tone: "muted" };
  }
}
