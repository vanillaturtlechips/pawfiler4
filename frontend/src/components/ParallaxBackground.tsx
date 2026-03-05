import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import gameBackground from "@/assets/game-background.jpg";

interface ParallaxBackgroundProps {
  children: ReactNode;
}

const ParallaxBackground = ({ children }: ParallaxBackgroundProps) => {
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  const springX = useSpring(mouseX, { stiffness: 50, damping: 30 });
  const springY = useSpring(mouseY, { stiffness: 50, damping: 30 });

  const bgX = useTransform(springX, [0, 1], [10, -10]);
  const bgY = useTransform(springY, [0, 1], [10, -10]);
  const bgScale = useTransform(springY, [0, 1], [1.08, 1.04]);

  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      mouseX.set(e.clientX / window.innerWidth);
      mouseY.set(e.clientY / window.innerHeight);
    };
    window.addEventListener("mousemove", handleMouse);
    return () => window.removeEventListener("mousemove", handleMouse);
  }, [mouseX, mouseY]);

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Parallax BG layer */}
      <motion.div
        className="absolute inset-[-40px] z-0"
        style={{
          backgroundImage: `url(${gameBackground})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          x: bgX,
          y: bgY,
          scale: bgScale,
        }}
      />
      {/* Dark overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background:
            "linear-gradient(to bottom, rgba(20,10,5,0.75) 0%, rgba(20,40,20,0.6) 100%)",
        }}
      />
      {/* Content */}
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </div>
  );
};

export default ParallaxBackground;
