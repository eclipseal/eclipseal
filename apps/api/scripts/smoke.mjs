// End-to-end smoke test against a running API: node scripts/smoke.mjs [baseUrl] [webOrigin]
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const base = process.argv[2] ?? "http://localhost:4000";
const origin = process.argv[3] ?? "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

async function call(method, path, body, token) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
}

function check(label, ok, extra = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
}

async function signIn(account) {
  const nonce = await call("POST", "/api/auth/nonce", { address: account.address });
  const signature = await account.signMessage({ message: nonce.json.message });
  const verified = await call("POST", "/api/auth/verify", { message: nonce.json.message, signature });
  return { nonce, signature, verified, token: verified.json?.token };
}

const health = await call("GET", "/api/health");
check("health", health.status === 200 && health.json.ok);

const network = await call("GET", "/api/network");
check("network stats", network.status === 200 && network.json.history.length > 0, `chain live=${network.json.chain?.live}`);

/* ------------------------------ wallet sign-in ------------------------------ */

const alice = privateKeyToAccount(generatePrivateKey());
const bob = privateKeyToAccount(generatePrivateKey());
const compose = "services:\n  app:\n    image: ghcr.io/eclipseal-labs/hello:1.0\n";
const name = `smoke-${Date.now().toString(36)}`;

const anonDeploy = await call("POST", "/api/cvms", { name, compose, profileId: "tdx.small" });
check("anonymous deploy needs sign-in", anonDeploy.status === 401 && anonDeploy.json.code === "sign_in_required");

const a = await signIn(alice);
check("sign in with wallet", a.verified.status === 201 && a.token?.startsWith("ecls_sess_"), a.verified.json?.me?.tier?.label);
const replay = await call("POST", "/api/auth/verify", { message: a.nonce.json.message, signature: a.signature });
check("nonce cannot be replayed", replay.status === 401);
const forged = await call("POST", "/api/auth/nonce", { address: alice.address });
const bobSig = await bob.signMessage({ message: forged.json.message });
check("signature from another wallet rejected", (await call("POST", "/api/auth/verify", { message: forged.json.message, signature: bobSig })).status === 401);
const b = await signIn(bob);

const me = await call("GET", "/api/me", null, a.token);
const tier = me.json.tier;
check("holder pass", me.status === 200 && tier?.maxWorkloads >= 1, `${tier?.label}, ${me.json.balance?.source}`);
check("expired session rejected", (await call("GET", "/api/cvms", null, "ecls_sess_nope")).status === 401);

/* -------------------------------- workloads -------------------------------- */

const created = await call("POST", "/api/cvms", { name, compose, profileId: "tdx.small", env: { API_KEY: "s3cret" } }, a.token);
check("deploy cvm", created.status === 201 && created.json.owner === alice.address.toLowerCase(), created.json?.id);

let cvm = created.json;
for (let i = 0; i < 20 && cvm.status !== "running"; i++) {
  await sleep(1000);
  cvm = (await call("GET", `/api/cvms/${created.json.id}`, null, a.token)).json;
}
check("cvm reaches running", cvm.status === "running", `${cvm.logs.length} log lines`);
check("private to its wallet", (await call("GET", `/api/cvms/${cvm.id}`, null, b.token)).status === 404 && (await call("GET", `/api/cvms/${cvm.id}`)).status === 404);
check("hidden from other lists", !(await call("GET", "/api/cvms", null, b.token)).json.some((c) => c.id === cvm.id));
check("other wallet cannot delete", (await call("DELETE", `/api/cvms/${cvm.id}`, null, b.token)).status === 404);
check("start on running is refused", (await call("POST", `/api/cvms/${cvm.id}/actions`, { action: "start" }, a.token)).status === 409);

const demo = (await call("GET", "/api/cvms")).json.find((c) => !c.owner && c.status === "running");
check("demo workload is read-only", (await call("POST", `/api/cvms/${demo.id}/actions`, { action: "stop" }, a.token)).status === 403);
check("demo workload can still be attested", (await call("POST", `/api/cvms/${demo.id}/actions`, { action: "attest" }, a.token)).status === 200);

const fill = [];
for (let i = 1; i < tier.maxWorkloads; i++) {
  fill.push((await call("POST", "/api/cvms", { name: `${name}-${i}`, compose, profileId: "tdx.small" }, a.token)).json);
}
const over = await call("POST", "/api/cvms", { name: `${name}-x`, compose, profileId: "tdx.small" }, a.token);
check("workload quota enforced", over.status === 403 && over.json.code === "quota", over.json.error);
for (const extra of fill) await call("DELETE", `/api/cvms/${extra.id}`, null, a.token);

/* ------------------------------- attestation ------------------------------- */

const report = (await call("GET", `/api/cvms/${cvm.id}/attestation`, null, a.token)).json;
check("attestation report", Boolean(report.signature && report.measurements?.rtmr3));
check("private quotes stay out of public lists", !(await call("GET", "/api/attestations?limit=200")).json.some((r) => r.id === report.id));
check("quote is fetchable by id", (await call("GET", `/api/attestations/${report.id}`)).status === 200);

