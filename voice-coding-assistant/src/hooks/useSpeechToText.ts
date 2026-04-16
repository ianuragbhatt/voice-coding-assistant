import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UseSpeechToTextReturn {
  transcribe: (audioBlob: Blob) => Promise<string>;
  isTranscribing: boolean;
  error: string | null;
}

interface ProviderConfig {
  base_url: string;
  api_key: string;
  model: string;
}

export function useSpeechToText(): UseSpeechToTextReturn {
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transcribe = useCallback(async (audioBlob: Blob): Promise<string> => {
    setIsTranscribing(true);
    setError(null);

    try {
      // Get provider config from store
      const providers = await invoke<any>("get_store_value", {
        key: "providers",
      });

      const sttConfig: ProviderConfig = providers?.stt || {
        base_url: "https://api.openai.com/v1",
        api_key: "",
        model: "whisper-1",
      };

      if (!sttConfig.api_key) {
        throw new Error(
          "STT API key not configured. Please set it in the settings."
        );
      }

      // Convert Blob to File
      const audioFile = new File([audioBlob], "audio.webm", {
        type: "audio/webm",
      });

      // Create FormData for the API request
      const formData = new FormData();
      formData.append("file", audioFile);
      formData.append("model", sttConfig.model);
      formData.append("response_format", "json");

      // Make API request
      const response = await fetch(`${sttConfig.base_url}/audio/transcriptions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sttConfig.api_key}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message ||
            `STT API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return data.text || "";
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to transcribe audio";
      setError(errorMessage);
      throw err;
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  return {
    transcribe,
    isTranscribing,
    error,
  };
}
