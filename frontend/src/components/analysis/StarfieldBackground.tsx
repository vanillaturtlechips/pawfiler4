import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

/**
 * Animated starfield canvas + layered aurora gradients.
 * Renders twinkling stars, shooting stars, and soft nebula blobs
 * for an "analyzing under the Milky Way" vibe.
 */
export default function StarfieldBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let raf: number;

    const resize = () => {
      canvas.width = window.innerWidth * devicePixelRatio;
      canvas.height = window.innerHeight * devicePixelRatio;
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Stars
    interface Star { x: number; y: number; r: number; base: number; speed: number; phase: number; color: string }
    const starColors = [
      "rgba(200,220,255,", // blue-white
      "rgba(255,230,200,", // warm
      "rgba(180,200,255,", // cool blue
      "rgba(255,200,220,", // pink
      "rgba(200,255,230,", // mint
    ];
    const stars: Star[] = Array.from({ length: 280 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 1.8 + 0.3,
      base: Math.random() * 0.6 + 0.3,
      speed: Math.random() * 2 + 0.5,
      phase: Math.random() * Math.PI * 2,
      color: starColors[Math.floor(Math.random() * starColors.length)],
    }));

    // Shooting stars
    interface Shooter { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }
    let shooters: Shooter[] = [];
    let shootTimer = 0;

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w(), h());

      // Draw stars
      for (const s of stars) {
        const twinkle = Math.sin(t * 0.001 * s.speed + s.phase) * 0.4 + s.base;
        const alpha = Math.max(0.05, Math.min(1, twinkle));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.color + alpha + ")";
        ctx.fill();

        // Glow for larger stars
        if (s.r > 1.2) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
          ctx.fillStyle = s.color + (alpha * 0.15) + ")";
          ctx.fill();
        }
      }

      // Shooting stars
      shootTimer++;
      if (shootTimer > 180 + Math.random() * 200) {
        shootTimer = 0;
        const angle = Math.PI * 0.2 + Math.random() * 0.3;
        const speed = 4 + Math.random() * 4;
        shooters.push({
          x: Math.random() * w() * 0.8,
          y: Math.random() * h() * 0.3,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 40 + Math.random() * 30,
        });
      }

      shooters = shooters.filter(s => s.life < s.maxLife);
      for (const s of shooters) {
        s.x += s.vx;
        s.y += s.vy;
        s.life++;
        const progress = s.life / s.maxLife;
        const fade = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;
        const len = 25;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * len * 0.15, s.y - s.vy * len * 0.15);
        ctx.strokeStyle = `rgba(200, 230, 255, ${fade * 0.9})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Trail glow
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * len * 0.3, s.y - s.vy * len * 0.3);
        ctx.strokeStyle = `rgba(150, 200, 255, ${fade * 0.3})`;
        ctx.lineWidth = 5;
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Deep space gradient base – brighter than before */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            180deg,
            hsl(230 45% 8%) 0%,
            hsl(225 40% 12%) 25%,
            hsl(240 35% 15%) 50%,
            hsl(260 30% 13%) 75%,
            hsl(220 40% 10%) 100%
          )`,
        }}
      />

      {/* Milky Way band */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            135deg,
            transparent 20%,
            hsla(220, 60%, 70%, 0.04) 35%,
            hsla(240, 50%, 80%, 0.07) 45%,
            hsla(260, 40%, 70%, 0.05) 55%,
            hsla(280, 50%, 60%, 0.04) 65%,
            transparent 80%
          )`,
        }}
      />

      {/* Canvas for animated stars */}
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Aurora blob 1 – teal/cyan */}
      <motion.div
        className="absolute -top-[10%] left-[10%] w-[60vw] h-[40vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(180, 70%, 55%, 0.12), hsla(200, 80%, 50%, 0.06), transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ x: [0, 60, -20, 0], y: [0, 30, -10, 0], scale: [1, 1.15, 0.95, 1] }}
        transition={{ repeat: Infinity, duration: 18, ease: "easeInOut" }}
      />

      {/* Aurora blob 2 – purple/magenta */}
      <motion.div
        className="absolute top-[30%] -right-[5%] w-[50vw] h-[45vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(280, 60%, 55%, 0.1), hsla(300, 50%, 45%, 0.05), transparent 70%)",
          filter: "blur(90px)",
        }}
        animate={{ x: [0, -40, 20, 0], y: [0, -20, 30, 0], scale: [1, 1.1, 0.9, 1] }}
        transition={{ repeat: Infinity, duration: 14, ease: "easeInOut", delay: 3 }}
      />

      {/* Aurora blob 3 – warm pink at bottom */}
      <motion.div
        className="absolute -bottom-[15%] left-[20%] w-[55vw] h-[35vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(340, 60%, 55%, 0.08), hsla(20, 70%, 50%, 0.04), transparent 70%)",
          filter: "blur(100px)",
        }}
        animate={{ x: [0, 30, -30, 0], y: [0, -15, 15, 0], scale: [1, 1.08, 1, 1] }}
        transition={{ repeat: Infinity, duration: 20, ease: "easeInOut", delay: 6 }}
      />

      {/* Subtle nebula center glow */}
      <motion.div
        className="absolute top-[15%] left-[35%] w-[30vw] h-[30vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(210, 80%, 70%, 0.06), transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
      />
    </div>
  );
}
