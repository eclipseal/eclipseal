"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Edges, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

const LAYERS = 5;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function DieGrid() {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    let i = 0;
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 5; z++) {
        m.makeTranslation(-2.1 + x * 0.6, 0.24, -1.2 + z * 0.6);
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 40]}>
      <boxGeometry args={[0.42, 0.08, 0.42]} />
      <meshStandardMaterial color="#2b2b31" emissive="#d9732f" emissiveIntensity={0.12} roughness={0.4} metalness={0.6} />
    </instancedMesh>
  );
}

function Containers() {
  return (
    <group position={[0, 0.3, 0]}>
      {[-1.6, 0, 1.6].map((x, i) => (
        <mesh key={x} position={[x, 0.12 + (i === 1 ? 0.12 : 0), 0]}>
          <boxGeometry args={[1.2, 0.3 + (i === 1 ? 0.24 : 0), 1.6]} />
          <meshStandardMaterial color="#e8e4da" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Slab({ index, active, children }: { index: number; active: RefObject<number>; children?: React.ReactNode }) {
  const edges = useRef<THREE.LineBasicMaterial>(null);
  const body = useRef<THREE.MeshStandardMaterial>(null);
  const ember = useMemo(() => new THREE.Color("#d9732f"), []);
  const bone = useMemo(() => new THREE.Color("#6f6b63"), []);
  useFrame((_, delta) => {
    const on = Math.round(active.current ?? 0) === index ? 1 : 0;
    if (edges.current) edges.current.color.lerp(on ? ember : bone, 1 - Math.exp(-delta * 8));
    if (body.current) body.current.emissiveIntensity += ((on ? 0.22 : 0.02) - body.current.emissiveIntensity) * (1 - Math.exp(-delta * 8));
  });
  return (
    <group>
      <RoundedBox args={[5.8, 0.34, 4]} radius={0.06} smoothness={3}>
        <meshStandardMaterial ref={body} color="#17171b" emissive="#d9732f" emissiveIntensity={0.02} roughness={0.35} metalness={0.55} />
        <Edges threshold={15}>
          <lineBasicMaterial ref={edges} color="#6f6b63" />
        </Edges>
      </RoundedBox>
      {children}
    </group>
  );
}

function Stack({ progress }: { progress: RefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const slabs = useRef<(THREE.Group | null)[]>([]);
  const quote = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.Mesh>(null);
  const smoothed = useRef(0);
  const active = useRef(0);

  useFrame((state, delta) => {
    smoothed.current += ((progress.current ?? 0) - smoothed.current) * (1 - Math.exp(-delta * 5));
    const p = smoothed.current;
    active.current = Math.min(LAYERS - 1, Math.floor(p * LAYERS * 0.999));
    const spread = 0.42 + smooth(0.02, 0.35, p) * 1.05;
    slabs.current.forEach((g, i) => {
      if (!g) return;
      const lift = i === active.current ? 0.28 : 0;
      g.position.y += (i * spread - (LAYERS - 1) * spread * 0.5 + lift - g.position.y) * (1 - Math.exp(-delta * 7));
    });
    if (group.current) {
      group.current.rotation.y = -0.75 + p * 1.25 + Math.sin(state.clock.elapsedTime * 0.3) * 0.04;
      group.current.rotation.x = 0.42 - smooth(0.6, 1, p) * 0.18;
    }
    const q = smooth(0.8, 1, p);
    if (quote.current) {
      quote.current.position.y = (LAYERS - 1) * spread * 0.5 + 0.9 + q * 1.4;
      (quote.current.material as THREE.MeshStandardMaterial).opacity = 0.25 + q * 0.75;
    }
    if (beam.current) {
      beam.current.scale.y = 0.001 + q * 12;
      beam.current.position.y = (LAYERS - 1) * spread * 0.5 + 0.9 + beam.current.scale.y / 2;
      (beam.current.material as THREE.MeshBasicMaterial).opacity = q * 0.55;
    }
  });

  return (
    <group ref={group}>
      {Array.from({ length: LAYERS }, (_, i) => (
        <group key={i} ref={(el) => void (slabs.current[i] = el)}>
          <Slab index={i} active={active}>
            {i === 0 && <DieGrid />}
            {i === 3 && <Containers />}
          </Slab>
        </group>
      ))}
      <mesh ref={quote} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.6, 3.4]} />
        <meshStandardMaterial color="#e8e4da" emissive="#d9732f" emissiveIntensity={0.25} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={beam}>
        <boxGeometry args={[0.08, 1, 0.08]} />
        <meshBasicMaterial color="#ff8a3d" transparent opacity={0} toneMapped={false} />
      </mesh>
    </group>
  );
}

export default function StackScene({ progress, active, mobile }: { progress: RefObject<number>; active: boolean; mobile: boolean }) {
  return (
    <Canvas
      className="!absolute inset-0"
      dpr={[1, mobile ? 1.5 : 1.75]}
      frameloop={active ? "always" : "never"}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: mobile ? 52 : 40, position: mobile ? [7, 6.5, 10] : [9.5, 8, 13.5], near: 0.1, far: 100 }}
      onCreated={({ camera }) => camera.lookAt(0, mobile ? 1.1 : 0.4, 0)}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[6, 10, 6]} intensity={1.6} color="#fff0dc" />
      <directionalLight position={[-8, 3, -4]} intensity={0.7} color="#8193f5" />
      <pointLight position={[0, 4, 0]} intensity={14} color="#d9732f" distance={14} />
      <Stack progress={progress} />
    </Canvas>
  );
}
