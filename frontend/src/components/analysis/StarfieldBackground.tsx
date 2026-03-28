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

    interface Star { x: number; y: number; r: number; base: number; speed: number; phase: number; color: string; glow: boolean }
    const starColors = [
      "rgba(230,240,255,",
      "rgba(255,245,215,",
      "rgba(210,230,255,",
      "rgba(255,215,235,",
      "rgba(215,255,240,",
      "rgba(255,255,235,",
      "rgba(200,210,255,",
    ];
    const stars: Star[] = Array.from({ length: 400 }, () => {
      const r = Math.random() * 2.5 + 0.3;
      return {
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r,
        base: Math.random() * 0.4 + 0.5,
        speed: Math.random() * 2.5 + 0.4,
        phase: Math.random() * Math.PI * 2,
        color: starColors[Math.floor(Math.random() * starColors.length)],
        glow: r > 1.3,
      };
    });

    interface Shooter { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string }
    const shooterColors = [
      "200, 230, 255",
      "230, 200, 255",
      "200, 255, 230",
    ];
    let shooters: Shooter[] = [];
    let shootTimer = 0;

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w(), h());

      for (const s of stars) {
        const twinkle = Math.sin(t * 0.001 * s.speed + s.phase) * 0.3 + s.base;
        const alpha = Math.max(0.2, Math.min(1, twinkle));

        // Cross-shape flicker for big stars
        if (s.glow) {
          const flicker = Math.sin(t * 0.002 * s.speed + s.phase) * 0.15 + 0.25;
          ctx.save();
          ctx.globalAlpha = flicker;
          ctx.beginPath();
          ctx.moveTo(s.x - s.r * 5, s.y);
          ctx.lineTo(s.x + s.r * 5, s.y);
          ctx.strokeStyle = s.color + "0.3)";
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(s.x, s.y - s.r * 5);
          ctx.lineTo(s.x, s.y + s.r * 5);
          ctx.stroke();
          ctx.restore();

          // Halo
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 4.5, 0, Math.PI * 2);
          ctx.fillStyle = s.color + (alpha * 0.08) + ")";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.color + alpha + ")";
        ctx.fill();
      }

      // Shooting stars
      shootTimer++;
      if (shootTimer > 100 + Math.random() * 140) {
        shootTimer = 0;
        const angle = Math.PI * 0.12 + Math.random() * 0.4;
        const speed = 5 + Math.random() * 5;
        shooters.push({
          x: Math.random() * w() * 0.85,
          y: Math.random() * h() * 0.3,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 0,
          maxLife: 30 + Math.random() * 25,
          color: shooterColors[Math.floor(Math.random() * shooterColors.length)],
        });
      }

      shooters = shooters.filter(s => s.life < s.maxLife);
      for (const s of shooters) {
        s.x += s.vx;
        s.y += s.vy;
        s.life++;
        const progress = s.life / s.maxLife;
        const fade = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;

        // Head glow
        ctx.beginPath();
        ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.color}, ${fade * 0.6})`;
        ctx.fill();

        // Trail
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 5, s.y - s.vy * 5);
        ctx.strokeStyle = `rgba(${s.color}, ${fade * 0.8})`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Wider trail glow
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 8, s.y - s.vy * 8);
        ctx.strokeStyle = `rgba(${s.color}, ${fade * 0.2})`;
        ctx.lineWidth = 7;
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
      {/* Brighter gradient base */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            180deg,
            hsl(230 38% 14%) 0%,
            hsl(232 34% 18%) 20%,
            hsl(248 28% 22%) 45%,
            hsl(265 24% 20%) 65%,
            hsl(235 30% 16%) 85%,
            hsl(228 35% 13%) 100%
          )`,
        }}
      />

      {/* Milky Way band */}
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            135deg,
            transparent 10%,
            hsla(220, 65%, 78%, 0.07) 28%,
            hsla(245, 55%, 82%, 0.12) 42%,
            hsla(265, 45%, 75%, 0.09) 55%,
            hsla(285, 55%, 65%, 0.06) 68%,
            transparent 82%
          )`,
        }}
      />

      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Aurora 1 – teal/cyan – top left */}
      <motion.div
        className="absolute -top-[5%] left-[3%] w-[70vw] h-[50vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(175, 80%, 62%, 0.22), hsla(195, 85%, 58%, 0.1), transparent 70%)",
          filter: "blur(80px)",
        }}
        animate={{ x: [0, 70, -25, 0], y: [0, 35, -15, 0], scale: [1, 1.18, 0.92, 1] }}
        transition={{ repeat: Infinity, duration: 16, ease: "easeInOut" }}
      />

      {/* Aurora 2 – purple/violet – center right */}
      <motion.div
        className="absolute top-[20%] -right-[8%] w-[60vw] h-[55vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(270, 65%, 62%, 0.18), hsla(295, 55%, 55%, 0.08), transparent 70%)",
          filter: "blur(90px)",
        }}
        animate={{ x: [0, -50, 25, 0], y: [0, -25, 35, 0], scale: [1, 1.12, 0.88, 1] }}
        transition={{ repeat: Infinity, duration: 13, ease: "easeInOut", delay: 3 }}
      />

      {/* Aurora 3 – warm rose – bottom */}
      <motion.div
        className="absolute -bottom-[8%] left-[12%] w-[65vw] h-[42vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(330, 70%, 62%, 0.15), hsla(15, 80%, 58%, 0.07), transparent 70%)",
          filter: "blur(100px)",
        }}
        animate={{ x: [0, 35, -35, 0], y: [0, -18, 18, 0], scale: [1, 1.1, 0.95, 1] }}
        transition={{ repeat: Infinity, duration: 19, ease: "easeInOut", delay: 6 }}
      />

      {/* Center blue nebula */}
      <motion.div
        className="absolute top-[8%] left-[28%] w-[44vw] h-[38vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(210, 85%, 75%, 0.12), transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ opacity: [0.5, 1, 0.5], scale: [1, 1.15, 1] }}
        transition={{ repeat: Infinity, duration: 7, ease: "easeInOut" }}
      />

      {/* Small golden accent */}
      <motion.div
        className="absolute top-[55%] left-[60%] w-[25vw] h-[20vh] rounded-full"
        style={{
          background: "radial-gradient(ellipse, hsla(40, 80%, 65%, 0.08), transparent 70%)",
          filter: "blur(50px)",
        }}
        animate={{ opacity: [0.3, 0.7, 0.3], x: [0, 20, 0] }}
        transition={{ repeat: Infinity, duration: 10, ease: "easeInOut", delay: 4 }}
      />
    </div>
  );
}
