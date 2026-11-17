"use client";

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { rng } from "@/lib/rng";

/**
 * Painted diorama: Higgsfield-painted layers placed at real depths, so the poster's
 * illustration has true parallax. The canvas always fills the stage; while the poster
 * panel is closed the camera's view offset centres the composition on that panel.
 */

export type PanelState = { cx: number; cy: number; ph: number; pw: number; open: number };

type Shared = { progress: RefObject<number>; panel: RefObject<PanelState>; reduced: boolean; mobile: boolean };

// Measured from the generated layers (fractions of each image).
const MEGA = { coreX: 0.5, coreY: 0.389, coreR: 0.094, feet: 0.955, top: 0.04 };
const FLOOR_HORIZON = 0.61;
const MESAS_BASE = 0.66;
const WIDE = 2688 / 1152;
const SHIPS_ASPECT = 2525 / 1005;
// Mirror-tiled strips cut from the bottom rows of the floor and mesa layers (relative to each layer's height).
const FLOOR_GROUND = 1384 / 1152;
const MESAS_GROUND = 762 / 1152;
const DEPTH = { sky: 900, mesas: 230, ships: 165, mega: 110, floor: 62, rocks: 26 };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Layout = ReturnType<typeof computeLayout>;

/** All placements in world units, derived from the field of view and the poster panel's share of the screen. */
function computeLayout(fov: number, aspect: number, ph: number, pw: number) {
  const t = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const H = (d: number) => 2 * d * t;
  const horizon = (d: number) => -0.24 * ph * H(d); // horizon sits 74% down the panel
  const centerFor = (d: number, row: number, size: number, y: number) => y - (0.5 - row) * size;

  const megaSize = (0.7 * ph * H(DEPTH.mega)) / (MEGA.feet - MEGA.top);
  const megaY = centerFor(DEPTH.mega, MEGA.feet, megaSize, horizon(DEPTH.mega));
  const coreY = megaY + (0.5 - MEGA.coreY) * megaSize;
  const coreR = MEGA.coreR * megaSize;

  // The floor only has to reach the panel's bottom edge; a flat ground fill covers the rest once it opens.
  const panelDrop = 0.5 * ph * H(DEPTH.floor) + horizon(DEPTH.floor);
  const floorSize = Math.max((aspect * H(DEPTH.floor) * 1.2) / WIDE, (panelDrop * 1.25) / (1 - FLOOR_HORIZON));
  const floorY = centerFor(DEPTH.floor, FLOOR_HORIZON, floorSize, horizon(DEPTH.floor));

  const mesasSize = (aspect * H(DEPTH.mesas) * 1.25) / WIDE;
  const mesasY = centerFor(DEPTH.mesas, MESAS_BASE, mesasSize, horizon(DEPTH.mesas));

  // Rocks frame the open screen's corners, with the bottom edge always off screen.
  const rocksSize = (aspect * H(DEPTH.rocks) * 1.12) / WIDE;
  const rocksBottom = -0.52 * H(DEPTH.rocks);

  const skyH = H(DEPTH.sky);
  const skySize = Math.max(skyH * 1.2, (aspect * skyH * 1.2) / WIDE, (0.55 * skyH - horizon(DEPTH.sky)) / 0.88);

  return {
    H,
    horizon,
    mega: { size: megaSize, y: megaY },
    core: new THREE.Vector3(0, coreY, -DEPTH.mega),
    coreR,
    floor: { size: floorSize, y: floorY, bottom: floorY - 0.5 * floorSize },
    mesas: { size: mesasSize, y: mesasY, bottom: mesasY - 0.5 * mesasSize },
    rocks: { size: rocksSize, y: rocksBottom + 0.5 * rocksSize },
    sky: { size: skySize, y: centerFor(DEPTH.sky, 0.88, skySize, horizon(DEPTH.sky)) },
    ships: { width: 0.42 * pw * aspect * H(DEPTH.ships), y: 0.3 * ph * H(DEPTH.ships), span: aspect * H(DEPTH.ships) },
    parallax: 0.022 * H(DEPTH.mega),
    endZ: -DEPTH.mega + 3.3 * coreR,
  };
}

