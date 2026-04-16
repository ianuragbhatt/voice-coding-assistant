import { useState, useRef, useCallback } from "react";

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  audioBlob: Blob | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetRecorder: () => void;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

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

      // Use webm/opus for better compression and compatibility
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

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        setAudioBlob(audioBlob);

        // Stop all tracks to release the microphone
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.onerror = (_event) => {
        setError("Recording error occurred");
        setIsRecording(false);
      };

      // Start recording with 100ms timeslice for smoother data collection
      mediaRecorder.start(100);
      setIsRecording(true);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to start recording";
      setError(errorMessage);
      setIsRecording(false);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    return new Promise<void>((resolve) => {
      if (!mediaRecorderRef.current || !isRecording) {
        resolve();
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        setAudioBlob(audioBlob);

        // Stop all tracks
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        setIsRecording(false);
        resolve();
      };

      mediaRecorderRef.current.stop();
    });
  }, [isRecording]);

  const resetRecorder = useCallback(() => {
    setAudioBlob(null);
    setError(null);
    audioChunksRef.current = [];

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
  }, []);

  return {
    isRecording,
    audioBlob,
    error,
    startRecording,
    stopRecording,
    resetRecorder,
  };
}
