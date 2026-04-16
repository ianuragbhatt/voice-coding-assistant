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

const SILENCE_THRESHOLD = 5; // average amplitude below this (out of 255) = silence
const SILENCE_CHECK_INTERVAL_MS = 200;

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const resolveStopRef = useRef<(() => void) | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopRecordingRef = useRef<(() => Promise<void>) | null>(null);

  const clearSilenceDetection = useCallback(() => {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      audioChunksRef.current = [];
      setAudioBlob(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;

      const options: MediaRecorderOptions = {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      };

      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Single onstop handler — set once here, never overridden
      mediaRecorder.onstop = () => {
        clearSilenceDetection();

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        setIsRecording(false);

        // Resolve any pending stopRecording() promise
        resolveStopRef.current?.();
        resolveStopRef.current = null;
      };

      mediaRecorder.onerror = () => {
        clearSilenceDetection();
        setError("Recording error occurred");
        setIsRecording(false);
      };

      mediaRecorder.start(100);
      setIsRecording(true);

      // Silence detection: create a separate AudioContext for analysis
      try {
        const silenceTimeoutMs = await getSilenceTimeout();
        if (silenceTimeoutMs > 0) {
          const audioCtx = new AudioContext();
          audioContextRef.current = audioCtx;
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          let silenceStartTime: number | null = null;

          silenceIntervalRef.current = setInterval(() => {
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

            if (avg < SILENCE_THRESHOLD) {
              if (silenceStartTime === null) {
                silenceStartTime = Date.now();
              } else if (Date.now() - silenceStartTime >= silenceTimeoutMs) {
                // Auto-stop after sustained silence
                stopRecordingRef.current?.();
              }
            } else {
              silenceStartTime = null;
            }
          }, SILENCE_CHECK_INTERVAL_MS);
        }
      } catch {
        // Silence detection is optional — don't fail if it errors
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to start recording";
      setError(errorMessage);
      setIsRecording(false);
    }
  }, [clearSilenceDetection]);

  const stopRecording = useCallback(async () => {
    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve();
        return;
      }

      resolveStopRef.current = resolve;
      mediaRecorderRef.current.stop();
    });
  }, [isRecording]);

  // Keep a ref to stopRecording so silence detection can call it without stale closure
  stopRecordingRef.current = stopRecording;

  const resetRecorder = useCallback(() => {
    clearSilenceDetection();
    setAudioBlob(null);
    setError(null);
    audioChunksRef.current = [];
    resolveStopRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
  }, [clearSilenceDetection]);

  return {
    isRecording,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    resetRecorder,
  };
}

async function getSilenceTimeout(): Promise<number> {
  try {
    const settings = await invoke<any>("get_store_value", { key: "settings" });
    const ms = settings?.silenceTimeoutMs;
    if (typeof ms === "number") return ms;
  } catch {
    // fall through to default
  }
  return 3000; // default: 3 seconds
}
