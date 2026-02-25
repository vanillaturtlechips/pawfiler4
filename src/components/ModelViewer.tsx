import { Suspense, useRef, useState, useMemo, useEffect, Component, type ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF, useAnimations } from "@react-three/drei";
import { Group, Mesh, MeshBasicMaterial, Box3, Vector3, Color, FrontSide } from "three";

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
  const { scene, animations } = useGLTF(path);
  const ref = useRef<Group>(null);
  const { actions } = useAnimations(animations, ref);

  const isDino = path.toLowerCase().includes("dinosaur");

  const clonedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        // Hide transparent eye meshes on the dinosaur model
        if (isDino) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          const hasTransparentEye = materials.some(
            (m) => m?.name?.toLowerCase().includes("eyes_transparent")
          );
          if (hasTransparentEye) {
            child.visible = false;
            return;
          }
        }
        // Replace all materials with MeshBasicMaterial to eliminate
        // lighting-induced z-fighting on voxel models with coplanar faces
        const oldMats = Array.isArray(child.material) ? child.material : [child.material];
        const newMats = oldMats.map((m) => {
          const basic = new MeshBasicMaterial({
            color: (m as any).color ?? new Color(0xffffff),
            map: (m as any).map ?? null,
            side: FrontSide,
            transparent: m.transparent,
            opacity: m.opacity,
          });
          return basic;
        });
        child.material = newMats.length === 1 ? newMats[0] : newMats;
      }
    });
    return clone;
  }, [scene, isDino]);

  // Play first animation if available (fixes T-pose)
  useEffect(() => {
    const names = Object.keys(actions);
    if (names.length > 0 && actions[names[0]]) {
      actions[names[0]]!.reset().fadeIn(0.3).play();
    }
    return () => {
      names.forEach((n) => actions[n]?.fadeOut(0.3));
    };
  }, [actions]);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.5;
    }
  });

  // Auto-fit: compute bounding box to center and scale the model
  const { fitScale, yOffset } = useMemo(() => {
    const box = new Box3().setFromObject(clonedScene);
    const size = new Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const desiredSize = 2.2;
    const s = maxDim > 0 ? desiredSize / maxDim : 1;
    return { fitScale: s, yOffset: -(box.min.y * s) - (size.y * s) / 2 };
  }, [clonedScene]);

  if (!scene || scene.children.length === 0) {
    return null;
  }

  return (
    <group ref={ref}>
      <primitive object={clonedScene} scale={fitScale} position={[0, yOffset, 0]} />
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
            gl={{ antialias: true }}
            style={{ background: "transparent" }}
            onCreated={() => {
              // Canvas created successfully
            }}
          >
            <ambientLight intensity={0.8} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} />
            <Suspense fallback={null}>
              <ModelErrorBoundary fallback={null}>
                <Model path={modelPath} />
              </ModelErrorBoundary>
              {/* Simple shadow plane instead of ContactShadows to avoid GPU stalls */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
                <circleGeometry args={[1.2, 32]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.2} />
              </mesh>
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
