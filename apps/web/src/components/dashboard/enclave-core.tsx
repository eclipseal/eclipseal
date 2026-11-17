"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { rng } from "@/lib/rng";
import { usePrefersReducedMotion } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export type Callout = { id: string; label: string; detail: string; status: string; tone: "ember" | "signal" | "cobalt" };

const HEIGHT = 9.6;
const RADIUS = 0.95;
const TWIST = Math.PI * 3.8; // about 1.9 turns over the height
const RUNGS = 30;
const CALLOUT_Y = [-2.4, 0.1, 2.5]; // MRTD-01 (bottom), RTMR-3 (middle), GPU-CC (top)
const ZONE_COLORS = ["#5fd38d", "#d9732f", "#8193f5"];

/*
 * The spine is drawn as particles, like a hologram: soft round sprites, additive, sized in world units.
 * Points in front of the helix axis grow and soften (a cheap depth of field), points behind it dim,
 * and every point twinkles on its own phase. uFlow scrolls the ambient dust upward.
 */
const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uFlow;
uniform float uScale;
uniform float uFocus;
uniform float uSize;
uniform float uAlpha;
uniform float uSpan;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 p = position;
  if (uSpan > 0.0) p.y = mod(p.y + uFlow + uSpan * 0.5, uSpan) - uSpan * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  float off = clamp((depth - uFocus) / 1.3, -1.0, 1.0);
  float blur = abs(off);
  float twinkle = 0.6 + 0.4 * sin(uTime * (0.7 + aSeed * 2.4) + aSeed * 43.0);
  gl_PointSize = max(1.0, uSize * aSize * uScale / depth * (1.0 + 0.8 * blur));
  vAlpha = uAlpha * twinkle * (1.0 - 0.62 * max(off, 0.0)) / (1.0 + 0.8 * blur);
  vColor = aColor;
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(vColor, a * a * vAlpha);
}`;

const FRAGMENT_GLOW = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  gl_FragColor = vec4(vColor, exp(-d * d * 16.0) * vAlpha);
}`;

function particleMaterial({ size, alpha, glow = false, span = 0 }: { size: number; alpha: number; glow?: boolean; span?: number }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uScale: { value: 900 },
      uFocus: { value: 11.5 },
      uSize: { value: size },
      uAlpha: { value: alpha },
      uSpan: { value: span },
    },
    vertexShader: VERTEX,
    fragmentShader: glow ? FRAGMENT_GLOW : FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

type Cloud = { pos: number[]; col: number[]; size: number[]; seed: number[] };

function toGeometry({ pos, col, size, seed }: Cloud) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute("aSeed", new THREE.Float32BufferAttribute(seed, 1));
  return g;
}

/** 0 outside a measurement zone, rising to 1 at its centre. Returns the zone index too. */
function zoneAt(y: number): [number, number] {
  for (let z = 0; z < CALLOUT_Y.length; z++) {
    const d = Math.abs(y - CALLOUT_Y[z]);
    if (d < 0.78) return [z, 1 - THREE.MathUtils.smoothstep(d, 0.3, 0.78)];
  }
  return [-1, 0];
}

/**
 * Two strands with a dense core and a sparse halo, base-pair rungs between them, and soft glow
 * sprites along the strands. Zone particles take the zone colour and burn brighter.
 */
