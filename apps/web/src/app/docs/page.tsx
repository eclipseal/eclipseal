"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRightIcon, ArrowSquareOutIcon, CheckIcon, CopyIcon, MagnifyingGlassIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Skeleton } from "@/components/ui/skeleton";
import type { TokenInfo } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { num } from "@/lib/format";
import { fallbackModels, site } from "@/lib/site";
import { cn } from "@/lib/utils";

type Category = "start" | "architecture" | "developers" | "token" | "reference";
type DocSection = { id: string; category: Category; title: string; summary: string; keywords: string; content: ReactNode };

const groups: { id: Category; label: string }[] = [
  { id: "start", label: "Start here" },
  { id: "architecture", label: "How it works" },
  { id: "developers", label: "Developers" },
  { id: "token", label: "Token & holders" },
  { id: "reference", label: "Reference" },
];

const BASE = `https://${site.domain}`;

/* --------------------------------- pieces --------------------------------- */

const TokenContext = createContext<{ token?: TokenInfo; error?: Error }>({});

const statusStyle = {
  live: "border-signal/50 bg-signal/10 text-signal",
  simulated: "border-ember/50 bg-ember/10 text-ember",
  planned: "border-cobalt-soft/50 bg-cobalt/15 text-cobalt-soft",
} as const;
const statusText = { live: "Live on devnet", simulated: "Simulated on devnet", planned: "Planned" } as const;
type Status = keyof typeof statusStyle;

function Pill({ s }: { s: Status }) {
  return <span className={cn("inline-flex shrink-0 items-center border px-1.5 py-0.5 font-mono text-[10px] tracking-wider uppercase", statusStyle[s])}>{statusText[s]}</span>;
}

