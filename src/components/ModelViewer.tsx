import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, ContactShadows } from "@react-three/drei";
import type { Group } from "three";

interface ModelViewerProps {
  modelPath: string;
  autoRotate?: boolean;
  height?: string;
}

const Model = ({ path }: { path: string }) => {
  const { scene } = useGLTF(path);
  const ref = useRef<Group>(null);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.5;
    }
  });

  return (
    <group ref={ref}>
      <primitive object={scene.clone()} scale={1.5} position={[0, -0.5, 0]} />
    </group>
  );
};

const ModelViewer = ({ modelPath, height = "300px" }: ModelViewerProps) => {
  return (
    <div style={{ height, width: "100%" }}>
      <Canvas
        camera={{ position: [0, 1, 3], fov: 45 }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        <Suspense fallback={null}>
          <Model path={modelPath} />
          <ContactShadows
            position={[0, -0.5, 0]}
            opacity={0.4}
            scale={5}
            blur={2}
          />
          <Environment preset="sunset" />
        </Suspense>
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2}
        />
      </Canvas>
    </div>
  );
};

export default ModelViewer;
