import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { Db } from "./types.js";

const file = path.join(config.dataDir, "db.json");

const empty = (): Db => ({
  cvms: [],
  gpuJobs: [],
  attestations: [],
  secrets: [],
  chats: [],
  waitlist: [],
  history: [],
  counters: { attestationsAllTime: 0 },
  sessions: [],
  apiKeys: [],
  usage: [],
  attestationOwners: {},
});

function load(): { db: Db; fresh: boolean } {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return { db: { ...empty(), ...(JSON.parse(raw) as Partial<Db>) }, fresh: false };
  } catch {
    return { db: empty(), fresh: true };
  }
}

const loaded = load();
export const db: Db = loaded.db;
export const isFreshStore = loaded.fresh;

let timer: NodeJS.Timeout | null = null;

/** Debounced write; the API is the single writer so a whole-file snapshot is enough. */
export function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    fs.mkdirSync(config.dataDir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }, 400);
}

export function trim<T>(list: T[], max: number) {
  if (list.length > max) list.splice(0, list.length - max);
}
