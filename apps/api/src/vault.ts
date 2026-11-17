import { createCipheriv, hkdfSync, randomBytes, scryptSync } from "node:crypto";
import { config } from "./config.js";
import { id, sha256 } from "./lib/canonical.js";
import type { SealedSecret } from "./types.js";

/**
 * Sealed secrets. In production the per-app key is released by the KMS only to an
 * enclave whose measurements match the app's policy. Here the key is derived from
 * VAULT_MASTER_SECRET with HKDF per app id; plaintext is never stored or returned.
 */
const masterKey = scryptSync(config.vaultMasterSecret, "eclipseal-vault-v1", 32);

function appKey(appId: string | null) {
  return Buffer.from(hkdfSync("sha256", masterKey, Buffer.from(appId ?? "global"), "ecls-secret", 32));
}

export function seal(name: string, value: string, appId: string | null): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", appKey(appId), iv);
  cipher.setAAD(Buffer.from(`${appId ?? "global"}:${name}`));
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    id: id("sec"),
    name,
    appId,
    fingerprint: sha256(value).slice(0, 16),
    bytes: Buffer.byteLength(value),
    sealedAt: new Date().toISOString(),
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/** Public view: everything except the sealed material. */
export function publicSecret(s: SealedSecret) {
  const { ciphertext, iv, tag, ...meta } = s;
  void ciphertext;
  void iv;
  void tag;
  return { ...meta, cipher: "AES-256-GCM", keyRelease: "attestation-gated" };
}
