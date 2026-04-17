import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { Check, Save, Keyboard, Timer, Mic, Brain, Zap, ShieldCheck, ShieldAlert, Cpu } from "lucide-react";
import ModelManager from "./ModelManager";

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
  sttMode: "local" | "api";
  localModel: string;
}

type Tab = "providers" | "general";

interface PermissionState {
  microphone: "granted" | "denied" | "prompt" | "unknown";
  accessibility: boolean;
}

function Field({
  label, type = "text", value, onChange, placeholder, mono = false,
}: {
  label: string; type?: string; value: string | number; onChange: (v: string) => void;
  placeholder?: string; mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-neutral-500 w-14 shrink-0 text-right">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`flex-1 px-2.5 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-white
                   placeholder-neutral-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20
                   transition-all duration-150 ${mono ? "font-mono" : ""}`}
      />
    </div>
  );
}

export default function SettingsPanel({ enableRephrasing, setEnableRephrasing, onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<Tab>("providers");
  const [providers, setProviders] = useState<ProvidersConfig>({
    stt: { base_url: "https://api.openai.com/v1", api_key: "", model: "whisper-1" },
    llm: { base_url: "https://api.openai.com/v1", api_key: "", model: "gpt-4o-mini", temperature: 0.3 },
  });
  const [shortcut, setShortcut] = useState(
    navigator.platform.includes("Mac") ? "cmd+shift+v" : "ctrl+shift+v"
  );
  const [appSettings, setAppSettings] = useState<AppSettings>({
    silenceTimeoutMs: 3000,
    sttMode: "api",
    localModel: "base",
  });
  const [saved, setSaved] = useState(false);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionState>({
    microphone: "unknown",
    accessibility: true,
  });

  useEffect(() => { loadSettings(); checkPermissions(); }, []);

  const loadSettings = async () => {
    try {
      const [sp, ss, st] = await Promise.all([
        invoke<any>("get_store_value", { key: "providers" }),
        invoke<any>("get_store_value", { key: "shortcut" }),
        invoke<any>("get_store_value", { key: "settings" }),
      ]);
      if (sp) setProviders(sp);
      if (typeof ss === "string") setShortcut(ss);
      if (st) setAppSettings((prev) => ({ ...prev, ...st }));
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const checkPermissions = async () => {
    // Check microphone via Web Permissions API
    let micStatus: PermissionState["microphone"] = "unknown";
    try {
      if (navigator.permissions) {
        const result = await navigator.permissions.query({ name: "microphone" as PermissionName });
        micStatus = result.state as "granted" | "denied" | "prompt";
      }
    } catch {
      micStatus = "unknown";
    }

    // Check accessibility via Rust (macOS only; always true on other platforms)
    let accessibilityGranted = true;
    try {
      accessibilityGranted = await invoke<boolean>("check_accessibility_permission");
    } catch {
      accessibilityGranted = true;
    }

    setPermissions({ microphone: micStatus, accessibility: accessibilityGranted });
  };

  const openPermissionSettings = async (type: "microphone" | "accessibility") => {
    try {
      await invoke("open_permission_settings", { permissionType: type });
      // Re-check after a short delay to pick up any changes
      setTimeout(checkPermissions, 2000);
    } catch (err) {
      console.error("Failed to open permission settings:", err);
    }
  };

  const saveSettings = async () => {
    setShortcutError(null);
    try {
      await Promise.all([
        invoke("set_store_value", { key: "providers", value: providers }),
        invoke("set_store_value", { key: "settings", value: appSettings }),
        invoke("update_shortcut", { shortcut: shortcut.trim() }),
      ]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("shortcut") || msg.toLowerCase().includes("invalid")) {
        setShortcutError(msg);
        setTab("general");
      }
    }
  };

  const upd = (type: "stt" | "llm", field: keyof ProviderConfig, value: string) => {
    setProviders((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }));
  };

  const silenceSec = appSettings.silenceTimeoutMs / 1000;
  const isMac = navigator.platform.includes("Mac");
  const showPermissions = isMac && (permissions.microphone === "denied" || !permissions.accessibility);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden border-b border-neutral-800"
    >
      <div className="bg-neutral-900 px-5 py-3">
        {/* Tab bar + AI toggle */}
        <div className="flex items-center gap-1 mb-3">
          {(["providers", "general"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                tab === t ? "bg-neutral-800 text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t === "providers" ? "Providers" : "General"}
            </button>
          ))}
          <div className="flex-1" />
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-indigo-400" />
            <span className="text-xs text-neutral-500">AI</span>
            <button
              onClick={() => setEnableRephrasing(!enableRephrasing)}
              className={`w-8 h-[18px] rounded-full transition-colors relative ${
                enableRephrasing ? "bg-indigo-600" : "bg-neutral-700"
              }`}
            >
              <div
                className="w-3.5 h-3.5 rounded-full bg-white absolute transition-all duration-150"
                style={{ top: "2px", left: enableRephrasing ? "16px" : "2px" }}
              />
            </button>
          </div>
        </div>

        {/* ── PROVIDERS TAB ── */}
        {tab === "providers" && (
          <div className="space-y-4">
            {/* STT Mode Toggle */}
            <div>
              <p className="text-[11px] text-neutral-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Mic className="w-3 h-3" /> Speech-to-Text Mode
              </p>
              <div className="flex rounded-md overflow-hidden border border-neutral-700">
                <button
                  onClick={() => setAppSettings((p) => ({ ...p, sttMode: "local" }))}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    appSettings.sttMode === "local"
                      ? "bg-indigo-600 text-white"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                  }`}
                >
                  <Cpu className="w-3 h-3" />
                  Local (offline)
                </button>
                <div className="w-px bg-neutral-700" />
                <button
                  onClick={() => setAppSettings((p) => ({ ...p, sttMode: "api" }))}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                    appSettings.sttMode === "api"
                      ? "bg-indigo-600 text-white"
                      : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
                  }`}
                >
                  <Zap className="w-3 h-3" />
                  API (cloud)
                </button>
              </div>
            </div>

            {/* Local model selector */}
            {appSettings.sttMode === "local" && (
              <div className="pl-0">
                <ModelManager
                  selectedModel={appSettings.localModel || "base"}
                  onSelectModel={(id) => setAppSettings((p) => ({ ...p, localModel: id }))}
                />
              </div>
            )}

            {/* Cloud STT provider fields */}
            {appSettings.sttMode === "api" && (
              <div className="space-y-1.5">
                <Field label="URL" value={providers.stt.base_url} onChange={(v) => upd("stt", "base_url", v)} placeholder="https://api.openai.com/v1" />
                <Field label="Key" type="password" value={providers.stt.api_key} onChange={(v) => upd("stt", "api_key", v)} placeholder="sk-..." />
                <Field label="Model" value={providers.stt.model} onChange={(v) => upd("stt", "model", v)} placeholder="whisper-1" mono />
              </div>
            )}

            <div className="h-px bg-neutral-800" />

            {/* LLM Rephrasing */}
            <div className="space-y-1.5">
              <p className="text-[11px] text-neutral-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Brain className="w-3 h-3" /> LLM Rephrasing
              </p>
              <Field label="URL" value={providers.llm.base_url} onChange={(v) => upd("llm", "base_url", v)} placeholder="https://api.openai.com/v1" />
              <Field label="Key" type="password" value={providers.llm.api_key} onChange={(v) => upd("llm", "api_key", v)} placeholder="sk-..." />
              <div className="flex items-center gap-3">
                <span className="text-xs text-neutral-500 w-14 shrink-0 text-right">Model</span>
                <input type="text" value={providers.llm.model} onChange={(e) => upd("llm", "model", e.target.value)} placeholder="gpt-4o-mini"
                  className="flex-1 px-2.5 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-white font-mono
                             placeholder-neutral-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all" />
                <input type="number" min="0" max="1" step="0.1" value={providers.llm.temperature ?? 0.3}
                  onChange={(e) => setProviders((p) => ({ ...p, llm: { ...p.llm, temperature: parseFloat(e.target.value) } }))}
                  className="w-14 px-2 py-1.5 rounded-md bg-neutral-800 border border-neutral-700 text-xs text-white text-center
                             focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-all" />
              </div>
              <p className="text-[10px] text-neutral-600 pl-[4.75rem]">
                Works with OpenAI, Ollama (localhost:11434), LM Studio, or any OpenAI-compatible endpoint
              </p>
            </div>
          </div>
        )}

        {/* ── GENERAL TAB ── */}
        {tab === "general" && (
          <div className="space-y-4">
            {/* Shortcut */}
            <div>
              <p className="text-[11px] text-neutral-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                <Keyboard className="w-3 h-3" /> Shortcut
              </p>
              <input
                type="text" value={shortcut}
                onChange={(e) => { setShortcut(e.target.value); setShortcutError(null); }}
                placeholder="cmd+shift+v"
                className={`w-full px-2.5 py-1.5 rounded-md bg-neutral-800 border text-xs text-white font-mono
                            placeholder-neutral-600 focus:outline-none transition-all duration-150
                            ${shortcutError ? "border-red-500 focus:ring-1 focus:ring-red-500/30" : "border-neutral-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20"}`}
              />
              {shortcutError
                ? <p className="text-[11px] text-red-400 mt-1">{shortcutError}</p>
                : <p className="text-[11px] text-neutral-600 mt-1">cmd / ctrl / shift / alt + key</p>}
            </div>

            {/* Silence auto-stop */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] text-neutral-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Timer className="w-3 h-3" /> Silence auto-stop
                </p>
                <span className="text-xs text-neutral-400 font-mono tabular-nums">
                  {silenceSec === 0 ? "off" : `${silenceSec}s`}
                </span>
              </div>
              <input type="range" min="0" max="10" step="0.5" value={silenceSec}
                onChange={(e) => setAppSettings((p) => ({ ...p, silenceTimeoutMs: parseFloat(e.target.value) * 1000 }))}
                className="w-full accent-indigo-500 cursor-pointer" />
              <div className="flex justify-between text-[10px] text-neutral-700 mt-0.5">
                <span>off</span><span>5s</span><span>10s</span>
              </div>
            </div>

            {/* Permissions section — only shown on macOS when there's an issue */}
            {showPermissions && (
              <div>
                <p className="text-[11px] text-neutral-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <ShieldAlert className="w-3 h-3 text-amber-400" /> Permissions
                </p>
                <div className="space-y-1.5">
                  {permissions.microphone === "denied" && (
                    <PermissionRow
                      label="Microphone"
                      status="denied"
                      description="Required for voice recording"
                      onFix={() => openPermissionSettings("microphone")}
                    />
                  )}
                  {!permissions.accessibility && (
                    <PermissionRow
                      label="Accessibility"
                      status="denied"
                      description="Required for text injection (paste)"
                      onFix={() => openPermissionSettings("accessibility")}
                    />
                  )}
                </div>
              </div>
            )}

            {/* All good indicator */}
            {isMac && !showPermissions && permissions.microphone !== "unknown" && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-500">
                <ShieldCheck className="w-3.5 h-3.5" />
                All permissions granted
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-800">
          <span className="text-[11px] text-neutral-600">
            {appSettings.sttMode === "local" ? "whisper.cpp local" : "OpenAI-compatible"}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              className="px-2.5 py-1 rounded-md text-xs text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-all"
            >
              Close
            </button>
            <button
              onClick={saveSettings}
              className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                saved
                  ? "bg-emerald-600/20 text-emerald-400 border border-emerald-600/30"
                  : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }`}
            >
              {saved ? <><Check className="w-3 h-3" /> Saved</> : <><Save className="w-3 h-3" /> Save</>}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function PermissionRow({
  label, status, description, onFix,
}: {
  label: string; status: "granted" | "denied"; description: string; onFix: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-2.5 py-2 rounded-md bg-neutral-800 border border-neutral-700">
      <div>
        <div className="flex items-center gap-1.5">
          {status === "granted"
            ? <ShieldCheck className="w-3 h-3 text-emerald-500" />
            : <ShieldAlert className="w-3 h-3 text-amber-400" />}
          <span className="text-xs text-white">{label}</span>
        </div>
        <p className="text-[10px] text-neutral-500 mt-0.5 ml-[18px]">{description}</p>
      </div>
      {status === "denied" && (
        <button
          onClick={onFix}
          className="ml-3 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20
                     text-[10px] text-amber-400 hover:bg-amber-500/20 transition-colors shrink-0"
        >
          Open Settings
        </button>
      )}
    </div>
  );
}