function buildHelix(lite: boolean) {
  const rand = rng(42);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const silver = new THREE.Color("#dde3ee");
  const bone = new THREE.Color("#f0ede4");
  const zones = ZONE_COLORS.map((c) => new THREE.Color(c));
  const c = new THREE.Color();
  const core: Cloud = { pos: [], col: [], size: [], seed: [] };
  const glow: Cloud = { pos: [], col: [], size: [], seed: [] };

  const add = (cloud: Cloud, x: number, y: number, z: number, size: number, gain: number, warmth: number) => {
    const [zone, w] = zoneAt(y);
    c.copy(silver).lerp(bone, warmth);
    // Zones keep some silver so they still sparkle instead of reading as solid neon.
    if (zone >= 0) c.lerp(zones[zone], w * (0.55 + rand() * 0.35));
    const k = gain * (1 + w * 0.3);
    cloud.pos.push(x, y, z);
    cloud.col.push(c.r * k, c.g * k, c.b * k);
    cloud.size.push(size * (1 + w * 0.12));
    cloud.seed.push(rand());
  };

  const perStrand = lite ? 2600 : 5200;
  const haloPerStrand = lite ? 600 : 1300;
  for (const phase of [0, Math.PI]) {
    for (let i = 0; i < perStrand + haloPerStrand; i++) {
      const halo = i >= perStrand;
      const t = rand();
      const y = (t - 0.5) * HEIGHT;
      const a = t * TWIST + phase;
      const spread = halo ? 0.13 : 0.038;
      const r = RADIUS + gauss() * spread;
      const sparkle = rand() > 0.97 ? 2.2 : 1;
      add(
        core,
        Math.cos(a) * r - Math.sin(a) * gauss() * spread,
        y + gauss() * spread,
        Math.sin(a) * r + Math.cos(a) * gauss() * spread,
        (halo ? 0.55 : 1) * (0.6 + rand() * 0.8) * sparkle,
        halo ? 0.55 : 0.9,
        rand() * 0.5,
      );
    }
    // Glow sprites follow the strand centreline.
    const sprites = lite ? 110 : 220;
    for (let i = 0; i < sprites; i++) {
      const t = (i + rand()) / sprites;
      const a = t * TWIST + phase;
      add(glow, Math.cos(a) * RADIUS, (t - 0.5) * HEIGHT, Math.sin(a) * RADIUS, 0.8 + rand() * 0.5, 0.5, 0.2);
    }
  }

  const perRung = lite ? 120 : 230;
  for (let i = 0; i < RUNGS; i++) {
    const t = (i + 0.5) / RUNGS;
    const y = (t - 0.5) * HEIGHT;
    const a = t * TWIST;
    const ax = Math.cos(a) * RADIUS * 0.97;
    const az = Math.sin(a) * RADIUS * 0.97;
    for (let j = 0; j < perRung; j++) {
      const u = rand();
      if (Math.abs(u - 0.5) < 0.025) continue; // the base pair meets in the middle
      const s = 1 - 2 * u;
      const side = gauss() * 0.028;
      add(core, ax * s - Math.sin(a) * side, y + gauss() * 0.026, az * s + Math.cos(a) * side, 0.66 + rand() * 0.55, 0.78, 0.35);
    }
  }

  return { core: toGeometry(core), glow: toGeometry(glow) };
}

/** Ambient dust around the spine, scrolled upward in the shader. */
function buildDust(lite: boolean) {
  const rand = rng(47);
  const cobalt = new THREE.Color("#8193f5");
  const bone = new THREE.Color("#e8e4da");
  const c = new THREE.Color();
  const dust: Cloud = { pos: [], col: [], size: [], seed: [] };
  const count = lite ? 380 : 760;
  for (let i = 0; i < count; i++) {
    const r = 1.25 + rand() * 3.4;
    const a = rand() * Math.PI * 2;
    c.copy(cobalt).lerp(bone, rand() * 0.6);
    const k = 0.35 + rand() * 0.4;
    dust.pos.push(Math.cos(a) * r, (rand() - 0.5) * (HEIGHT + 2.4), Math.sin(a) * r);
    dust.col.push(c.r * k, c.g * k, c.b * k);
    dust.size.push(0.5 + rand() * 0.9);
    dust.seed.push(rand());
  }
  return toGeometry(dust);
}

