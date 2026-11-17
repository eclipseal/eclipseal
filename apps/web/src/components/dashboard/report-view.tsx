"use client";

import { useState } from "react";
import { CheckCircleIcon, SealCheckIcon, WarningCircleIcon, XCircleIcon } from "@phosphor-icons/react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { api, ApiError, type AttestationReport, type VerifyResult } from "@/lib/api";
import { site } from "@/lib/site";
import { short } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tag } from "./hud";

export function MeasurementTable({ report }: { report: AttestationReport }) {
  const rows: [string, string][] = [
    ["MRTD", report.measurements.mrtd],
    ["RTMR0", report.measurements.rtmr0],
    ["RTMR1", report.measurements.rtmr1],
    ["RTMR2", report.measurements.rtmr2],
    ["RTMR3", report.measurements.rtmr3],
    ["Compose", report.composeHash],
    ["Image", report.imageDigest],
    ["REPORTDATA", report.reportData],
  ];
  return (
    <dl className="divide-y divide-line border border-line font-mono text-[11px]">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[88px_1fr] gap-3 px-3 py-2">
          <dt className="text-bone-faint">{k}</dt>
          <dd className="break-all text-bone/85">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function VerifyChecks({ result }: { result: VerifyResult }) {
  return (
    <div className={cn("border p-3", result.valid ? "border-signal/40 bg-signal/5" : "border-danger/40 bg-danger/5")}>
      <p className={cn("flex items-center gap-2 font-mono text-xs tracking-wider uppercase", result.valid ? "text-signal" : "text-danger")}>
        {result.valid ? <SealCheckIcon className="size-4" weight="fill" /> : <XCircleIcon className="size-4" weight="fill" />}
        {result.verdict}
        <span className="ml-auto text-bone-faint normal-case">digest {short(result.digest, 8, 6)}</span>
      </p>
      <ul className="mt-3 space-y-2">
        {result.checks.map((c) => (
          <li key={c.id} className="grid grid-cols-[18px_1fr] gap-2 text-[12px]">
            {c.status === "pass" && <CheckCircleIcon className="mt-0.5 size-4 text-signal" weight="fill" />}
            {c.status === "fail" && <XCircleIcon className="mt-0.5 size-4 text-danger" weight="fill" />}
            {(c.status === "warn" || c.status === "skip") && <WarningCircleIcon className={cn("mt-0.5 size-4", c.status === "warn" ? "text-ember" : "text-bone-faint")} />}
            <div>
              <p className="text-bone">{c.label}</p>
              <p className="text-[11.5px] leading-snug text-bone-dim">{c.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Report summary + verifier with optional compose comparison. */
export function ReportVerifier({ report }: { report: AttestationReport }) {
  const [compose, setCompose] = useState("");
  const [verdict, setVerdict] = useState<{ reportId: string; result: VerifyResult } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A verdict only belongs to the report it was computed for; a newer quote clears it.
  const result = verdict?.reportId === report.id ? verdict.result : null;

  async function verify() {
    setBusy(true);
    setError(null);
    const target = report;
    try {
      // List views omit the raw quote, which is part of the signed digest, so let the
      // server verify its stored copy by id in that case.
      const subject = target.quote ? { report: target } : { reportId: target.id };
      const next = await api<VerifyResult>("/api/attestations/verify", {
        method: "POST",
        json: { ...subject, ...(compose.trim() ? { compose } : {}) },
      });
      setVerdict({ reportId: target.id, result: next });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tag tone="cobalt">{report.subject.type}</Tag>
        <Tag>{report.tee.cpu}</Tag>
        {report.tee.gpu && <Tag>{report.tee.gpu}</Tag>}
        <Tag tone={report.tee.tcbStatus === "UpToDate" ? "signal" : "danger"}>TCB {report.tee.tcbStatus}</Tag>
        <Tag tone="ember">{report.mode}</Tag>
      </div>
      <MeasurementTable report={report} />
      <div className="grid gap-1 font-mono text-[11px] text-bone-dim">
        <p>
          Anchor tx {short(report.anchor.txHash, 10, 8)} on chain {report.anchor.chainId} ({report.anchor.status})
        </p>
        <p className="break-words">
          Explorer: <a className="text-bone underline-offset-4 hover:underline" href={site.chain.explorer} target="_blank" rel="noreferrer">robinhoodchain.blockscout.com</a>
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`compose-${report.id}`} className="text-xs text-bone-dim">
          Your docker-compose (optional, compared against the measured hash)
        </Label>
        <Textarea
          id={`compose-${report.id}`}
          value={compose}
          onChange={(e) => setCompose(e.target.value)}
          rows={4}
          placeholder={"services:\n  app:\n    image: ..."}
          className="border-line-strong bg-ink font-mono text-xs"
        />
      </div>
      <button
        type="button"
        onClick={() => void verify()}
        disabled={busy}
        className="chamfer inline-flex h-10 items-center gap-2 bg-ember px-4 text-xs font-semibold tracking-wider text-ink uppercase disabled:opacity-60"
        style={{ "--cut": "8px" } as React.CSSProperties}
      >
        <SealCheckIcon className="size-4" /> {busy ? "Verifying" : "Verify report"}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
      {result && <VerifyChecks result={result} />}
    </div>
  );
}
