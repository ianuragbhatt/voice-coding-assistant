import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UseLocalTranscriptionReturn {
  transcribe: (audioBlob: Blob, modelId: string) => Promise<string>;
  isTranscribing: boolean;
  error: string | null;
}

export function useLocalTranscription(): UseLocalTranscriptionReturn {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcribe = useCallback(async (audioBlob: Blob, modelId: string): Promise<string> => {
    setIsTranscribing(true);
    setError(null);

    try {
      // Convert WAV Blob → Uint8Array → plain number array for Tauri IPC (serde deserializes as Vec<u8>)
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioWav = Array.from(new Uint8Array(arrayBuffer));

      const text = await invoke<string>("transcribe_local", {
        audioWav,
        modelId,
      });

      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  return { transcribe, isTranscribing, error };
}
