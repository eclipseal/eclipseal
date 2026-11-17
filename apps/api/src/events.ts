import type { Response } from "express";

export type HubEvent = {
  id: number;
  type:
    | "deploy.progress"
    | "cvm.status"
    | "attestation.created"
    | "gpu.progress"
    | "chat.signed"
    | "secret.sealed"
    | "chain.status";
  at: string;
  data: Record<string, unknown>;
  replay?: boolean;
  /** Set on a wallet's own stream for events about its private resources. */
  mine?: boolean;
};

/** Events about a wallet's private resources only reach that wallet's streams. */
type Entry = { event: HubEvent; owner: string | null };

const clients = new Map<Response, string | null>();
const recent: Entry[] = [];
let seq = 0;

const frame = (event: HubEvent) => `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
const visibleTo = (entry: Entry, viewer: string | null) => !entry.owner || entry.owner === viewer;
const tagged = (entry: Entry, viewer: string | null): HubEvent => (viewer && entry.owner === viewer ? { ...entry.event, mine: true } : entry.event);

export function emit(type: HubEvent["type"], data: Record<string, unknown>, owner: string | null = null) {
  const event: HubEvent = { id: ++seq, type, at: new Date().toISOString(), data };
  const entry = { event, owner };
  recent.push(entry);
  if (recent.length > 120) recent.shift();
  for (const [res, viewer] of clients) if (visibleTo(entry, viewer)) res.write(frame(tagged(entry, viewer)));
  return event;
}

export function recentEvents(limit = 30, viewer: string | null = null) {
  return recent
    .filter((e) => visibleTo(e, viewer))
    .slice(-limit)
    .map((e) => tagged(e, viewer));
}

export function subscribe(res: Response, viewer: string | null) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`retry: 3000\n\n`);
  // Replayed history is flagged so clients can show it without counting it as new.
  for (const event of recentEvents(20, viewer)) res.write(frame({ ...event, replay: true }));
  clients.set(res, viewer);
  const keepAlive = setInterval(() => res.write(`: ping\n\n`), 15_000);
  res.on("close", () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}