/* -------------------------------------------------------------------------- */
/* Shaders                                                                     */
/* -------------------------------------------------------------------------- */

const beamVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uSoft;
  varying vec2 vUv;
  void main() {
    float x = abs(vUv.x - 0.5) * 2.0;
    float core = exp(-x * x * 22.0);
    float halo = exp(-x * x * uSoft) * 0.45;
    float ends = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
    float flicker = 0.9 + 0.1 * sin(uTime * 11.0 + vUv.y * 18.0);
    float a = (core + halo) * ends * uIntensity * flicker;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const fresnelVertex = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fresnelFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float f = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.4);
    gl_FragColor = vec4(uColor * f * uIntensity, f * uIntensity);
  }
`;

const dustVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.22 + aSeed * 6.283) * 0.5;
    p.y += sin(uTime * 0.17 + aSeed * 12.0) * 0.35;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixelRatio * (60.0 / -mv.z);
    vAlpha = smoothstep(120.0, 6.0, -mv.z) * smoothstep(0.5, 2.5, -mv.z) * (0.3 + 0.7 * fract(aSeed * 7.13));
  }
`;

const dustFragment = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.0, d) * vAlpha;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/* -------------------------------------------------------------------------- */
/* Layers                                                                      */
/* -------------------------------------------------------------------------- */

function usePainted(mobile: boolean) {
  const suffix = mobile ? "-m" : "";
  const names = ["sky", "mesas", "mega", "floor", "rocks", "ships", "floor-ground", "mesas-ground"] as const;
  const textures = useTexture(
    names.map((n) => `/art/diorama/${n}${suffix}.webp`),
    (loaded) => {
      for (const tex of Array.isArray(loaded) ? loaded : [loaded]) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
      }
    },
  );
  return Object.fromEntries(names.map((n, i) => [n, textures[i]])) as Record<(typeof names)[number], THREE.Texture>;
}

