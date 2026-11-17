import { randomBytes } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { createPublicClient, defineChain, getAddress, http, isAddress, verifyMessage, type Hex } from "viem";
import { createSiweMessage, generateSiweNonce, parseSiweMessage, validateSiweMessage } from "viem/siwe";
import { config } from "./config.js";
import { db, persist, trim } from "./store.js";
import { id, sha256 } from "./lib/canonical.js";
import type { ApiKey, Session } from "./types.js";

/**
 * Wallet sign-in (EIP-4361). The server writes the message, so the domain, chain
 * and nonce cannot be swapped by the client; the nonce is single use and expires
 * after ten minutes. Signing costs nothing and sends no transaction.
 */

export class AuthError extends Error {
  constructor(
    message: string,
    public status = 401,
    public code = "unauthorized",
  ) {
    super(message);
  }
}

export type Viewer = { address: string; sessionId: string };

const NONCE_TTL_MS = 10 * 60_000;
const nonces = new Map<string, { address: string; expiresAt: number }>();

const chain = defineChain({
  id: config.chain.id,
  name: config.chain.name,
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [config.chain.rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http(config.chain.rpcUrl, { timeout: 6000 }) });

/** The web origin the user is signing in to; must be one the API already trusts for CORS. */
function siteOf(req: Request) {
  const origin = req.get("origin");
  const url = new URL(origin && config.corsOrigins.includes(origin) ? origin : config.corsOrigins[0]);
  return { domain: url.host, uri: url.origin };
}

function sweep() {
  const now = Date.now();
  for (const [nonce, entry] of nonces) if (entry.expiresAt < now) nonces.delete(nonce);
  const before = db.sessions.length;
  db.sessions = db.sessions.filter((s) => Date.parse(s.expiresAt) > now);
  if (db.sessions.length !== before) persist();
}

export function issueNonce(address: string, req: Request) {
  if (!isAddress(address, { strict: false })) throw new AuthError("That is not a wallet address.", 400, "bad_address");
  sweep();
  const checksummed = getAddress(address);
  const nonce = generateSiweNonce();
  const issuedAt = new Date();
  const expirationTime = new Date(issuedAt.getTime() + NONCE_TTL_MS);
  const message = createSiweMessage({
    ...siteOf(req),
    address: checksummed,
    chainId: config.chain.id,
    nonce,
    version: "1",
    issuedAt,
    expirationTime,
    statement: "Sign in to Eclipseal. This proves you own this wallet. It does not send a transaction or cost gas.",
  });
  nonces.set(nonce, { address: checksummed.toLowerCase(), expiresAt: expirationTime.getTime() });
  return { message, expiresAt: expirationTime.toISOString() };
}

export async function verifySignIn(message: string, signature: Hex, req: Request) {
  const fields = parseSiweMessage(message);
  const entry = fields.nonce ? nonces.get(fields.nonce) : undefined;
  // Single use: the nonce is burned before anything else is checked.
  if (fields.nonce) nonces.delete(fields.nonce);
  if (!entry || !fields.address || entry.expiresAt < Date.now()) {
    throw new AuthError("This sign-in request expired. Start again.", 401, "nonce_expired");
  }
  const address = fields.address;
  const valid =
    entry.address === address.toLowerCase() &&
    fields.chainId === config.chain.id &&
    validateSiweMessage({ message: fields, domain: siteOf(req).domain, nonce: fields.nonce, address });
  if (!valid) throw new AuthError("The sign-in message does not match this site.", 401, "bad_message");

  let signed = await verifyMessage({ address, message, signature }).catch(() => false);
  // Smart-contract wallets (EIP-1271 / 6492) are checked on chain.
  if (!signed) signed = await client.verifyMessage({ address, message, signature }).catch(() => false);
  if (!signed) throw new AuthError("The signature does not match this wallet.", 401, "bad_signature");

  const token = `ecls_sess_${randomBytes(32).toString("base64url")}`;
  const now = Date.now();
  const session: Session = {
    id: id("ses"),
    tokenHash: sha256(token),
    address: address.toLowerCase(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + config.holders.sessionDays * 86_400_000).toISOString(),
  };
  db.sessions.push(session);
  trim(db.sessions, 5000);
  persist();
  return { token, session };
}

export function endSession(sessionId: string) {
  db.sessions = db.sessions.filter((s) => s.id !== sessionId);
  persist();
}

function sessionFor(token: string): Session | null {
  if (!token.startsWith("ecls_sess_")) return null;
  const hash = sha256(token);
  const session = db.sessions.find((s) => s.tokenHash === hash);
  return session && Date.parse(session.expiresAt) > Date.now() ? session : null;
}

function keyFor(token: string): ApiKey | null {
  if (!token.startsWith("ecls_key_")) return null;
  const hash = sha256(token);
  return db.apiKeys.find((k) => k.hash === hash) ?? null;
}

const bearer = (req: Request) => req.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";

/**
 * Optional auth for /api: no header means a visitor. A header that no longer
 * matches a session is rejected, so an expired tab never acts as someone else.
 */
export function attachViewer(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) return next();
  const session = sessionFor(token);
  if (!session) {
    res.status(401).json({ error: "Your session expired. Sign in again.", code: "session_expired" });
    return;
  }
  res.locals.viewer = { address: session.address, sessionId: session.id } satisfies Viewer;
  next();
}

