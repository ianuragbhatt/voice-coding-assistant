import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UseLLMRephraserReturn {
  rephrase: (text: string) => Promise<string>;
  isRephrasing: boolean;
  error: string | null;
}

interface ProviderConfig {
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
}

const CODING_AGENT_PROMPT = `You are a command optimizer for coding AI agents. Your task is to convert the user's speech into clear, structured instructions that coding agents can understand perfectly.

Guidelines:
1. Remove filler words (um, uh, like, you know)
2. Convert vague descriptions into specific technical terms
3. Structure the command with clear action items
4. Add context when needed (e.g., function names, parameters)
5. Keep the original intent but make it executable

Examples:
- "Uhh, create like a function that calculates the fibonacci numbers using recursion please" 
  → "Create a recursive function named 'fibonacci' that takes an integer n as input and returns the nth Fibonacci number. Include base cases for n=0 and n=1."

- "Make a button that when clicked shows an alert"
  → "Create a button element with text 'Click me'. Add an onClick event handler that displays an alert with the message 'Button clicked!'."

- "Sort this array in descending order"
  → "Sort the array in descending (high to low) order using a comparison function."

User's speech: "{text}"

Optimized command (respond ONLY with the optimized text, no explanations):`;

export function useLLMRephraser(): UseLLMRephraserReturn {
  const [isRephrasing, setIsRephrasing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rephrase = useCallback(async (text: string): Promise<string> => {
    setIsRephrasing(true);
    setError(null);

    try {
      // Get provider config from store
      const providers = await invoke<any>("get_store_value", {
        key: "providers",
      });

      const llmConfig: ProviderConfig = providers?.llm || {
        base_url: "https://api.openai.com/v1",
        api_key: "",
        model: "gpt-4o-mini",
        temperature: 0.3,
      };

      if (!llmConfig.api_key) {
        // If no API key, return original text
        return text;
      }

      const prompt = CODING_AGENT_PROMPT.replace("{text}", text);

      // Make API request
      const response = await fetch(`${llmConfig.base_url}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llmConfig.api_key}`,
        },
        body: JSON.stringify({
          model: llmConfig.model,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          temperature: llmConfig.temperature || 0.3,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message ||
            `LLM API error: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      const rephrased = data.choices?.[0]?.message?.content?.trim();

      if (!rephrased) {
        return text;
      }

      return rephrased;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to rephrase text";
      setError(errorMessage);
      // Return original text on error
      return text;
    } finally {
      setIsRephrasing(false);
    }
  }, []);

  return {
    rephrase,
    isRephrasing,
    error,
  };
}
