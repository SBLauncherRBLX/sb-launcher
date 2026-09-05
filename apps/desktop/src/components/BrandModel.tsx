import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls, Center } from "@react-three/drei";
import type { Group } from "three";

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const ref = useRef<Group>(null);
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.35; // slow coin spin
    }
  });
  return (
    <group ref={ref}>
      <primitive object={scene} />
    </group>
  );
}

export function BrandModelViewer() {
  return (
    <div style={{ width: "100%", height: 320, position: "relative" }} aria-label="SB Launcher 3D logo">
      <Canvas camera={{ position: [0, 0.6, 2.2], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} style={{ background: "transparent" }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[2, 3, 2]} intensity={1.1} />
        <directionalLight position={[-2, -1, -2]} intensity={0.5} />
        <Suspense fallback={null}>
          <Center>
            <Model url="/brand-logo-3d.glb" />
          </Center>
          <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={0} maxPolarAngle={Math.PI} autoRotate={false} enableDamping dampingFactor={0.07} rotateSpeed={0.7} />
        </Suspense>
      </Canvas>
    </div>
  );
}

// Preload for faster first paint
useGLTF.preload("/brand-logo-3d.glb");
