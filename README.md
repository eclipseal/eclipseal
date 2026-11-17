# Eclipseal

**Proven in the dark.** Run AI agents, private LLMs and GPU jobs inside hardware-sealed enclaves (TEEs). Keep secrets private and prove what ran, with every proof anchored on Robinhood Chain. `$ECLS` trades on [Pons](https://ponsfamily.com/launchpad).

The product flow follows phala.com (agent sandbox in confidential VMs, private OpenAI-compatible LLMs, a confidential GPU market, attestation for every result) and adds a Robinhood Chain layer: proof anchoring on chain 4663, a native token on Pons, and wallet connect to the chain.

```
apps/web     Next.js 16 landing page + dashboard (Tailwind v4, shadcn/ui, Motion, GSAP, React Three Fiber)
apps/api     Node.js control plane (Express 5, TypeScript): workloads, attestation, LLM gateway, GPU jobs, vault, SSE
brand/logo   Eclipseal logo: SVG mark, wordmark, lockups and the script that builds them
deploy/      VPS deploy: deploy.sh, nginx site, systemd units
```

## Quick start

Requires Node 20.12+ (tested on Node 22).

```bash
npm run setup
```

```bash
npm run dev
```

- Landing page: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard
- API: http://localhost:4000/api/health

Copy `apps/api/.env.example` to `apps/api/.env` and `apps/web/.env.example` to `apps/web/.env.local` to change ports, RPC, token address or the upstream LLM. Everything works with the defaults.

```bash
npm run smoke
```

The smoke test deploys a workload, waits for it to boot, verifies its attestation (and rejects a tampered one), checks a signed chat completion, seals a secret and queues a GPU job: 14 checks against the running API.

## Landing page

Built from the "Astronomicon" poster reference and laid out like it: black grain background, giant distressed vertical wordmark with the ember rule, `PROVEN XX / X IN THE XX` headline, monospace micro captions, `DARK` sitting on the illustration panel, two vertical paragraphs beside it, and the illustration in a panel at the lower right. Dark palette throughout.

- **3D parallax hero.** The panel is a window into a painted diorama: six Higgsfield layers (sky, mesas, megastructure, desert floor, rocks, ships) placed at real depths in Three.js, plus stars, dust and a 3D core with an opening ember slit, corona and proof beam. Scrolling opens the panel into the whole screen (the poster type flies apart in depth), then flies the camera through the layers into the sealed core while captions play, and ends in static and black. Everything is scrubbed, so scrolling up reverses it exactly. Pointer (desktop) and gyroscope (Android) add parallax in the poster state.
- **Mobile gets the same motion.** No desktop-only gating: ScrollTrigger scrubs on touch scroll, the camera reframes for portrait (wider FOV, gate centred), particle and terrain counts drop, DPR is capped at 1.5, and Android phones add gyroscope parallax. WebGL loops pause when off screen.
- **More scroll choreography.** Manifesto words rotate into place, the product dossiers pan horizontally with a 3D card swing, the TEE stack explodes layer by layer in a second 3D scene (silicon, measured boot, confidential VM, workload, signed quote), and the chain section zoom-parallaxes the ring painting.
- **Live, not a mockup.** "Ask a sealed model" streams a completion from the API, verifies the enclave signature, and checks the model's attestation quote. Edit a word of the answer and verification fails.
- `prefers-reduced-motion` collapses scroll-jacking to static frames.

## Dashboard

Modelled on the HUD reference (chamfered panels, central 3D visual, callouts):

| Route | What it does |
|---|---|
| `/dashboard` | Enclave map: KPIs, workload data, 14 to 30 day history, a 3D attestation spine with live measurement callouts, attestation data with sparklines, composition ring, Robinhood Chain anchor panel, live SSE event stream |
| `/dashboard/agents` | Deploy a docker-compose into a TEE profile with sealed env, watch the boot log stream, get and verify the quote (including your compose file) |
| `/dashboard/models` | Private LLM catalog, curl and OpenAI SDK snippets, playground with signature verification |
| `/dashboard/gpu` | H100, H200 and B300 offers, launch sealed jobs with cost estimate, live progress |
| `/dashboard/attestations` | Inspect any quote's registers, compare a compose file, or paste a report JSON to verify |
| `/dashboard/vault` | Seal secrets (AES-256-GCM, per-app HKDF keys); plaintext never comes back |

The header wallet button connects any EIP-1193 wallet and switches it to Robinhood Chain (adds the network if needed).

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health`, `/api/network`, `/api/chain`, `/api/token` | Status, network stats and history, live Robinhood Chain probe, $ECLS info |
| GET/POST | `/api/cvms`, `/api/cvms/:id`, `/api/cvms/:id/actions` | Confidential VMs: deploy, start, stop, restart, attest, delete |
| GET | `/api/cvms/:id/attestation`, `/api/attestations`, `/api/attestations/:id` | Attestation reports |
| POST | `/api/attestations/verify` | Verify a report (signature, signer, TCB, MRTD allowlist, RTMR3 replay, REPORTDATA binding, optional compose hash) |
| POST | `/api/signatures/verify`, `/api/signatures/verify-chat` | Verify a signed text or a chat receipt |
| GET/POST | `/api/gpu/offers`, `/api/gpu/jobs`, `/api/gpu/jobs/:id/cancel` | Confidential GPU jobs |
| GET/POST/DELETE | `/api/secrets` | Sealed secrets vault |
| POST | `/api/waitlist` | Early access list |
| GET | `/api/events` | Server-sent events (deploys, quotes, GPU progress, signed chats, chain status) |
| OpenAI | `/v1/models`, `/v1/chat/completions` (stream or not), `/v1/signature/:id`, `/v1/attestation/report?model=` | Private LLM gateway with signed receipts |

State persists to `apps/api/data/db.json`. Helmet, CORS allowlist, rate limits and zod validation are on every route.

## What is real and what is simulated

Real today: the cryptography and the verification logic. Reports are canonical JSON signed with Ed25519, REPORTDATA binds the signer key and nonce, RTMR3 replays from the app id and compose hash, secrets are AES-256-GCM sealed, and chat replies are signed over request and response hashes. Tampering is detected.

Simulated: there is no TEE hardware behind this devnet, so quotes come from a development attestor key instead of Intel TDX DCAP or NVIDIA NRAS, the Robinhood Chain anchor tx is computed rather than sent, and the LLM gateway returns templated answers unless `UPSTREAM_LLM_BASE_URL` and `UPSTREAM_LLM_API_KEY` point at a real OpenAI-compatible provider. The UI labels these as devnet or simulation.

Path to production:
1. Run workloads on TDX hosts with an open runtime such as Phala's dstack, or Phala Cloud's API, and verify quotes with `dcap-qvl` plus NVIDIA NRAS for GPU evidence.
2. Deploy an attestation registry contract on Robinhood Chain (4663) and write the report digest per run.
3. Gate the vault's key release on the verifier result (KMS inside a TEE).
4. Point `CHAIN_RPC_URL` at Alchemy, QuickNode or Chainstack. The public RPC is rate limited, and from some networks it fails TLS (`ERR_TLS_CERT_ALTNAME_INVALID`), which the dashboard reports as "RPC offline" instead of inventing numbers.

## Brand

`brand/logo/` holds the Eclipseal mark, wordmark and lockups as SVG, built from the Higgsfield outputs by `brand/logo/build/make_logo.py`. The marketing kit (X campaign, Higgsfield originals, renderer) is kept out of this repository.

## Deploy

Live at https://eclipseal.xyz on a VPS (Ubuntu 20.04, Node 22), behind nginx with a Let's Encrypt certificate (certbot renews it through `certbot.timer`).

```bash
npm run deploy
```

`deploy/deploy.sh` syncs `apps/` over SSH, builds on the server as the `eclipseal` user, and restarts two systemd services that listen on loopback only: `eclipseal-web` (Next.js, 127.0.0.1:3330) and `eclipseal-api` (127.0.0.1:4330). nginx sends `/api` and `/v1` to the API on the same origin, so the browser needs no CORS, and streams `/api/events` unbuffered. The first run also creates the API `.env` with a random `VAULT_MASTER_SECRET`, the service user and the nginx site; later runs never touch the `.env` or the certbot-managed nginx file. Set the target with `DEPLOY_HOST` (user@host) and `DEPLOY_KEY` (SSH key path), in the environment or in a gitignored `deploy/target.env`.

On the server: `journalctl -u eclipseal-api -u eclipseal-web -f` for logs, `/var/www/eclipseal/apps/api/.env` for settings (set `TOKEN_ADDRESS` after the Pons launch, then `systemctl restart eclipseal-api`), `/var/www/eclipseal/data` for the store and attestor key.

Eclipseal is an independent project and is not affiliated with Robinhood Markets, Inc.
