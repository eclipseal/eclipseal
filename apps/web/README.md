# Eclipseal web

Next.js 16 app with the landing page (`/`) and the console (`/dashboard/*`). See the repository README for the full picture.

```bash
npm run dev
```

Set `NEXT_PUBLIC_API_URL` (see `.env.example`) to point at the API in `../api`.

- `src/components/landing/` holds the landing sections. `hero-scene.tsx` and `stack-scene.tsx` are the React Three Fiber scenes; GSAP ScrollTrigger drives them through refs, not React state.
- `src/components/dashboard/` holds the HUD console. `enclave-core.tsx` is the 3D attestation spine; its callouts are DOM labels projected from 3D anchors every frame.
- `src/components/proof-console.tsx` is the live sign-and-verify demo shared by the landing page and `/dashboard/models`.