/** Particle double helix with glowing measurement zones (GPU-CC, RTMR-3, MRTD-01). */
function Spine({ spin, still, lite, anchors }: { spin: boolean; still: boolean; lite: boolean; anchors: RefObject<(THREE.Object3D | null)[]> }) {
  const dnaGroup = useRef<THREE.Group>(null);
  const helix = useMemo(() => buildHelix(lite), [lite]);
  const dust = useMemo(() => buildDust(lite), [lite]);
  const materials = useMemo(
    () => ({
      core: particleMaterial({ size: 0.05, alpha: 0.95 }),
      glow: particleMaterial({ size: 0.46, alpha: 0.06, glow: true }),
      dust: particleMaterial({ size: 0.03, alpha: 0.8, span: HEIGHT + 2.4 }),
    }),
    [],
  );

  useEffect(
    () => () => {
      helix.core.dispose();
      helix.glow.dispose();
      dust.dispose();
    },
    [helix, dust],
  );
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  useFrame(({ camera, gl }, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const scale = gl.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)));
    const focus = cam.position.length();
    for (const m of Object.values(materials)) {
      m.uniforms.uScale.value = scale;
      m.uniforms.uFocus.value = focus;
      if (!still) m.uniforms.uTime.value += delta;
      if (spin) m.uniforms.uFlow.value += delta * 0.32;
    }
    // Turning the right-handed helix this way makes the strands read as streaming upward.
    if (spin && dnaGroup.current) dnaGroup.current.rotation.y -= delta * 0.34;
  });

  return (
    <group rotation={[0.16, 0, -0.12]} position={[-0.06, 0, 0]}>
      {CALLOUT_Y.map((y, i) => (
        // Fixed targets on the helix axis: the spine turns through them, the labels stay put.
        <object3D key={i} ref={(el) => void (anchors.current[i] = el)} position={[0.12, y, 0]} />
      ))}
      <group ref={dnaGroup}>
        <points geometry={helix.glow} material={materials.glow} />
        <points geometry={helix.core} material={materials.core} />
      </group>
      <points geometry={dust} material={materials.dust} />
    </group>
  );
}

/**
 * Projects the zone anchors to screen space every frame and moves the DOM labels directly
 * (no React renders), keeping each card inside the panel.
 */
function Projector({ anchors, labels }: { anchors: RefObject<(THREE.Object3D | null)[]>; labels: RefObject<(HTMLDivElement | null)[]> }) {
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera, size }) => {
    // Read every label's width first, then write, so the loop never forces a layout per label.
    const frames = anchors.current.map((obj, i) => {
      const el = labels.current[i];
      if (!obj || !el) return null;
      obj.getWorldPosition(v).project(camera);
      const width = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
      return { el, x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height, visible: v.z < 1, width };
    });
    for (const f of frames) {
      if (!f) continue;
      const x = Math.min(f.x, size.width - f.width - 6);
      f.el.style.transform = `translate3d(${x.toFixed(1)}px, ${f.y.toFixed(1)}px, 0)`;
      f.el.style.opacity = f.visible ? "1" : "0";
    }
  });
  return null;
}

/** Shifts the projection centre so the spine sits left of centre, leaving room for callouts. */
function ViewShift({ shift }: { shift: number }) {
  useFrame(({ camera, size }) => {
    const cam = camera as THREE.PerspectiveCamera;
    const x = Math.round(size.width * shift);
    if (shift === 0) {
      if (cam.view?.enabled) cam.clearViewOffset();
      return;
    }
    if (!cam.view?.enabled || cam.view.offsetX !== x || cam.view.fullWidth !== size.width || cam.view.fullHeight !== size.height) {
      cam.setViewOffset(size.width, size.height, x, 0, size.width, size.height);
    }
  });
  return null;
}

/** Frames the spine for the panel's aspect ratio, then applies the user's zoom. */
function ZoomRig({ zoom }: { zoom: number }) {
  useFrame(({ camera, size }, delta) => {
    const aspect = size.width / Math.max(1, size.height);
    const base = Math.max(11.5, 4.6 / (2 * Math.tan(THREE.MathUtils.degToRad(21)) * aspect));
    const target = base / zoom;
    const len = camera.position.length();
    camera.position.setLength(len + (target - len) * (1 - Math.exp(-delta * 6)));
  });
  return null;
}

const tone = {
  signal: { text: "text-signal", border: "border-signal/70", fill: "bg-signal", glow: "shadow-[0_0_10px_#5fd38d]", badge: "border-signal/60 bg-signal/10 text-signal", stroke: "#5fd38d" },
  ember: { text: "text-ember", border: "border-ember/70", fill: "bg-ember", glow: "shadow-[0_0_10px_#d9732f]", badge: "border-ember/60 bg-ember/10 text-ember", stroke: "#d9732f" },
  cobalt: { text: "text-cobalt-soft", border: "border-cobalt-soft/70", fill: "bg-cobalt-soft", glow: "shadow-[0_0_10px_#8193f5]", badge: "border-cobalt-soft/60 bg-cobalt/15 text-cobalt-soft", stroke: "#8193f5" },
} as const;