export const viewerOf = (res: Response) => (res.locals.viewer as Viewer | undefined) ?? null;

export function requireViewer(res: Response, action: string): Viewer | null {
  const viewer = viewerOf(res);
  if (!viewer) res.status(401).json({ error: `Connect your wallet and sign in to ${action}.`, code: "sign_in_required" });
  return viewer;
}

/** EventSource cannot send headers, so the stream takes the session as a query parameter. */
export const viewerFromToken = (token: unknown) => (typeof token === "string" ? sessionFor(token)?.address : undefined) ?? null;

/** Gateway auth: a session (console playground) or an API key (apps, SDKs). Undefined means anonymous. */
export function gatewayCaller(req: Request): { address: string; keyId: string | null } | null | undefined {
  const token = bearer(req);
  if (!token) return undefined;
  const session = sessionFor(token);
  if (session) return { address: session.address, keyId: null };
  const key = keyFor(token);
  if (!key) return null;
  key.lastUsedAt = new Date().toISOString();
  return { address: key.address, keyId: key.id };
}

/* -------------------------------- API keys -------------------------------- */

export const publicKey = ({ hash, ...meta }: ApiKey) => {
  void hash;
  return meta;
};

export function createApiKey(address: string, name: string) {
  const owned = db.apiKeys.filter((k) => k.address === address);
  if (owned.length >= config.holders.maxApiKeys) {
    throw new AuthError(`You can keep up to ${config.holders.maxApiKeys} keys. Revoke one first.`, 409, "key_limit");
  }
  const secret = `ecls_key_${randomBytes(24).toString("base64url")}`;
  const key: ApiKey = {
    id: id("key"),
    address,
    name,
    prefix: `${secret.slice(0, 13)}…${secret.slice(-4)}`,
    hash: sha256(secret),
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
  };
  db.apiKeys.push(key);
  persist();
  return { secret, key: publicKey(key) };
}

export function revokeApiKey(address: string, keyId: string) {
  const before = db.apiKeys.length;
  db.apiKeys = db.apiKeys.filter((k) => !(k.id === keyId && k.address === address));
  if (db.apiKeys.length === before) return false;
  persist();
  return true;
}

/* ---------------------------------- usage --------------------------------- */

const dayKey = () => new Date().toISOString().slice(0, 10);

export function llmUsedToday(address: string) {
  const date = dayKey();
  return db.usage.find((u) => u.address === address && u.date === date)?.llmRequests ?? 0;
}

export function countLlmRequest(address: string) {
  const date = dayKey();
  let row = db.usage.find((u) => u.address === address && u.date === date);
  if (!row) {
    row = { address, date, llmRequests: 0 };
    db.usage.push(row);
    trim(db.usage, 10_000);
  }
  row.llmRequests += 1;
  persist();
}
