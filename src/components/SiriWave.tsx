import { useEffect, useRef } from "react";

interface SiriWaveProps {
  active: boolean;
}

export default function SiriWave({ active }: SiriWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const tRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Each wave: amplitude scale, speed, phase offset, opacity, line width
    const waves = [
      { amp: 1.0, speed: 1.0,  phase: 0.0, alpha: 0.75, lw: 2.5 },
      { amp: 0.65, speed: 1.4, phase: 1.1, alpha: 0.45, lw: 1.8 },
      { amp: 0.45, speed: 0.75,phase: 2.2, alpha: 0.3,  lw: 1.4 },
      { amp: 0.3,  speed: 1.9, phase: 3.5, alpha: 0.18, lw: 1.0 },
    ];
    const MAX_AMP = 28; // pixels

    const drawActive = () => {
      ctx.clearRect(0, 0, W, H);
      tRef.current += 0.025;

      waves.forEach(({ amp, speed, phase, alpha, lw }) => {
        ctx.save();
        ctx.beginPath();
        ctx.lineWidth = lw;
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.shadowColor = "rgba(255,255,255,0.3)";
        ctx.shadowBlur = 6;

        for (let x = 0; x <= W; x += 1) {
          const nx = x / W;
          // Gaussian envelope — tall in centre, tapers to flat at edges
          const env = Math.exp(-Math.pow((nx - 0.5) * 3.8, 2));
          const y =
            H / 2 +
            amp * MAX_AMP * env *
            Math.sin(5.5 * Math.PI * nx + speed * tRef.current + phase);
          x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
      });

      animRef.current = requestAnimationFrame(drawActive);
    };

    const drawIdle = () => {
      ctx.clearRect(0, 0, W, H);
      // Flat line with gentle sine hint
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      for (let x = 0; x <= W; x += 2) {
        const y = H / 2 + 3 * Math.sin((x / W) * 4 * Math.PI);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    if (active) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      drawActive();
    } else {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
        animRef.current = null;
      }
      drawIdle();
    }

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      width={460}
      height={72}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
}