/** Double-ring reticle on the spine, an elbow leader, and a tabbed HUD card. */
function CalloutLabel({ c, narrow }: { c: Callout; narrow: boolean }) {
  const t = tone[c.tone];
  const lead = narrow ? 22 : 40;
  return (
    <div className="flex -translate-x-[10px] -translate-y-[10px] items-start">
      <div className="relative grid size-5 shrink-0 place-items-center">
        <span className={cn("absolute inset-0 rounded-full border", t.border, t.glow)} />
        <span className={cn("absolute inset-[5px] rounded-full border", t.border)} />
        <span className={cn("size-1 rounded-full", t.fill)} />
      </div>
      <svg width={lead} height={20} viewBox={`0 0 ${lead} 20`} className="shrink-0 overflow-visible" aria-hidden>
        <polyline points={`0,10 9,1 ${lead},1`} fill="none" stroke="rgb(232 228 218 / 0.5)" strokeWidth="1" />
        <circle cx={lead} cy={1} r={1.5} fill={t.stroke} />
      </svg>
      <div className={cn("-mt-[9px] font-mono", narrow ? "w-[128px]" : "w-[164px] sm:w-[188px]")}>
        <span className="inline-block border border-line-strong bg-ink px-1.5 py-[3px] text-[9.5px] leading-none font-semibold tracking-wider text-bone">{c.id}</span>
        <div className="-mt-px border border-line-strong bg-ink/90 p-2.5 shadow-2xl backdrop-blur-md">
          <p className="truncate text-[9.5px] font-semibold tracking-wider text-bone uppercase">{c.label}</p>
          {!narrow && <p className="mt-0.5 truncate text-[9px] text-bone-dim">{c.detail}</p>}
          <span className={cn("chamfer mt-2 inline-block border px-1.5 py-[3px] text-[8.5px] leading-none tracking-wider uppercase", t.badge)} style={{ "--cut": "4px" } as CSSProperties}>
            {c.status}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function EnclaveCore({
  callouts,
  zoom,
  spin,
  showCallouts,
  active,
}: {
  callouts: Callout[];
  zoom: number;
  spin: boolean;
  showCallouts: boolean;
  active: boolean;
}) {
  const anchors = useRef<(THREE.Object3D | null)[]>([]);
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const reduced = usePrefersReducedMotion();
  // Phones and small GPUs get the same spine with fewer particles, never a static fallback.
  const [lite] = useState(() => typeof window !== "undefined" && (window.innerWidth < 768 || (navigator.hardwareConcurrency ?? 8) <= 4));

  // Narrow panels (the desktop centre column) get compact callouts, all on the right.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 560));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} className="absolute inset-0 overflow-hidden">
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(60%_45%_at_42%_50%,rgb(47_75_216/0.16),transparent_70%)]" />
      <Canvas dpr={[1, 1.75]} frameloop={active ? "always" : "never"} camera={{ position: [0, 0, 11.5 / zoom], fov: 42 }} gl={{ antialias: true, alpha: true }} className="!absolute inset-0">
        <ZoomRig zoom={zoom} />
        <ViewShift shift={narrow ? 0.17 : 0} />
        <Spine spin={spin} still={reduced} lite={lite} anchors={anchors} />
        <Projector anchors={anchors} labels={labels} />
        <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={Math.PI / 3} maxPolarAngle={(Math.PI * 2) / 3} />
      </Canvas>
      <div aria-hidden={!showCallouts} className={cn("pointer-events-none absolute inset-0 transition-opacity duration-300", showCallouts ? "opacity-100" : "opacity-0")}>
        {CALLOUT_Y.map((_, i) => {
          const c = callouts[i];
          return (
            <div key={i} ref={(el) => void (labels.current[i] = el)} className="absolute top-0 left-0 will-change-transform">
              {c && <CalloutLabel c={c} narrow={narrow} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