function P({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-relaxed text-bone-dim">{children}</p>;
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-bone">{children}</strong>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="border border-line bg-ink-3 px-1 py-px font-mono text-[12px] text-bone">{children}</code>;
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        toast.success("Copied to clipboard");
        setTimeout(() => setCopied(false), 1800);
      },
      () => toast.error("Copy failed. Select the text instead."),
    );
  return (
    <div className="border border-line bg-ink-3">
      <div className="flex items-center justify-between border-b border-line px-4 py-2">
        <span className="font-mono text-[10.5px] tracking-wider text-bone-faint uppercase">{label ?? "Example"}</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 font-mono text-[11px] text-bone-dim transition-colors hover:text-bone">
          {copied ? <CheckIcon className="size-3.5 text-signal" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-bone">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Card({ title, status, children }: { title: string; status?: Status; children: ReactNode }) {
  return (
    <div className="border border-line bg-ink-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-heading text-[15px] font-semibold text-bone">{title}</h3>
        {status && <Pill s={status} />}
      </div>
      <div className="mt-2 text-[13px] leading-relaxed text-bone-dim">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: { title: string; body: ReactNode; status?: Status }[] }) {
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={it.title} className="flex gap-3 border border-line bg-ink-2 p-3.5">
          <span className="font-heading text-sm font-bold text-ember tabular-nums">{String(i + 1).padStart(2, "0")}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-bone">{it.title}</p>
              {it.status && <Pill s={it.status} />}
            </div>
            <div className="mt-0.5 text-[13px] leading-relaxed text-bone-dim">{it.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full text-left text-[12.5px]">
        <thead className="border-b border-line bg-ink-3 font-mono text-[10.5px] tracking-wider text-bone uppercase">
          <tr>
            {head.map((h) => (
              <th key={h} className="p-3 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-ink-2 align-top text-bone-dim">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={cn("p-3", j === 0 && "font-mono whitespace-nowrap text-bone")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({ tone = "ember", children }: { tone?: "ember" | "signal"; children: ReactNode }) {
  return (
    <div className={cn("flex gap-3 border p-4 text-[13px] leading-relaxed", tone === "ember" ? "border-ember/40 bg-ember/5" : "border-signal/40 bg-signal/5")}>
      <WarningCircleIcon className={cn("mt-0.5 size-4 shrink-0", tone === "ember" ? "text-ember" : "text-signal")} />
      <div className="text-bone-dim">{children}</div>
    </div>
  );
}

function ButtonLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex h-9 items-center gap-1.5 border border-line-strong bg-ink-3 px-3.5 font-mono text-[11px] tracking-wide text-bone uppercase transition-colors hover:border-ember hover:text-ember">
      {children} <ArrowRightIcon className="size-3.5" />
    </Link>
  );
}

function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-bone underline decoration-line-strong underline-offset-2 hover:text-ember">
      {children}
    </a>
  );
}

/** Tier table straight from the API, so the docs can never disagree with the console. */
function HolderTiers() {
  const { token, error } = useContext(TokenContext);
  if (!token?.tiers) {
    return error ? (
      <Callout>
        Tiers load from the API and it is not answering right now. The <Link href="/dashboard/pass" className="text-bone underline">Holder pass</Link> page shows them too.
      </Callout>
    ) : (
      <Skeleton className="h-48" />
    );
  }
  return (
    <div className="space-y-3">
      <Table
        head={["Tier", "Hold", "Discount", "LLM requests / day", "Workloads", "GPUs per job"]}
        rows={token.tiers.map((t) => [
          t.label,
          t.minBalance ? `${num(t.minBalance)} $ECLS` : "Any signed-in wallet",
          t.discountPct ? `${t.discountPct}% off` : "List price",
          num(t.llmRequestsPerDay),
          t.maxWorkloads,
          t.maxGpusPerJob,
        ])}
      />
      {token.status !== "live" && token.earlyAccess && (
        <P>
          Before launch there is nothing to hold, so every wallet that signs in gets <B>Early access</B>: {token.earlyAccess.discountPct}% off,{" "}
          {num(token.earlyAccess.llmRequestsPerDay)} LLM requests a day and {token.earlyAccess.maxWorkloads} workloads. After launch the tier follows
          the balance.
        </P>
      )}
    </div>
  );
}

function ContractAddress() {
  const { token } = useContext(TokenContext);
  if (token?.status === "live" && token.address) return <CodeBlock label="Official $ECLS contract on Robinhood Chain" code={token.address} />;
  return (
    <Callout>
      <B>Not launched yet.</B> The contract address will be posted on <Ext href={site.x}>{site.handle}</Ext> and on this page the moment the Pons launch
      confirms. Any address you see before that is not ours. Names and tickers on Pons can be copied; the address is the only identity.
    </Callout>
  );
}

/* -------------------------------- sections -------------------------------- */

const sampleReport = `{
  "version": 1,
  "id": "att_98818b4767b038c7",
  "mode": "simulated",
  "subject": { "type": "cvm", "id": "cvm_46426a32eb3e", "name": "atlas-trader" },
  "appId": "app_12294ec29cf9224d1fc2",
  "tee": { "cpu": "Intel TDX", "gpu": null, "tcbStatus": "UpToDate" },
  "osImage": "eclipseal-os-0.5.4",
  "measurements": { "mrtd": "65c29514…", "rtmr0": "5f7a618c…", "rtmr1": "0b5929e3…", "rtmr2": "1dd3fd00…", "rtmr3": "403b242a…" },
  "composeHash": "edbea107…",
  "imageDigest": "sha256:0e55054d…",
  "nonce": "c8d1ada5…",
  "reportData": "b4e00785…",
  "issuedAt": "2026-10-23T07:01:35.026Z",
  "anchor": { "chainId": 4663, "network": "Robinhood Chain", "txHash": "0x9d2ec578…", "blockNumber": 95753268, "status": "simulated" },
  "signer": { "alg": "Ed25519", "publicKey": "MCowBQYDK2VwAyEA…" },
  "signature": "…"
}`;

const sections: DocSection[] = [
  {
    id: "overview",
    category: "start",
    title: "What is Eclipseal?",
    summary: "Confidential AI compute for Robinhood Chain: run agents, private LLMs and GPU jobs inside hardware enclaves, and prove what ran.",
    keywords: "intro about tee confidential compute robinhood chain",
    content: (
      <div className="space-y-4">
        <P>
          Eclipseal runs AI workloads inside <B>trusted execution environments</B> (TEEs): confidential virtual machines whose memory is encrypted by
          the processor, with keys that never leave the chip. The host operating system, the hypervisor and the cloud operator all stay outside. The
          chip also signs a report of exactly what was loaded, so every run comes with a proof you can check yourself.
        </P>
        <div className="grid gap-3 md:grid-cols-3">
          <Card title="The problem">
            AI clouds can read prompts, model weights and the keys your agents hold. For an agent that trades, that is not a privacy problem, it is a
            custody problem.
          </Card>
          <Card title="The approach">
            Run the workload in a confidential VM (Intel TDX or AMD SEV-SNP), with NVIDIA confidential computing for GPU work. Secrets are sealed to the
            measured workload.
          </Card>
          <Card title="The proof">
            Each run produces a signed attestation report. Anyone can verify it, and its digest is anchored on Robinhood Chain (chain {site.chain.id}).
          </Card>
        </div>
        <P>
          <B>$ECLS</B> is the project token. It trades on <Ext href={site.pons}>Pons</Ext>, the launchpad on Robinhood Chain, and sets your tier in
          the console. Eclipseal is an independent project and is not affiliated with Robinhood Markets, Inc.
        </P>
      </div>
    ),
  },
  {
    id: "devnet-status",
    category: "start",
    title: "Devnet status: what is live and what is simulated",
    summary: "Eclipseal is in devnet. The cryptography and the verifier are real; the TEE hardware behind them is not connected yet.",
    keywords: "devnet simulated real production status hardware testnet",
    content: (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Real today" status="live">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>Attestation reports are canonical JSON signed with Ed25519. Change one byte and verification fails.</li>
              <li>REPORTDATA binds the signer key and a fresh nonce; RTMR3 replays from the app id and compose hash.</li>
              <li>Every chat reply is signed over the request and response hashes.</li>
              <li>The vault seals secrets with AES-256-GCM and a separate HKDF key per app. Plaintext never comes back.</li>
              <li>Wallet sign-in (EIP-4361), API keys and tier limits.</li>
            </ul>
          </Card>
          <Card title="Simulated on devnet" status="simulated">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>No TEE hardware yet: quotes come from a development attestor key, not Intel TDX DCAP or NVIDIA NRAS.</li>
              <li>The Robinhood Chain anchor transaction is computed, not sent.</li>
              <li>The LLM gateway returns templated answers unless an upstream confidential inference provider is configured.</li>
              <li>GPU offers and jobs are simulated.</li>
            </ul>
          </Card>
        </div>
        <Callout>
          Devnet runs on an ordinary server. Do not seal real keys or put private data into it; use test values until workloads run on TEE hardware.
        </Callout>
        <P>
          The path to production: run workloads on TDX hosts with an open TEE runtime such as dstack, verify quotes with Intel DCAP and NVIDIA NRAS,
          deploy the attestation registry contract on Robinhood Chain, and release vault keys only to workloads that pass verification.
        </P>
      </div>
    ),
  },
  {
    id: "getting-started",
    category: "start",
    title: "Getting started",
    summary: "Try the console in five minutes. No tokens and no gas needed.",
    keywords: "quickstart start wallet sign in deploy console tutorial",
    content: (
      <div className="space-y-4">
        <Steps
          items={[
            { title: "Open the console", body: <>The enclave map, network stats and live event stream are public. Nothing to install.</> },
            {
              title: "Connect a wallet",
              body: <>Robinhood Wallet, MetaMask, Rabby or any EVM wallet. The console adds Robinhood Chain ({site.chain.id}) if your wallet does not have it.</>,
            },
            {
              title: "Sign in for free",
              body: <>You sign a short message (EIP-4361). No transaction, no gas, nothing is moved or locked. The session lasts 7 days.</>,
            },
            {
              title: "Deploy a workload",
              body: <>In Agents, paste a docker-compose file, pick a TEE profile, add sealed environment variables and watch the boot log stream.</>,
            },
            {
              title: "Verify its quote",
              body: <>Open Attestations, pick the report, and paste your compose file: the verifier compares its hash with what was measured.</>,
            },
            {
              title: "Ask a sealed model",
              body: <>Use the Private LLM playground or the demo on the home page. Edit one word of the answer and the signature check fails.</>,
            },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/dashboard">Open console</ButtonLink>
          <ButtonLink href="/dashboard/agents">Deploy an agent</ButtonLink>
          <ButtonLink href="/dashboard/attestations">Verify a report</ButtonLink>
        </div>
      </div>
    ),
  },
  {
    id: "products",
    category: "start",
    title: "Products",
    summary: "Agent sandbox, private LLM gateway, confidential GPU jobs, sealed vault and the holder pass.",
    keywords: "agents llm gpu vault pass products features models",
    content: (
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Agent sandbox" status="live">
          Deploy any docker-compose into a confidential VM profile: TDX Small, Medium or Large, SEV-SNP, or TDX with an H100 or H200. Secrets are injected
          as sealed environment variables, and every boot produces a quote that includes your compose hash.
        </Card>
        <Card title="Private LLM gateway" status="live">
          OpenAI-compatible <Code>/v1/chat/completions</Code>, streaming or not, with a signed receipt on every reply. Catalog:{" "}
          {fallbackModels.map((m) => m.name).join(", ")}. Answers are templated on devnet.
        </Card>
        <Card title="Confidential GPU jobs" status="simulated">
          H100, H200 and B300 offers with NVIDIA confidential computing on. Launch fine-tuning or eval jobs with a cost estimate and live progress. Real
          hardware comes with the confidential GPU market.
        </Card>
        <Card title="Sealed vault" status="live">
          Seal API keys and credentials once; the console never shows them again. Planned: release keys only to workloads whose attestation passes.
        </Card>
        <Card title="Holder pass" status="live">
          Your $ECLS balance on Robinhood Chain sets your tier: discounts, daily LLM requests, workloads and GPUs per job. See{" "}
          <a href="#holder-tiers" className="text-bone underline">holder tiers</a>.
        </Card>
        <Card title="On-chain anchoring" status="simulated">
          Report digests anchored on Robinhood Chain so anyone can check what ran and when. On devnet the transaction is computed; on-chain writes start
          with the registry contract.
        </Card>
      </div>
    ),
  },
  {
    id: "use-cases",
    category: "start",
    title: "Use cases",
    summary: "Who Eclipseal is for, and what each of them gets.",
    keywords: "use cases who is it for trading agents private data fine-tune apps verifiable ai audit",
    content: (
      <div className="grid gap-3 md:grid-cols-2">
        <Card title="Trading agents" status="live">
          Keys and strategy stay inside the enclave, out of reach of the host. Every boot comes with a quote you can show the people who trust your agent
          with funds.
        </Card>
        <Card title="Teams with private data" status="simulated">
          Fine-tune or evaluate on data you are not allowed to share. The GPU is attested before your data loads, and checkpoints are sealed to your key.
        </Card>
        <Card title="Apps that need verifiable AI" status="live">
          Call an OpenAI-compatible endpoint and keep the signed receipt of each answer, so your users can check that a reply was not changed on the way.
        </Card>
        <Card title="Anyone checking a claim" status="live">
          Paste a report into the verifier to see what ran, on which image, with which compose file. No account and no wallet needed.
        </Card>
      </div>
    ),
  },
  {
    id: "how-it-works",
    category: "architecture",
    title: "How a sealed run works",
    summary: "From docker-compose to a proof anyone can check, in five steps.",
    keywords: "architecture flow boot measure quote verify anchor tdx",
    content: (
      <div className="space-y-4">
        <Steps
          items={[
            { title: "Deploy", body: <>You send a docker-compose file and sealed environment variables. The compose file is hashed into the <Code>composeHash</Code>.</> },
            {
              title: "Measured boot",
              body: (
                <>
                  The confidential VM boots a known OS image while the hardware records measurements: <Code>MRTD</Code> for the image, <Code>RTMR0</Code>
                  to <Code>RTMR2</Code> for firmware, kernel and boot configuration, <Code>RTMR3</Code> for your app (its app id and compose hash).
                </>
              ),
            },
            { title: "Quote", body: <>The enclave issues a report with those measurements and a fresh nonce bound into <Code>REPORTDATA</Code>, then signs it.</> },
            {
              title: "Verify",
              body: <>Anyone can check the signature, the signer, the TCB status, the image allowlist, the RTMR3 replay and the key binding, and compare the compose hash with their own file.</>,
            },
            { title: "Anchor", status: "simulated", body: <>The report digest is written to Robinhood Chain so the record outlives any server. On devnet the transaction is computed, not sent.</> },
          ]}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Card title="CPU enclaves: Intel TDX, AMD SEV-SNP">
            Confidential VMs whose memory the processor encrypts with keys it never releases. The host OS, the hypervisor and other tenants cannot read it,
            and the processor measures what boots.
          </Card>
          <Card title="GPU enclaves: NVIDIA confidential computing">
            Hopper (H100, H200) and Blackwell GPUs in CC mode. Traffic between the CPU enclave and the GPU is encrypted, GPU memory is walled off from the
            host, and the GPU produces its own attestation, checked against NVIDIA&apos;s attestation service.
          </Card>
        </div>
      </div>
    ),
  },
  {
    id: "attestation-report",
    category: "architecture",
    title: "Anatomy of an attestation report",
    summary: "Every field in an Eclipseal report and what it proves.",
    keywords: "report quote fields mrtd rtmr reportdata nonce compose hash signer signature schema",
    content: (
      <div className="space-y-4">
        <Table
          head={["Field", "What it is"]}
          rows={[
            ["id", "Report id, shareable: anyone can fetch a report by id"],
            ["subject", "What was attested: a workload, model or GPU job, with its id and name"],
            ["appId", "Stable id of the app; part of the RTMR3 measurement"],
            ["tee", "CPU and GPU technology, and the platform TCB status (UpToDate or OutOfDate)"],
            ["osImage", "Name of the OS image that booted"],
            ["measurements.mrtd", "Hash of the initial VM image; must be on the verifier's allowlist"],
            ["measurements.rtmr0-2", "Firmware, kernel and boot configuration"],
            ["measurements.rtmr3", "Your workload: replays from appId and composeHash"],
            ["composeHash", "SHA-256 of your docker-compose file"],
            ["imageDigest", "Digest of the container image"],
            ["nonce, reportData", "Freshness: REPORTDATA commits to the signer key and the nonce"],
            ["anchor", "Robinhood Chain record: chain id, tx hash, block, status"],
            ["signer, signature", "Ed25519 public key and the signature over the canonical report"],
          ]}
        />
        <CodeBlock label="Example report (shortened)" code={sampleReport} />
      </div>
    ),
  },
  {
    id: "verification",
    category: "architecture",
    title: "How verification works",
    summary: "The checks behind a VERIFIED verdict, and how to run them yourself.",
    keywords: "verify verifier checks signature tcb allowlist rtmr3 compose verdict",
    content: (
      <div className="space-y-4">
        <Table
          head={["Check", "Passes when"]}
          rows={[
            ["Report signature", "The Ed25519 signature matches the canonical report digest"],
            ["Trusted attestor", "The signer key is the Eclipseal attestation key"],
            ["TCB status", "The platform reports UpToDate"],
            ["OS image (MRTD)", "MRTD is on the allowlist of known images"],
            ["Workload (RTMR3)", "RTMR3 replays from the app id and compose hash"],
            ["Key binding (REPORTDATA)", "REPORTDATA commits to the signer key and the nonce"],
            ["Compose hash", "Optional: your docker-compose hashes to composeHash"],
            ["Chain anchor", "Devnet shows a warning: the anchor is computed, not on chain yet"],
          ]}
        />
        <P>
          A report is <B>VERIFIED</B> when no check fails. Run it in the console under Attestations, or call the API (see the{" "}
          <a href="#api-attestations" className="text-bone underline">attestation quickstart</a>).
        </P>
      </div>
    ),
  },
  {
    id: "security-model",
    category: "architecture",
    title: "Security model and limits",
    summary: "What a TEE protects, what it does not, and how Eclipseal covers the gaps.",
    keywords: "threat model security limits attack physical side channel risk",
    content: (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Protects against">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>The host OS, the hypervisor and the cloud operator reading enclave memory</li>
              <li>Other tenants on the same machine</li>
              <li>Silent changes to your workload: the measurements change and the quote no longer matches</li>
              <li>Tampered results: the signature check fails</li>
            </ul>
          </Card>
          <Card title="Does not protect against">
            <ul className="list-disc space-y-1.5 pl-4">
              <li>Bugs in your own code: an app that logs or sends out its secrets will still leak them</li>
              <li>Physical attacks on the server. Researchers showed memory-bus interposer attacks on TDX and SEV-SNP in 2025.</li>
              <li>Side channels and firmware flaws until the platform is patched</li>
            </ul>
          </Card>
        </div>
        <P>
          Mitigations: the verifier rejects out-of-date TCBs and unknown images, operators will bond $ECLS that bad quotes can slash, and production
          hardware runs in vetted data centers. On your side: keep secrets in the vault, pin images by digest, and compare the compose hash before you
          trust an output.
        </P>
      </div>
    ),
  },
  {
    id: "api-reference",
    category: "developers",
    title: "API reference",
    summary: `REST and OpenAI-compatible endpoints on ${site.domain}, with authentication and limits.`,
    keywords: "api endpoints rest auth bearer session key rate limit errors sse events",
    content: (
      <div className="space-y-4">
        <P>
          Base URL <Code>{BASE}</Code>. The REST API lives under <Code>/api</Code> and the OpenAI-compatible gateway under <Code>/v1</Code>. Responses are
          JSON; errors look like <Code>{`{ "error": "..." }`}</Code>, and validation errors add an <Code>issues</Code> list.
        </P>
        <div className="grid gap-3 md:grid-cols-3">
          <Card title="No auth">Public reads, the verifier, and the rate-limited demo of the LLM gateway.</Card>
          <Card title="Session">
            Sign in with a wallet: <Code>POST /api/auth/nonce</Code>, sign the message, <Code>POST /api/auth/verify</Code>. Send the{" "}
            <Code>ecls_sess_…</Code> token as <Code>Authorization: Bearer</Code>.
          </Card>
          <Card title="API key">
            Create up to 5 keys in the console under Private LLM. Send <Code>ecls_key_…</Code> as a bearer token to <Code>/v1</Code>; your tier sets the
            daily quota.
          </Card>
        </div>
        <Table
          head={["Endpoint", "Auth", "Purpose"]}
          rows={[
            ["GET /api/health", "None", "Status, attestor public key, simulation modes"],
            ["GET /api/network", "None", "Network stats and history"],
            ["GET /api/chain", "None", "Live Robinhood Chain probe"],
            ["GET /api/token", "None", "$ECLS status, utility and tiers"],
            ["GET /api/tee-profiles, /api/models", "None", "TEE profiles and the model catalog"],
            ["GET /api/cvms, /api/cvms/:id", "Optional", "Workloads: demo ones plus your own"],
            ["POST /api/cvms", "Session", "Deploy a workload"],
            ["POST /api/cvms/:id/actions", "Session", "start, stop, restart or attest"],
            ["GET /api/attestations, /api/attestations/:id", "None", "Latest reports, or one report by id"],
            ["POST /api/attestations/verify", "None", "Verify a report object or reportId, optionally with a compose file"],
            ["POST /api/signatures/verify-chat", "None", "Verify a chat receipt"],
            ["GET /api/gpu/offers, POST /api/gpu/jobs", "None / Session", "GPU offers and jobs"],
            ["GET, POST, DELETE /api/secrets", "Session", "Sealed secrets"],
            ["GET /api/events", "Optional", "Server-sent events: deploys, quotes, GPU progress, chain status"],
            ["GET /v1/models", "None", "OpenAI-compatible model list"],
            ["POST /v1/chat/completions", "Key or demo", "Chat completions with a signed receipt"],
            ["GET /v1/signature/:chatId", "None", "Receipt for a chat"],
            ["GET /v1/attestation/report?model=", "None", "Attestation report for a model"],
          ]}
        />
        <P>
          Rate limits per IP: 600 requests a minute on <Code>/api</Code>, 120 on <Code>/v1</Code>, 40 on <Code>/v1/chat</Code>, 30 on{" "}
          <Code>/api/auth</Code>. Responses carry standard <Code>RateLimit</Code> headers.
        </P>
      </div>
    ),
  },
  {
    id: "api-llm",
    category: "developers",
    title: "Quickstart: private LLM",
    summary: "Point the OpenAI SDK at Eclipseal and verify the receipt that comes back.",
    keywords: "openai sdk python curl chat completions receipt signature headers quota",
    content: (
      <div className="space-y-4">
        <CodeBlock
          label="Python, OpenAI SDK"
          code={`import os
from openai import OpenAI

client = OpenAI(base_url="${BASE}/v1", api_key=os.environ["ECLS_API_KEY"])
reply = client.chat.completions.create(
    model="${fallbackModels[0].id}",
    messages=[{"role": "user", "content": "Hello from the dark"}],
)
print(reply.choices[0].message.content)`}
        />
        <CodeBlock
          label="curl"
          code={`curl ${BASE}/v1/chat/completions \\
  -H "Authorization: Bearer $ECLS_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${fallbackModels[0].id}","messages":[{"role":"user","content":"Hello"}]}'`}
        />
        <P>
          Every reply carries a receipt: the <Code>eclipseal</Code> field in the body (the last chunk when streaming) with <Code>chat_id</Code>,{" "}
          <Code>request_hash</Code>, <Code>response_hash</Code> and <Code>signature</Code>, plus the headers <Code>x-eclipseal-signature</Code> and{" "}
          <Code>x-eclipseal-attestation</Code>. With a key, <Code>x-ecls-quota-limit</Code> and <Code>x-ecls-quota-remaining</Code> show your daily quota.
        </P>
        <CodeBlock
          label="Verify a receipt"
          code={`curl ${BASE}/api/signatures/verify-chat \\
  -H "Content-Type: application/json" \\
  -d '{"model":"<model>","request_hash":"<request_hash>","response":"<the reply text>","signature":"<signature>"}'
# {"valid": true, "response_hash": "..."}`}
        />
      </div>
    ),
  },
  {
    id: "api-attestations",
    category: "developers",
    title: "Quickstart: fetch and verify a report",
    summary: "Three calls: list reports, fetch one, verify it.",
    keywords: "curl attestation verify report compose example",
    content: (
      <div className="space-y-4">
        <CodeBlock
          label="1. List the latest reports"
          code={`curl "${BASE}/api/attestations?limit=5"`}
        />
        <CodeBlock label="2. Fetch one by id" code={`curl ${BASE}/api/attestations/<id>`} />
        <CodeBlock
          label="3. Verify it, optionally against your compose file"
          code={`curl ${BASE}/api/attestations/verify \\
  -H "Content-Type: application/json" \\
  -d '{"reportId":"<id>","compose":"<contents of docker-compose.yml>"}'
# {"valid": true, "verdict": "VERIFIED", "digest": "...", "checks": [...]}`}
        />
        <P>
          You can also send the whole report as <Code>report</Code> instead of <Code>reportId</Code>, which is how you check a report someone handed you.
          Devnet keeps the latest 400 reports.
        </P>
      </div>
    ),
  },
  {
    id: "token-utility",
    category: "token",
    title: "$ECLS utility",
    summary: "What the token does today, and what is planned.",
    keywords: "token ecls utility tokenomics supply buyback staking governance pons",
    content: (
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Card title="Console tiers" status="live">
            Hold $ECLS in the wallet you sign in with and the console reads the balance on Robinhood Chain to set your tier. Nothing is staked or locked.
          </Card>
          <Card title="Pay for compute" status="planned">
            Settle workloads, GPU jobs and inference in $ECLS at a discount.
          </Card>
          <Card title="Operator bonds" status="planned">
            Node operators bond $ECLS to list TEE hardware. Invalid quotes or failed attestations get slashed.
          </Card>
          <Card title="Fee buybacks" status="planned">
            A share of protocol fees buys $ECLS from its Pons pool.
          </Card>
          <Card title="Allowlist votes" status="planned">
            Holders vote on which OS images and GPU firmware the verifier trusts.
          </Card>
          <Card title="Supply and launch">
            Fixed supply of 1,000,000,000 on Pons. Pons launches start on a bonding curve that graduates into a permanently locked Uniswap v4 pool.
          </Card>
        </div>
        <Callout>
          Planned mechanics can change before they ship. $ECLS is an experimental token on a new chain and can lose all of its value. Nothing in these
          docs is financial advice.
        </Callout>
      </div>
    ),
  },
  {
    id: "holder-tiers",
    category: "token",
    title: "Holder tiers",
    summary: "Live from the API: what each balance unlocks in the console.",
    keywords: "tiers holder builder operator visitor early access discount quota perks pass",
    content: (
      <div className="space-y-4">
        <HolderTiers />
        <ButtonLink href="/dashboard/pass">Check your tier</ButtonLink>
      </div>
    ),
  },
  {
    id: "how-to-get",
    category: "token",
    title: "How to get $ECLS",
    summary: "Bridge, open Pons, paste the official address, swap.",
    keywords: "buy swap bridge pons contract address ca wallet",
    content: (
      <div className="space-y-4">
        <Steps
          items={[
            { title: "Get ETH on Robinhood Chain", body: <>Bridge ETH from Ethereum or another network. See the <Ext href={site.chain.bridge}>bridging guide</Ext>.</> },
            { title: "Open Pons", body: <>Go to <Ext href={site.pons}>ponsfamily.com</Ext> and connect your wallet.</> },
            { title: "Paste the official address", body: <>Search by contract address, never by name or ticker.</> },
            { title: "Swap and sign in", body: <>Swap ETH for $ECLS, then sign in to the console with the same wallet to unlock your tier.</> },
          ]}
        />
        <ContractAddress />
      </div>
    ),
  },
  {
    id: "faq",
    category: "reference",
    title: "FAQ",
    summary: "Short answers to the questions we get most.",
    keywords: "faq questions affiliated robinhood investment safe secrets",
    content: (
      <div className="space-y-2">
        {[
          ["Is Eclipseal live?", "The devnet is: the console, the verifier and signed replies work today. TEE hardware, on-chain anchoring and the GPU market come next."],
          [
            "Can Eclipseal or the cloud operator read my data?",
            "On TEE hardware, software outside the enclave cannot read its memory: not the host OS, not the hypervisor, not the operator. Devnet has no TEE hardware yet, so use test values there.",
          ],
          ["Do I need $ECLS to try it?", "No. The demo, the verifier and the console are open. Holding $ECLS lowers prices and raises limits."],
          ["Where do I buy $ECLS?", "Only on Pons, with the official contract address shown on this page. Names and tickers on Pons can be copied; the address can't."],
          ["Is $ECLS an investment?", "No. It is a utility token for an experimental product, and tokens on Pons can lose all value. Nothing here is financial advice."],
          ["Why Robinhood Chain?", "It is an Ethereum L2 (Arbitrum Orbit) with low fees, which makes anchoring every run affordable, and Pons launches tokens there."],
          ["Is Eclipseal affiliated with Robinhood?", "No. Eclipseal is an independent project building on a public, permissionless chain. It is not endorsed by Robinhood Markets, Inc."],
        ].map(([q, a]) => (
          <div key={q} className="border border-line bg-ink-2 p-4">
            <p className="font-semibold text-bone">{q}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-bone-dim">{a}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "glossary",
    category: "reference",
    title: "Glossary",
    summary: "The terms used across Eclipseal.",
    keywords: "glossary terms definitions tee tdx cvm mrtd rtmr tcb dcap nras",
    content: (
      <Table
        head={["Term", "Meaning"]}
        rows={[
          ["TEE", "Trusted execution environment: an isolated part of a processor whose memory outside software cannot read"],
          ["CVM", "Confidential virtual machine: a whole VM running as a TEE"],
          ["Intel TDX, AMD SEV-SNP", "CPU technologies that run confidential VMs"],
          ["NVIDIA CC", "Confidential computing mode on Hopper and Blackwell GPUs"],
          ["Attestation report (quote)", "Signed statement of what is running inside a TEE"],
          ["MRTD", "Measurement of the initial VM image"],
          ["RTMR0-3", "Runtime measurement registers; RTMR3 holds the workload"],
          ["TCB", "Trusted computing base: the firmware and microcode the TEE depends on"],
          ["REPORTDATA", "Field the enclave fills to bind a key and a nonce into the quote"],
          ["DCAP, NRAS", "Intel's and NVIDIA's services and libraries for checking hardware quotes"],
          ["Anchor", "The report digest recorded on Robinhood Chain"],
        ]}
      />
    ),
  },
];

/* ---------------------------------- page ---------------------------------- */

export default function DocsPage() {
  const [tab, setTab] = useState<Category | "all">("all");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState(sections[0].id);
  const { data: token, error } = useApi<TokenInfo>("/api/token");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sections.filter(
      (s) => (tab === "all" || s.category === tab) && (!q || `${s.title} ${s.summary} ${s.keywords}`.toLowerCase().includes(q)),
    );
  }, [tab, search]);

  // Highlight the section being read in the table of contents.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-90px 0px -65% 0px" },
    );
    visible.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [visible]);

  const tabs: { id: Category | "all"; label: string }[] = [{ id: "all", label: "All" }, ...groups];

  return (
    <TokenContext.Provider value={{ token, error }}>
      <div className="min-h-screen bg-ink font-sans text-bone">
        <header className="sticky top-0 z-50 border-b border-line bg-ink/90 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 md:px-8">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-bone" aria-label="Eclipseal home">
                <Logo />
              </Link>
              <span className="hidden border border-line bg-ink-3 px-2 py-0.5 font-mono text-[11px] tracking-wider text-ember uppercase sm:inline-block">Docs</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/#token" className="hidden font-mono text-xs tracking-wider text-bone-dim uppercase transition-colors hover:text-bone sm:inline-block">
                $ECLS on Pons
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-9 items-center bg-bone px-4 font-mono text-xs font-semibold tracking-wide text-ink uppercase transition-colors hover:bg-ember"
              >
                Console <ArrowRightIcon className="ml-1.5 size-3.5" />
              </Link>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1440px] px-4 py-8 md:px-8 md:py-12">
          <div className="border border-line bg-ink-2/60 p-6 backdrop-blur-sm md:p-10">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="micro text-ember">Documentation</p>
                <h1 className="type-display mt-2 text-3xl font-bold tracking-tight text-bone uppercase md:text-5xl">Eclipseal docs</h1>
                <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-bone-dim md:text-base">
                  How sealed compute works, how to verify what ran, how to build on the API, and what $ECLS does. Start with{" "}
                  <a href="#devnet-status" className="text-bone underline">devnet status</a> to see what is live.
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border border-line bg-ink p-4 font-mono text-xs md:w-[300px]">
                <div>
                  <dt className="text-[10px] text-bone-faint">NETWORK</dt>
                  <dd className="mt-0.5 font-semibold text-bone">{site.chain.name}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-bone-faint">CHAIN ID</dt>
                  <dd className="mt-0.5 font-semibold text-ember">{site.chain.id}</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-bone-faint">STAGE</dt>
                  <dd className="mt-0.5 font-semibold text-bone">Devnet</dd>
                </div>
                <div>
                  <dt className="text-[10px] text-bone-faint">$ECLS</dt>
                  <dd className="mt-0.5 font-semibold text-signal">{token?.status === "live" ? "Live on Pons" : "Pre-launch"}</dd>
                </div>
              </dl>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6 lg:flex-row lg:items-center lg:justify-between">
              <label className="relative max-w-md flex-1">
                <span className="sr-only">Search the docs</span>
                <MagnifyingGlassIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-bone-faint" />
                <input
                  type="search"
                  placeholder="Search: tiers, RTMR3, API key, Pons…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full border border-line bg-ink py-2 pr-3 pl-9 font-mono text-xs text-bone placeholder:text-bone-faint focus:border-ember focus:outline-none"
                />
              </label>
              <div role="group" aria-label="Filter docs" className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={tab === t.id}
                    onClick={() => setTab(t.id)}
                    className={cn("px-3 py-1.5 uppercase transition-colors", tab === t.id ? "bg-ember font-semibold text-ink" : "bg-ink-3 text-bone-dim hover:text-bone")}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Phones get the table of contents as a scrollable strip. */}
          <nav aria-label="Sections" className="-mx-4 mt-6 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:hidden">
            {visible.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={cn("shrink-0 border px-3 py-1.5 font-mono text-[11px] whitespace-nowrap", active === s.id ? "border-ember text-ember" : "border-line text-bone-dim")}
              >
                {s.title}
              </a>
            ))}
          </nav>

          <div className="mt-6 grid gap-8 lg:mt-8 lg:grid-cols-[260px_1fr]">
            <aside className="hidden lg:block">
              <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto border border-line bg-ink-2 p-4">
                <nav aria-label="Table of contents" className="space-y-4 font-mono text-xs">
                  {groups.map((g) => {
                    const items = visible.filter((s) => s.category === g.id);
                    if (!items.length) return null;
                    return (
                      <div key={g.id}>
                        <p className="micro border-b border-line pb-1.5 text-bone-faint">{g.label}</p>
                        <div className="mt-1.5 space-y-0.5">
                          {items.map((s) => (
                            <a
                              key={s.id}
                              href={`#${s.id}`}
                              aria-current={active === s.id ? "location" : undefined}
                              className={cn(
                                "block truncate border-l py-1 pl-2.5 transition-colors",
                                active === s.id ? "border-ember text-ember" : "border-transparent text-bone-dim hover:text-bone",
                              )}
                            >
                              {s.title}
                            </a>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </nav>
                <div className="mt-6 space-y-2 border-t border-line pt-4 font-mono text-xs">
                  <a href={site.chain.explorer} target="_blank" rel="noreferrer" className="flex items-center justify-between text-bone-dim hover:text-bone">
                    Blockscout explorer <ArrowSquareOutIcon className="size-3" />
                  </a>
                  <a href={site.pons} target="_blank" rel="noreferrer" className="flex items-center justify-between text-bone-dim hover:text-bone">
                    Pons launchpad <ArrowSquareOutIcon className="size-3" />
                  </a>
                  <a href={site.x} target="_blank" rel="noreferrer" className="flex items-center justify-between text-bone-dim hover:text-bone">
                    {site.handle} on X <ArrowSquareOutIcon className="size-3" />
                  </a>
                </div>
              </div>
            </aside>

            <main className="min-w-0 space-y-6">
              {visible.map((s) => (
                <section key={s.id} id={s.id} className="scroll-mt-24 border border-line bg-ink-2/40 p-5 backdrop-blur-sm md:p-8">
                  <div className="flex items-center justify-between border-b border-line pb-3">
                    <span className="micro font-medium text-ember uppercase">{groups.find((g) => g.id === s.category)?.label}</span>
                    <a href={`#${s.id}`} className="font-mono text-xs text-bone-faint hover:text-bone" aria-label={`Link to ${s.title}`}>
                      #{s.id}
                    </a>
                  </div>
                  <h2 className="mt-4 font-heading text-xl font-bold tracking-tight text-bone md:text-2xl">{s.title}</h2>
                  <p className="mt-1 text-sm text-bone/85">{s.summary}</p>
                  <div className="mt-5 border-t border-line/60 pt-5">{s.content}</div>
                </section>
              ))}

              {visible.length === 0 && (
                <div className="border border-line bg-ink-2 p-12 text-center font-mono">
                  <WarningCircleIcon className="mx-auto size-8 text-bone-faint" />
                  <p className="mt-3 text-sm text-bone">Nothing matches &ldquo;{search}&rdquo;</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setTab("all");
                    }}
                    className="mt-3 text-xs text-ember uppercase underline"
                  >
                    Clear search
                  </button>
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </TokenContext.Provider>
  );
}
