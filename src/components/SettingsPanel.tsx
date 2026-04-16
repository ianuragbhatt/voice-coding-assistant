import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { Key, Mic, Brain, Save, Check, Keyboard, Timer } from "lucide-react";

interface SettingsPanelProps {
  enableRephrasing: boolean;
  setEnableRephrasing: (value: boolean) => void;
  onClose: () => void;
}

interface ProviderConfig {
  base_url: string;
  api_key: string;
  model: string;
  temperature?: number;
}

interface ProvidersConfig {
  stt: ProviderConfig;
  llm: ProviderConfig;
}

interface AppSettings {
  silenceTimeoutMs: number;
}

export default function SettingsPanel({
  enableRephrasing,
  setEnableRephrasing,
  onClose,
}: SettingsPanelProps) {
  const [providers, setProviders] = useState<ProvidersConfig>({
    stt: {
      base_url: "https://api.openai.com/v1",
      api_key: "",
      model: "whisper-1",
    },
    llm: {
      base_url: "https://api.openai.com/v1",
      api_key: "",
      model: "gpt-4o-mini",
      temperature: 0.3,
    },
  });
  const [shortcut, setShortcut] = useState(
    navigator.platform.includes("Mac") ? "cmd+shift+v" : "ctrl+shift+v"
  );
  const [appSettings, setAppSettings] = useState<AppSettings>({
    silenceTimeoutMs: 3000,
  });
  const [saved, setSaved] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [storedProviders, storedShortcut, storedSettings] =
        await Promise.all([
          invoke<any>("get_store_value", { key: "providers" }),
          invoke<any>("get_store_value", { key: "shortcut" }),
          invoke<any>("get_store_value", { key: "settings" }),
        ]);

      if (storedProviders) setProviders(storedProviders);
      if (typeof storedShortcut === "string") setShortcut(storedShortcut);
      if (storedSettings) setAppSettings(storedSettings);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const saveSettings = async () => {
    setShortcutError(null);
    try {
      // Save providers and app settings
      await Promise.all([
        invoke("set_store_value", { key: "providers", value: providers }),
        invoke("set_store_value", { key: "settings", value: appSettings }),
      ]);

      // Update shortcut (validates + re-registers in Rust)
      await invoke("update_shortcut", { shortcut: shortcut.trim() });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("shortcut") || msg.toLowerCase().includes("invalid")) {
        setShortcutError(msg);
      } else {
        console.error("Failed to save settings:", err);
      }
    }
  };

  const updateProvider = (
    type: "stt" | "llm",
    field: keyof ProviderConfig,
    value: string | number
  ) => {
    setProviders((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value },
    }));
  };

  const silenceTimeoutSeconds = appSettings.silenceTimeoutMs / 1000;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      className="border-b border-white/10 bg-dark-900/50"
    >
      <div className="p-4 max-h-[400px] overflow-y-auto">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <Key className="w-4 h-4" />
          Provider Configuration
        </h3>

        {/* Rephrasing Toggle */}
        <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-white/5">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-white">AI Rephrasing</span>
          </div>
          <button
            onClick={() => setEnableRephrasing(!enableRephrasing)}
            className={`w-12 h-6 rounded-full transition-colors relative ${
              enableRephrasing ? "bg-purple-500" : "bg-white/20"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
                enableRephrasing ? "translate-x-6" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {/* Global Shortcut */}
        <div className="mb-4">
          <h4 className="text-xs text-white/40 mb-2 flex items-center gap-1">
            <Keyboard className="w-3 h-3" />
            Global Shortcut
          </h4>
          <input
            type="text"
            value={shortcut}
            onChange={(e) => {
              setShortcut(e.target.value);
              setShortcutError(null);
            }}
            placeholder="e.g. cmd+shift+v"
            className="w-full px-3 py-2 rounded-lg bg-dark-900/80 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
          />
          {shortcutError && (
            <p className="text-xs text-red-400 mt-1">{shortcutError}</p>
          )}
          <p className="text-xs text-white/20 mt-1">
            Use modifier keys: cmd, ctrl, shift, alt + key (e.g. cmd+shift+v)
          </p>
        </div>

        {/* Silence Detection */}
        <div className="mb-4">
          <h4 className="text-xs text-white/40 mb-2 flex items-center gap-1">
            <Timer className="w-3 h-3" />
            Auto-stop after silence
          </h4>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={silenceTimeoutSeconds}
              onChange={(e) =>
                setAppSettings((prev) => ({
                  ...prev,
                  silenceTimeoutMs: parseFloat(e.target.value) * 1000,
                }))
              }
              className="flex-1 accent-purple-500"
            />
            <span className="text-xs text-white/60 w-16 text-right">
              {silenceTimeoutSeconds === 0
                ? "Disabled"
                : `${silenceTimeoutSeconds}s`}
            </span>
          </div>
        </div>

        {/* STT Provider */}
        <div className="mb-4">
          <h4 className="text-xs text-white/40 mb-2 flex items-center gap-1">
            <Mic className="w-3 h-3" />
            Speech-to-Text Provider
          </h4>
          <div className="space-y-2">
            <input
              type="text"
              value={providers.stt.base_url}
              onChange={(e) => updateProvider("stt", "base_url", e.target.value)}
              placeholder="Base URL (e.g., https://api.openai.com/v1)"
              className="w-full px-3 py-2 rounded-lg bg-dark-900/80 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
            <input
              type="password"
              value={providers.stt.api_key}
              onChange={(e) => updateProvider("stt", "api_key", e.target.value)}
              placeholder="API Key"
              className="w-full px-3 py-2 rounded-lg bg-dark-900/80 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
            <input
              type="text"
              value={providers.stt.model}
              onChange={(e) => updateProvider("stt", "model", e.target.value)}
              placeholder="Model (e.g., whisper-1)"
              className="w-full px-3 py-2 rounded-lg bg-dark-900/80 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
          </div>
        </div>

        {/* LLM Provider */}
        <div className="mb-4">
          <h4 className="text-xs text-white/40 mb-2 flex items-center gap-1">
            <Brain className="w-3 h-3" />
            LLM Provider (Rephrasing)
          </h4>
          <div className="space-y-2">
            <input
              type="text"
              value={providers.llm.base_url}
              onChange={(e) => updateProvider("llm", "base_url", e.target.value)}
              placeholder="Base URL (e.g., https://api.openai.com/v1)"
              className="w-full px-3 py-2 rounded-lg bg-dark-900/80 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
            <input
              type="password"
              value={providers.llm.api_key}
              onChange={(e) => updateProvider("llm", "api_key", e.target.value)}
              placeholder="API Key"
              className="w-full px-3 py-2 rounded-lg bg-dark-900/80 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={providers.llm.model}
                onChange={(e) => updateProvider("llm", "model", e.target.value)}
                placeholder="Model (e.g., gpt-4o-mini)"
                className="flex-1 px-3 py-2 rounded-lg bg-dark-900/80 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
              />
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={providers.llm.temperature}
                onChange={(e) =>
                  updateProvider("llm", "temperature", parseFloat(e.target.value))
                }
                placeholder="Temp"
                className="w-20 px-3 py-2 rounded-lg bg-dark-900/80 border border-white/10 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/30"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-white/60 hover:text-white text-sm transition-colors"
          >
            Close
          </button>
          <button
            onClick={saveSettings}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all ${
              saved
                ? "bg-green-500/20 text-green-400"
                : "bg-white/10 hover:bg-white/20 text-white"
            }`}
          >
            {saved ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Saved
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Save
              </>
            )}
          </button>
        </div>

        <p className="text-xs text-white/30 mt-3">
          Supports any OpenAI-compatible API (OpenAI, Groq, Ollama, etc.)
        </p>
      </div>
    </motion.div>
  );
}