function Plane({
  map,
  width,
  height,
  position,
  order,
  tint = "#ffffff",
}: {
  map: THREE.Texture;
  width: number;
  height: number;
  position: [number, number, number];
  order: number;
  tint?: string;
}) {
  return (
    <mesh position={position} renderOrder={order}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={map} color={tint} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/**
 * Flat ground continuing below a painted layer, tucked just behind it with an overlap so
 * the seam is hidden by the layer's opaque ground. Colors are sampled from each image's bottom rows.
 */
function GroundFill({ depth, top, layout, color, order }: { depth: number; top: number; layout: Layout; color: string; order: number }) {
  const height = layout.H(depth) * 2;
  return (
    <mesh position={[0, top - height / 2, -depth]} renderOrder={order}>
      <planeGeometry args={[layout.H(depth) * 4, height]} />
      <meshBasicMaterial color={color} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function SkyPlate({ map, layout }: { map: THREE.Texture; layout: Layout }) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(({ camera }) => {
    // Trails the camera so it reads as infinitely far away.
    mesh.current?.position.set(camera.position.x * 0.97, camera.position.y * 0.97 + layout.sky.y, camera.position.z - DEPTH.sky);
  });
  return (
    <mesh ref={mesh} renderOrder={0}>
      <planeGeometry args={[layout.sky.size * WIDE, layout.sky.size]} />
      <meshBasicMaterial map={map} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

function Stars({ layout, mobile }: { layout: Layout; mobile: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const rand = rng(9);
    const count = mobile ? 420 : 900;
    const pos = new Float32Array(count * 3);
    const span = layout.H(460);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * span * 2.6;
      pos[i * 3 + 1] = layout.horizon(460) + rand() * span * 0.75;
      pos[i * 3 + 2] = -360 - rand() * 200;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, [layout, mobile]);
  useFrame((state) => {
    if (ref.current) (ref.current.material as THREE.PointsMaterial).opacity = 0.55 + Math.sin(state.clock.elapsedTime * 0.9) * 0.12;
  });
  return (
    <points ref={ref} geometry={geometry} renderOrder={1}>
      <pointsMaterial color="#e9e4f2" size={1.1} sizeAttenuation transparent opacity={0.6} depthWrite={false} />
    </points>
  );
}

function Ships({ map, layout, reduced }: { map: THREE.Texture; layout: Layout; reduced: boolean }) {
  const ref = useRef<THREE.Mesh>(null);
  const { width, y, span } = layout.ships;
  useFrame((state) => {
    if (!ref.current) return;
    const t = reduced ? 8 : state.clock.elapsedTime;
    const travel = span + width * 1.4;
    ref.current.position.x = span * 0.5 + width * 0.7 - ((t * span * 0.022) % travel);
    ref.current.position.y = y + Math.sin(t * 0.5) * width * 0.02;
  });
  return (
    <mesh ref={ref} position={[0, y, -DEPTH.ships]} renderOrder={3}>
      <planeGeometry args={[width, width / SHIPS_ASPECT]} />
      <meshBasicMaterial map={map} color="#a9a6b4" transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

/** The sealed core: a crisp 3D sphere that takes over from the painted one on approach, plus slit, corona and proof beam. */
function Core({ layout, progress, reduced }: { layout: Layout; progress: RefObject<number>; reduced: boolean }) {
  const { core, coreR } = layout;
  const sphere = useRef<THREE.MeshStandardMaterial>(null);
  const slit = useRef<THREE.Mesh>(null);
  const slitMat = useRef<THREE.ShaderMaterial>(null);
  const beamMat = useRef<THREE.ShaderMaterial>(null);
  const coronaMat = useRef<THREE.ShaderMaterial>(null);
  const smoothed = useRef(0);
  const slitUniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#ff6a1f") }, uIntensity: { value: 0.9 }, uTime: { value: 0 }, uSoft: { value: 4 } }), []);
  const beamUniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#ff8a3d") }, uIntensity: { value: 0.16 }, uTime: { value: 0 }, uSoft: { value: 7 } }), []);
  const coronaUniforms = useMemo(() => ({ uColor: { value: new THREE.Color("#ff7a2e") }, uIntensity: { value: 0.5 } }), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const target = reduced ? 0 : (progress.current ?? 0);
    smoothed.current += (target - smoothed.current) * (1 - Math.exp(-delta * 5));
    const f = smooth(0.2, 0.96, smoothed.current);
    const open = smooth(0.62, 0.98, f);
    const breathe = 0.92 + Math.sin(t * 1.6) * 0.08;
    if (sphere.current) sphere.current.opacity = smooth(0.5, 0.78, f);
    slit.current?.scale.set(coreR * (0.09 + open * 2.4), coreR * (1.75 + open * 1.2), 1);
    if (slitMat.current) {
      slitMat.current.uniforms.uTime.value = t;
      slitMat.current.uniforms.uIntensity.value = (0.85 + open * 1.5) * breathe;
    }
    if (beamMat.current) {
      beamMat.current.uniforms.uTime.value = t;
      beamMat.current.uniforms.uIntensity.value = 0.14 + smooth(0.1, 0.7, f) * 0.5;
    }
    if (coronaMat.current) coronaMat.current.uniforms.uIntensity.value = (0.45 + open * 1.4) * breathe;
  });

  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false } as const;
  return (
    <group position={core.toArray()}>
      <mesh renderOrder={5}>
        <sphereGeometry args={[coreR, 64, 64]} />
        <meshStandardMaterial ref={sphere} color="#0c0c10" roughness={0.28} metalness={0.75} transparent opacity={0} />
      </mesh>
      <mesh renderOrder={6}>
        <sphereGeometry args={[coreR * 1.1, 48, 48]} />
        <shaderMaterial ref={coronaMat} vertexShader={fresnelVertex} fragmentShader={fresnelFragment} uniforms={coronaUniforms} {...additive} />
      </mesh>
      <mesh ref={slit} position={[0, 0, coreR + 0.03]} renderOrder={7}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial ref={slitMat} vertexShader={beamVertex} fragmentShader={beamFragment} uniforms={slitUniforms} {...additive} />
      </mesh>
      <mesh position={[0, coreR + 45, -0.05]} renderOrder={4}>
        <planeGeometry args={[coreR * 0.32, 90]} />
        <shaderMaterial ref={beamMat} vertexShader={beamVertex} fragmentShader={beamFragment} uniforms={beamUniforms} {...additive} />
      </mesh>
    </group>
  );
}

function Dust({ layout, mobile }: { layout: Layout; mobile: boolean }) {
  const dpr = useThree((s) => s.viewport.dpr);
  const material = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uSize: { value: mobile ? 2.4 : 2 }, uPixelRatio: { value: Math.min(dpr, 2) }, uColor: { value: new THREE.Color("#d9925c") } }),
    [dpr, mobile],
  );
  const geometry = useMemo(() => {
    const rand = rng(21);
    const count = mobile ? 220 : 520;
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const w = layout.H(60) * 1.4;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * w;
      pos[i * 3 + 1] = layout.horizon(60) + rand() * (layout.core.y + layout.H(40) * 0.4 - layout.horizon(60));
      pos[i * 3 + 2] = -6 - rand() * (DEPTH.mega - 10);
      seeds[i] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    return g;
  }, [layout, mobile]);
  useFrame((state) => {
    if (material.current) material.current.uniforms.uTime.value = state.clock.elapsedTime;
  });
  return (
    <points geometry={geometry} renderOrder={8}>
      <shaderMaterial ref={material} vertexShader={dustVertex} fragmentShader={dustFragment} uniforms={uniforms} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/** Scroll drives the flight; pointer (desktop) or gyroscope (Android) adds parallax while the poster is open. */
function Rig({ progress, panel, reduced, mobile, layout }: Shared & { layout: Layout }) {
  const smoothed = useRef(0);
  const tilt = useRef({ x: 0, y: 0 });
  const offset = useRef({ x: 0, y: 0 });
  const lastView = useRef("");

  useEffect(() => {
    type IOSOrientation = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
    if (!mobile || typeof DeviceOrientationEvent === "undefined") return;
    if (typeof (DeviceOrientationEvent as IOSOrientation).requestPermission === "function") return;
    const onOrient = (e: DeviceOrientationEvent) => {
      tilt.current.x = THREE.MathUtils.clamp((e.gamma ?? 0) / 30, -1, 1);
      tilt.current.y = THREE.MathUtils.clamp(((e.beta ?? 45) - 45) / 30, -1, 1);
    };
    window.addEventListener("deviceorientation", onOrient);
    return () => window.removeEventListener("deviceorientation", onOrient);
  }, [mobile]);

  useFrame((state, delta) => {
    const cam = state.camera as THREE.PerspectiveCamera;
    const { size, pointer } = state;
    const target = reduced ? 0 : (progress.current ?? 0);
    smoothed.current += (target - smoothed.current) * (1 - Math.exp(-delta * 4.2));
    const f = smooth(0.2, 0.96, smoothed.current);
    const t = state.clock.elapsedTime;

    const inputX = mobile ? tilt.current.x : pointer.x;
    const inputY = mobile ? -tilt.current.y : pointer.y;
    offset.current.x += (inputX - offset.current.x) * (1 - Math.exp(-delta * 3));
    offset.current.y += (inputY - offset.current.y) * (1 - Math.exp(-delta * 3));
    const free = 1 - smooth(0, 0.55, f);
    const sway = reduced ? 0 : Math.sin(t * 0.3) * layout.parallax * 0.25;

    cam.position.set(
      (offset.current.x * layout.parallax + sway) * free,
      THREE.MathUtils.lerp(0, layout.core.y, smooth(0, 0.72, f)) + offset.current.y * layout.parallax * 0.6 * free,
      THREE.MathUtils.lerp(0, layout.endZ, easeInOut(f)),
    );
    cam.rotation.set(0, 0, (reduced ? 0 : Math.sin(t * 0.21) * 0.006) * free);

    // Centre the composition on the poster panel while it is closed.
    const p = panel.current;
    const k = 1 - (p?.open ?? 1);
    const ox = Math.round((size.width / 2 - (p?.cx ?? size.width / 2)) * k);
    const oy = Math.round((size.height / 2 - (p?.cy ?? size.height / 2)) * k);
    const key = `${ox}|${oy}|${size.width}|${size.height}`;
    if (key !== lastView.current) {
      lastView.current = key;
      if (ox === 0 && oy === 0) cam.clearViewOffset();
      else cam.setViewOffset(size.width, size.height, ox, oy, size.width, size.height);
    }
  });
  return null;
}

function World({ progress, panel, reduced, mobile, fov, ph, pw, onReady }: Shared & { fov: number; ph: number; pw: number; onReady?: () => void }) {
  const tex = usePainted(mobile);
  const size = useThree((s) => s.size);
  const layout = useMemo(() => computeLayout(fov, size.width / Math.max(1, size.height), ph, pw), [fov, size.width, size.height, ph, pw]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  return (
    <>
      <SkyPlate map={tex.sky} layout={layout} />
      <Stars layout={layout} mobile={mobile} />
      <GroundFill depth={DEPTH.mesas + 0.5} top={layout.mesas.bottom - layout.mesas.size * (MESAS_GROUND - 0.02)} layout={layout} color="#1f1614" order={1.5} />
      <Plane
        map={tex["mesas-ground"]}
        width={layout.mesas.size * WIDE}
        height={layout.mesas.size * MESAS_GROUND}
        position={[0, layout.mesas.bottom - (layout.mesas.size * MESAS_GROUND) / 2 + layout.mesas.size * 0.004, -(DEPTH.mesas + 0.2)]}
        order={1.7}
        tint="#c9c6d6"
      />
      <Plane map={tex.mesas} width={layout.mesas.size * WIDE} height={layout.mesas.size} position={[0, layout.mesas.y, -DEPTH.mesas]} order={2} tint="#c9c6d6" />
      <Ships map={tex.ships} layout={layout} reduced={reduced} />
      <Plane map={tex.mega} width={layout.mega.size} height={layout.mega.size} position={[0, layout.mega.y, -DEPTH.mega]} order={4} tint="#e6e2e8" />
      <Core layout={layout} progress={progress} reduced={reduced} />
      <GroundFill depth={DEPTH.floor + 0.3} top={layout.floor.bottom - layout.floor.size * (FLOOR_GROUND - 0.02)} layout={layout} color="#1f0f0a" order={8.5} />
      <Plane
        map={tex["floor-ground"]}
        width={layout.floor.size * WIDE}
        height={layout.floor.size * FLOOR_GROUND}
        position={[0, layout.floor.bottom - (layout.floor.size * FLOOR_GROUND) / 2 + layout.floor.size * 0.004, -(DEPTH.floor + 0.1)]}
        order={8.7}
      />
      <Plane map={tex.floor} width={layout.floor.size * WIDE} height={layout.floor.size} position={[0, layout.floor.y, -DEPTH.floor]} order={9} />
      <Plane map={tex.rocks} width={layout.rocks.size * WIDE} height={layout.rocks.size} position={[0, layout.rocks.y, -DEPTH.rocks]} order={10} tint="#b8b2b0" />
      <Dust layout={layout} mobile={mobile} />
      <Rig progress={progress} panel={panel} reduced={reduced} mobile={mobile} layout={layout} />
    </>
  );
}

class GLBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function HeroDiorama({
  progress,
  panel,
  reduced,
  mobile,
  active,
  ph,
  pw,
  onReady,
  eventSource,
}: Shared & { active: boolean; ph: number; pw: number; onReady?: () => void; eventSource?: RefObject<HTMLElement | null> }) {
  const fov = mobile ? 50 : 36;
  return (
    <GLBoundary fallback={null}>
      <Canvas
        className="!absolute inset-0"
        eventSource={eventSource as RefObject<HTMLElement> | undefined}
        eventPrefix="client"
        dpr={[1, mobile ? 1.5 : 1.75]}
        frameloop={active ? "always" : "never"}
        gl={{ antialias: !mobile, powerPreference: "high-performance", alpha: false }}
        camera={{ fov, near: 0.1, far: 1400, position: [0, 0, 0] }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1;
          scene.background = new THREE.Color("#070912");
        }}
      >
        <ambientLight intensity={0.25} />
        <directionalLight position={[-40, 60, 30]} intensity={1.4} color="#dfe3ff" />
        <Suspense fallback={null}>
          <World progress={progress} panel={panel} reduced={reduced} mobile={mobile} fov={fov} ph={ph} pw={pw} onReady={onReady} />
        </Suspense>
      </Canvas>
    </GLBoundary>
  );
}
