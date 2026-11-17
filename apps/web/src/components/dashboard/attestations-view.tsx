"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HudPanel, Tag } from "./hud";
import { PageHeader, primaryButton } from "./page-header";
import { ReportVerifier, VerifyChecks } from "./report-view";
import { api, ApiError, type AttestationReport, type VerifyResult } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import { ago, short } from "@/lib/format";
import { cn } from "@/lib/utils";

function PasteVerifier({ latestId }: { latestId?: string }) {
  const [json, setJson] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadLatest() {
    if (!latestId) return;
    setError(null);
    try {
      const full = await api<AttestationReport>(`/api/attestations/${latestId}`);
      setJson(JSON.stringify(full, null, 2));
      setResult(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the latest report.");
    }
  }

  async function verify() {
    setError(null);
    setResult(null);
    let report: unknown;
    try {
      report = JSON.parse(json);
    } catch {
      setError("That is not valid JSON.");
      return;
    }
    setBusy(true);
    try {
      setResult(await api<VerifyResult>("/api/attestations/verify", { method: "POST", json: { report } }));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] leading-relaxed text-bone-dim">
        Paste any Eclipseal attestation report. Change a single hex digit and the signature check fails, which is the point.
      </p>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="paste-report" className="text-xs text-bone-dim">Report JSON</Label>
          <button type="button" disabled={!latestId} onClick={() => void loadLatest()} className="text-[11px] tracking-wider text-ember uppercase hover:underline disabled:opacity-50">
            Load latest report
          </button>
        </div>
        <Textarea
          id="paste-report"
          value={json}
          onChange={(e) => {
            setJson(e.target.value);
            setResult(null);
          }}
          rows={14}
          className="border-line-strong bg-ink font-mono text-[11px] leading-5"
          placeholder='{ "version": 1, "id": "att_...", ... }'
        />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="button" disabled={!json.trim() || busy} onClick={() => void verify()} className={primaryButton} style={{ "--cut": "9px" } as CSSProperties}>
        {busy ? "Verifying" : "Verify pasted report"}
      </button>
      {result && <VerifyChecks result={result} />}
    </div>
  );
}

export function AttestationsView() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { data: list } = useApi<AttestationReport[]>("/api/attestations?limit=60", 5000);
  const [selectedId, setSelectedId] = useState<string | null>(() => params.get("id"));
  const [tab, setTab] = useState(() => (params.get("tab") === "paste" ? "paste" : "inspect"));
  const [handledLink, setHandledLink] = useState(() => params.toString());
  const [loaded, setLoaded] = useState<{ id: string; report: AttestationReport | null; error?: string } | null>(null);
  const verifier = useRef<HTMLDivElement>(null);

  // Links from search, GPU jobs and the overview dialog land here as ?id= or ?tab=.
  const link = params.toString();
  if (link !== handledLink) {
    setHandledLink(link);
    const id = params.get("id");
    if (id) setSelectedId(id);
    if (params.get("tab") === "paste") setTab("paste");
  }

  // Pin the first quote that loads; new quotes arrive every few seconds and must not swap it out.
  if (!selectedId && list?.[0]) setSelectedId(list[0].id);
  const activeId = selectedId;
  const activeIndex = list && activeId ? list.findIndex((r) => r.id === activeId) : -1;
  const full = loaded && loaded.id === activeId ? loaded.report : undefined;
  const loadError = loaded && loaded.id === activeId ? loaded.error : undefined;

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    api<AttestationReport>(`/api/attestations/${activeId}`)
      .then((r) => alive && setLoaded({ id: activeId, report: r }))
      .catch((e) => alive && setLoaded({ id: activeId, report: null, error: e instanceof ApiError && e.status === 404 ? undefined : (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [activeId]);

  function select(id: string) {
    setSelectedId(id);
    setTab("inspect");
    router.replace(`${pathname}?id=${encodeURIComponent(id)}`, { scroll: false });
    // On phones the verifier sits below the list; bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => verifier.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  return (
    <>
      <PageHeader title="Attestations" sub="Every quote issued by the network. Pick one to inspect its measurement registers, compare a compose file, or verify a report someone sent you." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <HudPanel
          title="Recent quotes"
          bodyClassName="p-2"
          action={
            list?.[0] && activeIndex !== 0 ? (
              <button type="button" onClick={() => select(list[0].id)} className="text-[10.5px] tracking-wider text-ember uppercase hover:underline">
                {activeIndex > 0 ? `${activeIndex} newer · latest` : "Show latest"}
              </button>
            ) : undefined
          }
        >
          <ScrollArea className="h-[46dvh] min-h-[320px] lg:h-[62dvh] lg:min-h-[380px]">
            <ul className="space-y-1 pr-3">
              {!list &&
                Array.from({ length: 8 }, (_, i) => (
                  <li key={i}>
                    <Skeleton className="h-14" />
                  </li>
                ))}
              {list?.length === 0 && <li className="px-3 py-8 text-center text-xs text-bone-faint">No quotes yet.</li>}
              {list?.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => select(r.id)}
                    aria-current={r.id === activeId ? "true" : undefined}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 border px-3 py-2.5 text-left transition-colors",
                      r.id === activeId ? "border-ember/60 bg-ember/5" : "border-transparent hover:border-line-strong",
                    )}
                  >
                    <span className="truncate text-[12.5px] text-bone">{r.subject.name}</span>
                    <span className="text-[11px] text-bone-faint">{ago(r.issuedAt)}</span>
                    <span className="truncate font-mono text-[10.5px] text-bone-dim">
                      {r.id} · {r.tee.gpu ? "TDX + CC" : r.tee.cpu}
                    </span>
                    <Tag tone={r.subject.type === "model" ? "cobalt" : r.subject.type === "gpu-job" ? "ember" : "muted"} className="h-5 justify-self-end">
                      {r.subject.type}
                    </Tag>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        </HudPanel>
        <div ref={verifier} className="scroll-mt-20">
          <HudPanel title="Verifier">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-4 bg-ink-3">
                <TabsTrigger value="inspect" className="text-xs tracking-wider uppercase">Inspect</TabsTrigger>
                <TabsTrigger value="paste" className="text-xs tracking-wider uppercase">Paste report</TabsTrigger>
              </TabsList>
              <TabsContent value="inspect">
                {full ? (
                  <>
                    <p className="mb-3 text-[12px] break-words text-bone-dim">
                      <span className="text-bone">{full.subject.name}</span> · {full.id} · quote {short(full.quote ?? "", 10, 6)}
                    </p>
                    <ReportVerifier key={full.id} report={full} />
                  </>
                ) : full === null ? (
                  <div className="border border-line p-6 text-center">
                    <p className="text-sm text-bone">{loadError ? "Could not load this quote" : `Quote ${short(activeId, 10, 4)} was not found`}</p>
                    <p className="mt-1 text-xs leading-relaxed text-bone-dim">
                      {loadError ?? "Devnet keeps the latest 400 quotes. Pick a recent one, or paste the full report JSON instead."}
                    </p>
                  </div>
                ) : (
                  <Skeleton className="h-96" />
                )}
              </TabsContent>
              <TabsContent value="paste">
                <PasteVerifier latestId={list?.[0]?.id} />
              </TabsContent>
            </Tabs>
          </HudPanel>
        </div>
      </div>
    </>
  );
}
