import fs from "node:fs";
import path from "node:path";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  sign,
  verify,
  createHash,
  type KeyObject,
} from "node:crypto";
import { config } from "./config.js";
import { canonicalize, id, sha256, sha384 } from "./lib/canonical.js";
import { currentOsImage, trustedOsImages } from "./catalog.js";
import type {
  AttestationReport,
  AttestationSubject,
  Measurements,
  VerifyCheck,
  VerifyResult,
} from "./types.js";

/**
 * Development attestor.
 *
 * Real deployments get quotes from Intel TDX (DCAP) and NVIDIA NRAS. This module
 * reproduces the same verification surface (measurement registers, report data
 * binding, signed report, compose hash) with an Ed25519 key so the full
 * "prove what ran" flow can be exercised without TEE hardware.
 */

type KeyFile = { privateKeyPem: string; createdAt: string };

function loadOrCreateKey(): KeyObject {
  const file = path.join(config.dataDir, "attestor-key.json");
  try {
    const { privateKeyPem } = JSON.parse(fs.readFileSync(file, "utf8")) as KeyFile;
    return createPrivateKey(privateKeyPem);
  } catch {
    const { privateKey } = generateKeyPairSync("ed25519");
    fs.mkdirSync(config.dataDir, { recursive: true });
    const keyFile: KeyFile = {
      privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(file, JSON.stringify(keyFile, null, 2), { mode: 0o600 });
    return privateKey;
  }
}

const privateKey = loadOrCreateKey();
const publicKey = createPublicKey(privateKey);
const publicKeyDer = publicKey.export({ format: "der", type: "spki" });
export const attestorPublicKey = publicKeyDer.toString("base64");

const TEE_TYPE = { "Intel TDX": 0x81, "AMD SEV-SNP": 0x02 } as const;

export function measure(osImage: string, appId: string, composeHash: string): Measurements {
  return {
    mrtd: sha384(`mrtd:${osImage}`),
    rtmr0: sha384(`rtmr0:ovmf-edk2-stable202508:${osImage}`),
    rtmr1: sha384(`rtmr1:linux-6.12-tdx:${osImage}`),
    rtmr2: sha384(`rtmr2:cmdline+initramfs:${osImage}`),
    rtmr3: sha384(`rtmr3:app-id=${appId};compose-hash=${composeHash};key-provider=kms`),
  };
}

const trustedMrtds = new Set(trustedOsImages.map((img) => sha384(`mrtd:${img}`)));

function reportDataFor(nonce: string) {
  return createHash("sha512").update(publicKeyDer).update(Buffer.from(nonce, "hex")).digest("hex");
}

function buildQuote(cpu: string, m: Measurements, reportData: string, nonce: string) {
  const header = Buffer.alloc(8);
  header.write("ECLQ", 0, "ascii");
  header.writeUInt16BE(1, 4);
  header.writeUInt16BE(TEE_TYPE[cpu as keyof typeof TEE_TYPE] ?? 0x81, 6);
  return Buffer.concat([
    header,
    ...[m.mrtd, m.rtmr0, m.rtmr1, m.rtmr2, m.rtmr3].map((h) => Buffer.from(h, "hex")),
    Buffer.from(reportData, "hex"),
    Buffer.from(nonce, "hex"),
  ]).toString("base64");
}

type Unsigned = Omit<AttestationReport, "signature">;

function digestOf(report: Unsigned) {
  return sha256(canonicalize(report));
}

export function createReport(input: {
  subject: AttestationSubject;
  appId: string;
  cpu: string;
  gpu: string | null;
  composeHash: string;
  imageDigest: string;
  osImage?: string;
  blockNumber: number | null;
}): AttestationReport {
  const osImage = input.osImage ?? currentOsImage;
  const nonce = randomBytes(32).toString("hex");
  const measurements = measure(osImage, input.appId, input.composeHash);
  const reportData = reportDataFor(nonce);
  const reportId = id("att", 8);
  const unsigned: Unsigned = {
    version: 1,
    id: reportId,
    mode: "simulated",
    subject: input.subject,
    appId: input.appId,
    tee: { cpu: input.cpu, gpu: input.gpu, tcbStatus: "UpToDate" },
    osImage,
    measurements,
    composeHash: input.composeHash,
    imageDigest: input.imageDigest,
    nonce,
    reportData,
    quote: buildQuote(input.cpu, measurements, reportData, nonce),
    issuedAt: new Date().toISOString(),
    anchor: {
      chainId: config.chain.id,
      network: config.chain.name,
      txHash: `0x${sha256(`anchor:${reportId}:${input.composeHash}`)}`,
      blockNumber: input.blockNumber,
      status: "simulated",
    },
    signer: { alg: "Ed25519", publicKey: attestorPublicKey },
  };
  const signature = sign(null, Buffer.from(digestOf(unsigned), "hex"), privateKey).toString("base64");
  return { ...unsigned, signature };
}

export function signText(text: string) {
  return sign(null, Buffer.from(text, "utf8"), privateKey).toString("base64");
}

function publicKeyFrom(b64: string) {
  return createPublicKey({ key: Buffer.from(b64, "base64"), format: "der", type: "spki" });
}

export function verifyText(text: string, signatureB64: string, publicKeyB64 = attestorPublicKey) {
  try {
    return verify(null, Buffer.from(text, "utf8"), publicKeyFrom(publicKeyB64), Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

export function verifyReport(report: AttestationReport, opts: { compose?: string } = {}): VerifyResult {
  const checks: VerifyCheck[] = [];
  const { signature, ...unsigned } = report;
  const digest = digestOf(unsigned as Unsigned);

  let sigOk = false;
  try {
    sigOk = verify(
      null,
      Buffer.from(digest, "hex"),
      publicKeyFrom(report.signer.publicKey),
      Buffer.from(signature, "base64"),
    );
  } catch {
    sigOk = false;
  }
  checks.push({
    id: "signature",
    label: "Report signature",
    status: sigOk ? "pass" : "fail",
    detail: sigOk ? "Ed25519 signature matches the report digest." : "Signature does not match the report body.",
  });

  const trustedSigner = report.signer.publicKey === attestorPublicKey;
  checks.push({
    id: "signer",
    label: "Trusted attestor",
    status: trustedSigner ? "pass" : "fail",
    detail: trustedSigner ? "Signed by the Eclipseal attestation service key." : "Signer key is not in the trust list.",
  });

  const tcbOk = report.tee.tcbStatus === "UpToDate";
  checks.push({
    id: "tcb",
    label: "TCB status",
    status: tcbOk ? "pass" : "fail",
    detail: `Platform TCB reported as ${report.tee.tcbStatus}.`,
  });

  const mrtdOk = trustedMrtds.has(report.measurements.mrtd);
  checks.push({
    id: "mrtd",
    label: "OS image (MRTD)",
    status: mrtdOk ? "pass" : "fail",
    detail: mrtdOk ? `MRTD matches the allowlisted image ${report.osImage}.` : "MRTD is not in the allowlist.",
  });

  const rtmr3Ok = measure(report.osImage, report.appId, report.composeHash).rtmr3 === report.measurements.rtmr3;
  checks.push({
    id: "rtmr3",
    label: "Workload measurement (RTMR3)",
    status: rtmr3Ok ? "pass" : "fail",
    detail: rtmr3Ok
      ? "RTMR3 replays to the recorded app id and compose hash."
      : "RTMR3 does not match the recorded workload.",
  });

  const bindingOk = reportDataFor(report.nonce) === report.reportData && report.signer.publicKey === attestorPublicKey;
  checks.push({
    id: "report-data",
    label: "Key binding (REPORTDATA)",
    status: bindingOk ? "pass" : "fail",
    detail: bindingOk ? "REPORTDATA commits to the signer key and nonce." : "REPORTDATA does not bind the signer key.",
  });

  if (opts.compose !== undefined) {
    const ok = sha256(opts.compose) === report.composeHash;
    checks.push({
      id: "compose",
      label: "Compose hash",
      status: ok ? "pass" : "fail",
      detail: ok ? "Your docker-compose matches what ran." : "Compose file differs from the measured workload.",
    });
  } else {
    checks.push({
      id: "compose",
      label: "Compose hash",
      status: "skip",
      detail: "Provide the compose file to compare it with the measured hash.",
    });
  }

  checks.push({
    id: "anchor",
    label: "Robinhood Chain anchor",
    status: "warn",
    detail: "Devnet anchor (simulated). Production writes the report digest to the registry contract on chain 4663.",
  });

  const valid = checks.every((c) => c.status !== "fail");
  return { valid, verdict: valid ? "VERIFIED" : "FAILED", digest, checks };
}
