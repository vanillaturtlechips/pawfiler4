import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

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

    interface Star { x: number; y: number; r: number; base: number; speed: number; phase: number; color: string }
    const starColors = [
      "rgba(220,235,255,",
      "rgba(255,240,210,",
      "rgba(200,220,255,",
      "rgba(255,210,230,",
      "rgba(210,255,240,",
      "rgba(255,255,240,",
    ];
    const stars: Star[] = Array.from({ length: 350 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      r: Math.random() * 2.2 + 0.4,
      base: Math.random() * 0.5 + 0.45,
      speed: Math.random() * 2 + 0.5,
      phase: Math.random() * Math.PI * 2,
      color: starColors[Math.floor(Math.random() * starColors.length)],
    }));

    interface Shooter { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }
    let shooters: Shooter[] = [];
    let shootTimer = 0;

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w(), h());

      for (const s of stars) {
        const twinkle = Math.sin(t * 0.001 * s.speed + s.phase) * 0.35 + s.base;
        const alpha = Math.max(0.15, Math.min(1, twinkle));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.color + alpha + ")";
        ctx.fill();

        if (s.r > 1.0) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 4, 0, Math.PI * 2);
          ctx.fillStyle = s.color + (alpha * 0.12) + ")";
          ctx.fill();
        }
      }

      shootTimer++;
      if (shootTimer > 140 + Math.random() * 160) {
        shootTimer = 0;
        const angle = Math.PI * 0.15 + Math.random() * 0.35;
        const speed = 5 + Math.random() * 4;
        shooters.push({
          x: Math.random() * w() * 0.8,
          y: Math.random() * h() * 0.25,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 35 + Math.random() * 25,
        });
      }

      shooters = shooters.filter(s => s.life < s.maxLife);
      for (const s of shooters) {
        s.x += s.vx;
        s.y += s.vy;
        s.life++;
        const progress = s.life / s.maxLife;
        const fade = progress < 0.3 ? progress / 0.3 : 1 - (progress - 0.3) / 0.7;

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 4, s.y - s.vy * 4);
        ctx.strokeStyle = `rgba(220, 240, 255, ${fade * 0.95})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 8, s.y - s.vy * 8);
        ctx.strokeStyle = `rgba(180, 210, 255, ${fade * 0.35})`;
        ctx.lineWidth = 6;
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
      {/* Brighter deep space gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            180deg,
            hsl(228 40% 12%) 0%,
            hsl(230 38% 16%) 25%,
            hsl(245 32% 20%) 50%,
            hsl(260 28% 18%) 75%,
            hsl(225 35% 14%) 100%
          )`,
        }}
      />

      {/* Milky Way band – more visible */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            135deg,
            transparent 15%,
            hsla(220, 60%, 75%, 0.06) 30%,
            hsla(240, 50%, 85%, 0.1) 45%,
            hsla(260, 45%, 75%, 0.08) 55%,
            hsla(280, 50%, 65%, 0.06) 65%,
            transparent 80%
          )`,
        }}
      />

      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Aurora blob 1 – brighter teal */}
      <motion.div
        className="absolute -top-[5%] left-[5%] w-[65vw] h-[45vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(180, 75%, 60%, 0.18), hsla(200, 80%, 55%, 0.08), transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ x: [0, 60, -20, 0], y: [0, 30, -10, 0], scale: [1, 1.15, 0.95, 1] }}
        transition={{ repeat: Infinity, duration: 18, ease: "easeInOut" }}
      />

      {/* Aurora blob 2 – brighter purple */}
      <motion.div
        className="absolute top-[25%] -right-[5%] w-[55vw] h-[50vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(275, 65%, 60%, 0.15), hsla(300, 55%, 50%, 0.07), transparent 70%)",
          filter: "blur(90px)",
        }}
        animate={{ x: [0, -40, 20, 0], y: [0, -20, 30, 0], scale: [1, 1.1, 0.9, 1] }}
        transition={{ repeat: Infinity, duration: 14, ease: "easeInOut", delay: 3 }}
      />

      {/* Aurora blob 3 – warm rose at bottom */}
      <motion.div
        className="absolute -bottom-[10%] left-[15%] w-[60vw] h-[40vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(335, 65%, 60%, 0.12), hsla(20, 75%, 55%, 0.06), transparent 70%)",
          filter: "blur(100px)",
        }}
        animate={{ x: [0, 30, -30, 0], y: [0, -15, 15, 0], scale: [1, 1.08, 1, 1] }}
        transition={{ repeat: Infinity, duration: 20, ease: "easeInOut", delay: 6 }}
      />

      {/* Center nebula – brighter */}
      <motion.div
        className="absolute top-[10%] left-[30%] w-[40vw] h-[35vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(210, 80%, 75%, 0.1), transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.12, 1] }}
        transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
      />
    </div>
  );
}
