import { useEffect, useRef } from "react";

interface AudioVisualizerProps {
  isRecording: boolean;
}

export default function AudioVisualizer({ isRecording }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    const drawPlaceholder = () => {
      ctx.clearRect(0, 0, W, H);
      const count = 52;
      const gap = 2;
      const bw = (W - count * gap) / count;
      for (let i = 0; i < count; i++) {
        const x = i * (bw + gap);
        const bh = 3;
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.beginPath();
        ctx.roundRect(x, (H - bh) / 2, bw, bh, 1);
        ctx.fill();
      }
    };

    if (!isRecording) {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
      if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; analyserRef.current = null; }
      drawPlaceholder();
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;

        // Must resume — WKWebView starts AudioContexts in suspended state
        if (audioCtx.state === "suspended") await audioCtx.resume();

        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.75;
        analyserRef.current = analyser;
        audioCtx.createMediaStreamSource(stream).connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        const count = 52;
        const gap = 2;
        const bw = (W - count * gap) / count;

        const draw = () => {
          if (cancelled) return;
          analyser.getByteFrequencyData(data);
          ctx.clearRect(0, 0, W, H);

          for (let i = 0; i < count; i++) {
            const idx = Math.floor((i / count) * data.length);
            const v = data[idx] / 255;
            const bh = Math.max(3, v * H * 0.9);
            const x = i * (bw + gap);
            const y = (H - bh) / 2;
            // Centre bars are slightly brighter
            const centre = 1 - Math.abs(i / count - 0.5) * 0.55;
            ctx.fillStyle = `rgba(255,255,255,${(0.45 + v * 0.55 * centre).toFixed(2)})`;
            ctx.beginPath();
            ctx.roundRect(x, y, bw, bh, 1.5);
            ctx.fill();
          }

          animRef.current = requestAnimationFrame(draw);
        };

        draw();
      } catch (e) {
        console.warn("AudioVisualizer: mic access failed", e);
        drawPlaceholder();
      }
    };

    start();

    return () => {
      cancelled = true;
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null; }
      if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; analyserRef.current = null; }
    };
  }, [isRecording]);

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
