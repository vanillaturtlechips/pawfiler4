import { Suspense, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, ContactShadows } from "@react-three/drei";
import type { Group } from "three";
import { motion } from "framer-motion";

interface ModelViewerProps {
  modelPath: string;
  autoRotate?: boolean;
  height?: string;
}

const Model = ({ path, onError }: { path: string; onError: () => void }) => {
  const gltf = useGLTF(path);
  const ref = useRef<Group>(null);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.5;
    }
  });

  // Check if scene actually has visible children
  if (!gltf.scene || gltf.scene.children.length === 0) {
    onError();
    return null;
  }

  return (
    <group ref={ref}>
      <primitive object={gltf.scene.clone()} scale={1.5} position={[0, -0.5, 0]} />
    </group>
  );
};

const FallbackUI = ({ height }: { height: string }) => (
  <motion.div
    className="flex flex-col items-center justify-center gap-3 rounded-xl"
    style={{
      height,
      width: "100%",
      background: "hsl(var(--wood-base) / 0.3)",
      border: "2px dashed hsl(var(--parchment-text) / 0.3)",
    }}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
  >
    <span className="text-6xl">🦊</span>
    <span className="font-jua text-sm" style={{ color: "hsl(var(--parchment-text) / 0.6)" }}>
      3D 모델을 불러올 수 없어요
    </span>
    <span className="font-nanum text-xs" style={{ color: "hsl(var(--parchment-text) / 0.4)" }}>
      GLB 파일을 확인해주세요
    </span>
  </motion.div>
);

const LoadingUI = ({ height }: { height: string }) => (
  <div
    className="flex flex-col items-center justify-center gap-2"
    style={{ height, width: "100%" }}
  >
    <motion.span
      className="text-5xl"
      animate={{ rotate: [0, 10, -10, 0], scale: [1, 1.1, 1] }}
      transition={{ repeat: Infinity, duration: 1.5 }}
    >
      ✨
    </motion.span>
    <span className="font-jua text-sm" style={{ color: "hsl(var(--parchment-text) / 0.6)" }}>
      모델 로딩 중...
    </span>
  </div>
);

const ModelViewer = ({ modelPath, height = "300px" }: ModelViewerProps) => {
  const [hasError, setHasError] = useState(false);
  const [key, setKey] = useState(modelPath);

  // Reset error state when model changes
  if (key !== modelPath) {
    setKey(modelPath);
    setHasError(false);
  }

  if (hasError) {
    return <FallbackUI height={height} />;
  }

  return (
    <div style={{ height, width: "100%" }}>
      <Suspense fallback={<LoadingUI height={height} />}>
        <Canvas
          camera={{ position: [0, 1, 3], fov: 45 }}
          style={{ background: "transparent" }}
          onError={() => setHasError(true)}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 5, 5]} intensity={1} />
          <Suspense fallback={null}>
            <Model path={modelPath} onError={() => setHasError(true)} />
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
      </Suspense>
    </div>
  );
};

export default ModelViewer;
