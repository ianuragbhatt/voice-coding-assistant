import { useState, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  audioBlob: Blob | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetRecorder: () => void;
}

const SILENCE_THRESHOLD = 5; // amplitude avg below this (0–255) = silence
const SILENCE_CHECK_INTERVAL_MS = 200;

// ─────────────────────────────────────────────────────────────────────────────
// WAV encoding helpers
// ─────────────────────────────────────────────────────────────────────────────

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * Encode Float32Array PCM samples as a 16-bit mono WAV Blob.
 * Accepts by both OpenAI Whisper API and whisper.cpp (local mode).
 */
export function float32ToWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2; // 2 bytes per int16
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");

  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);         // sub-chunk size
  view.setUint16(20, 1, true);          // PCM = 1
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // f32 → int16 little-endian
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // PCM chunks collected during recording
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveStopRef = useRef<(() => void) | null>(null);
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);
  const isRecordingRef = useRef(false);

  const cleanup = useCallback(() => {
    if (silenceIntervalRef.current) { clearInterval(silenceIntervalRef.current); silenceIntervalRef.current = null; }
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current = null;
    }
    if (gainNodeRef.current) { gainNodeRef.current.disconnect(); gainNodeRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close(); audioCtxRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  }, []);

  const finishRecording = useCallback(() => {
    // Concatenate all captured PCM chunks
    const total = pcmChunksRef.current.reduce((sum, c) => sum + c.length, 0);
    const pcm = new Float32Array(total);
    let offset = 0;
    for (const chunk of pcmChunksRef.current) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    pcmChunksRef.current = [];

    cleanup();
    setIsRecording(false);
    isRecordingRef.current = false;

    const blob = float32ToWav(pcm, 16000);
    setAudioBlob(blob);

    resolveStopRef.current?.();
    resolveStopRef.current = null;
  }, [cleanup]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      pcmChunksRef.current = [];
      setAudioBlob(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "Microphone access unavailable. Grant microphone permission in System Settings."
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // AudioContext at 16 kHz — whisper.cpp native sample rate
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      if (audioCtx.state === "suspended") await audioCtx.resume();

      const source = audioCtx.createMediaStreamSource(stream);

      // ── PCM capture via ScriptProcessorNode ──
      // bufferSize 4096 = ~256ms at 16kHz (good balance of latency vs overhead)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (!isRecordingRef.current) return;
        const input = e.inputBuffer.getChannelData(0);
        pcmChunksRef.current.push(new Float32Array(input));
      };

      // Muted gain node — ScriptProcessorNode must be connected to destination to fire
      const gain = audioCtx.createGain();
      gain.gain.value = 0;
      gainNodeRef.current = gain;

      source.connect(processor);
      processor.connect(gain);
      gain.connect(audioCtx.destination);

      // ── Silence detection via AnalyserNode (separate branch) ──
      const silenceTimeoutMs = await getSilenceTimeout();
      if (silenceTimeoutMs > 0) {
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let silenceStartTime: number | null = null;

        silenceIntervalRef.current = setInterval(() => {
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
          if (avg < SILENCE_THRESHOLD) {
            if (silenceStartTime === null) silenceStartTime = Date.now();
            else if (Date.now() - silenceStartTime >= silenceTimeoutMs) {
              stopRecordingRef.current?.();
            }
          } else {
            silenceStartTime = null;
          }
        }, SILENCE_CHECK_INTERVAL_MS);
      }

      isRecordingRef.current = true;
      setIsRecording(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start recording";
      setError(msg);
      setIsRecording(false);
      isRecordingRef.current = false;
      cleanup();
    }
  }, [cleanup]);

  const stopRecording = useCallback(async () => {
    return new Promise<void>((resolve) => {
      if (!isRecordingRef.current) {
        resolve();
        return;
      }
      resolveStopRef.current = resolve;
      finishRecording();
    });
  }, [finishRecording]);

  // Keep ref in sync so silence detection can call stopRecording without stale closure
  stopRecordingRef.current = stopRecording;

  const resetRecorder = useCallback(() => {
    cleanup();
    setAudioBlob(null);
    setError(null);
    pcmChunksRef.current = [];
    resolveStopRef.current = null;
    isRecordingRef.current = false;
    setIsRecording(false);
  }, [cleanup]);

  return { isRecording, audioBlob, error, startRecording, stopRecording, resetRecorder };
}

async function getSilenceTimeout(): Promise<number> {
  try {
    const settings = await invoke<any>("get_store_value", { key: "settings" });
    const ms = settings?.silenceTimeoutMs;
    if (typeof ms === "number") return ms;
  } catch {
    // fall through
  }
  return 3000;
}