const verified = (await call("POST", "/api/attestations/verify", { report, compose })).json;
check("verify with matching compose", verified.valid === true, verified.verdict);
const tampered = (await call("POST", "/api/attestations/verify", { report: { ...report, composeHash: "00" } })).json;
check("tampered report rejected", tampered.valid === false);
const wrongCompose = (await call("POST", "/api/attestations/verify", { report, compose: compose + "#" })).json;
check("wrong compose rejected", wrongCompose.valid === false);

/* ------------------------------- private LLM ------------------------------- */

const chatBody = { model: "deepseek/deepseek-v4.1-flash", messages: [{ role: "user", content: "What is a TEE?" }] };
const chat = await call("POST", "/v1/chat/completions", chatBody);
check("chat completion (public demo)", chat.status === 200 && chat.json.choices?.[0]?.message?.content?.length > 0);
const receipt = chat.json.eclipseal;
const sigOk = (await call("POST", "/api/signatures/verify", { text: receipt.signed_text, signature: receipt.signature })).json;
check("response signature verifies", sigOk.valid === true);
const sigBad = (await call("POST", "/api/signatures/verify", { text: receipt.signed_text + "x", signature: receipt.signature })).json;
check("altered response fails", sigBad.valid === false);

const key = await call("POST", "/api/me/keys", { name: "smoke" }, a.token);
check("create API key", key.status === 201 && key.json.secret?.startsWith("ecls_key_") && !JSON.stringify((await call("GET", "/api/me/keys", null, a.token)).json).includes(key.json.secret));
const keyed = await call("POST", "/v1/chat/completions", chatBody, key.json.secret);
check("chat with API key counts quota", keyed.status === 200 && Number(keyed.headers.get("x-ecls-quota-limit")) === tier.llmRequestsPerDay, `remaining ${keyed.headers.get("x-ecls-quota-remaining")}`);
check("invalid API key rejected", (await call("POST", "/v1/chat/completions", chatBody, "ecls_key_wrong")).status === 401);
check("usage recorded", (await call("GET", "/api/me", null, a.token)).json.usage.llmRequestsToday >= 1);
check("revoke API key", (await call("DELETE", `/api/me/keys/${key.json.key.id}`, null, a.token)).status === 204 && (await call("POST", "/v1/chat/completions", chatBody, key.json.secret)).status === 401);

/* ---------------------------------- vault ---------------------------------- */

const secret = await call("POST", "/api/secrets", { name: "SMOKE_TOKEN", value: "never-returned" }, a.token);
check("seal secret", secret.status === 201 && !JSON.stringify(secret.json).includes("never-returned"));
const rotated = await call("POST", "/api/secrets", { name: "SMOKE_TOKEN", value: "rotated-value" }, a.token);
const mine = (await call("GET", "/api/secrets", null, a.token)).json.filter((s) => s.name === "SMOKE_TOKEN" && s.owner === alice.address.toLowerCase());
check("same name rotates instead of duplicating", rotated.status === 200 && rotated.json.rotated === true && mine.length === 1 && rotated.json.id === secret.json.id);
check("secrets stay private", !(await call("GET", "/api/secrets", null, b.token)).json.some((s) => s.id === secret.json.id));

/* ----------------------------------- GPUs ---------------------------------- */

const tooMany = await call("POST", "/api/gpu/jobs", { name: "smoke-job", offerId: "h100-us-east", count: 8, image: "ghcr.io/x/y:1", hours: 1 }, a.token);
check("GPU tier limit enforced", tier.maxGpusPerJob >= 8 || tooMany.status === 403);
const job = await call("POST", "/api/gpu/jobs", { name: "smoke-job", offerId: "h100-us-east", count: 1, image: "ghcr.io/x/y:1", hours: 1 }, a.token);
check("gpu job queued with holder discount", job.status === 201 && job.json.status === "queued" && job.json.costEstimate <= job.json.listCost, `$${job.json.costEstimate} vs $${job.json.listCost}`);
const offers = (await call("GET", "/api/gpu/offers")).json;
const h100 = offers.find((o) => o.id === "h100-us-east");
check("GPU capacity accounts for running jobs", h100.available < h100.capacity);

const bad = await call("POST", "/api/cvms", { name: "Bad Name!", compose: "x", profileId: "nope" }, a.token);
check("validation errors are 400", bad.status === 400);

/* --------------------------------- cleanup --------------------------------- */

await call("DELETE", `/api/cvms/${cvm.id}`, null, a.token);
await call("POST", `/api/gpu/jobs/${job.json.id}/cancel`, null, a.token);
await call("DELETE", `/api/secrets/${secret.json.id}`, null, a.token);
await call("POST", "/api/auth/logout", null, b.token);
const out = await call("POST", "/api/auth/logout", null, a.token);
check("sign out ends the session", out.status === 204 && (await call("GET", "/api/me", null, a.token)).status === 401);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
