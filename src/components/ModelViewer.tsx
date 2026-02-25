import { Suspense, useRef, useState, useMemo, Component, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, ContactShadows } from "@react-three/drei";
import { Group, Mesh } from "three";

interface ModelViewerProps {
  modelPath: string;
  autoRotate?: boolean;
  height?: string;
}

// Error Boundary to catch Three.js / useGLTF crashes
class ModelErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const Model = ({ path }: { path: string }) => {
  const gltf = useGLTF(path);
  const ref = useRef<Group>(null);
  const clonedScene = useMemo(() => {
    const scene = gltf.scene.clone(true);
    // Hide eye meshes that render as white
    scene.traverse((child) => {
      if (child instanceof Mesh) {
        const name = child.name.toLowerCase();
        console.log("[ModelViewer] mesh:", child.name, "material:", (child.material as any)?.name);
        // Hide eye-related meshes (white texture issue)
        if (
          name.includes("eye") ||
          name.includes("눈") ||
          name.includes("sphere") ||
          name.includes("oval")
        ) {
          child.visible = false;
        }
      }
    });
    return scene;
  }, [gltf.scene]);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.5;
    }
  });

  if (!gltf.scene || gltf.scene.children.length === 0) {
    return null;
  }

  return (
    <group ref={ref}>
      <primitive object={clonedScene} scale={1.5} position={[0, -0.5, 0]} />
    </group>
  );
};

const FallbackUI = ({ height }: { height: string }) => (
  <div
    className="flex flex-col items-center justify-center gap-3 rounded-xl"
    style={{
      height,
      width: "100%",
      background: "hsl(var(--wood-base) / 0.3)",
      border: "2px dashed hsl(var(--parchment-text) / 0.3)",
    }}
  >
    <span className="text-6xl">🦊</span>
    <span className="font-jua text-sm" style={{ color: "hsl(var(--parchment-text) / 0.6)" }}>
      3D 모델을 불러올 수 없어요
    </span>
    <span className="font-nanum text-xs" style={{ color: "hsl(var(--parchment-text) / 0.4)" }}>
      GLB 파일을 확인해주세요
    </span>
  </div>
);

const LoadingUI = ({ height }: { height: string }) => (
  <div
    className="flex flex-col items-center justify-center gap-2"
    style={{ height, width: "100%" }}
  >
    <span className="text-5xl animate-pulse">✨</span>
    <span className="font-jua text-sm" style={{ color: "hsl(var(--parchment-text) / 0.6)" }}>
      모델 로딩 중...
    </span>
  </div>
);

const ModelViewer = ({ modelPath, height = "300px" }: ModelViewerProps) => {
  const [hasError, setHasError] = useState(false);
  const [key, setKey] = useState(modelPath);

  if (key !== modelPath) {
    setKey(modelPath);
    setHasError(false);
  }

  if (hasError) {
    return <FallbackUI height={height} />;
  }

  return (
    <ModelErrorBoundary fallback={<FallbackUI height={height} />}>
      <div style={{ height, width: "100%" }}>
        <Suspense fallback={<LoadingUI height={height} />}>
          <Canvas
            camera={{ position: [0, 1, 3], fov: 45 }}
            style={{ background: "transparent" }}
            onCreated={() => {
              // Canvas created successfully
            }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[5, 5, 5]} intensity={1} />
            <Suspense fallback={null}>
              <ModelErrorBoundary fallback={null}>
                <Model path={modelPath} />
              </ModelErrorBoundary>
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
    </ModelErrorBoundary>
  );
};

export default ModelViewer;
