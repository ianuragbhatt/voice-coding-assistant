import { useEffect, useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Trash2, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Model catalogue
// ─────────────────────────────────────────────────────────────────────────────

type Platform = "mac" | "windows" | "linux";

interface ModelInfo {
  id: string;
  label: string;
  sizeMb: number;
  desc: string;
  language: "en" | "multilingual";
  /** Badge text shown on the card */
  badge?: string;
  /** Which platform this badge is relevant for (undefined = show always) */
  badgePlatform?: Platform;
}

// English-only models: ~30% smaller and faster than multilingual equivalents.
// whisper.cpp uses Metal on macOS, making these the best choice for Apple Silicon.
// Windows / Linux users may prefer multilingual models to support other languages.
const EN_MODELS: ModelInfo[] = [
  {
    id: "tiny.en",
    label: "Tiny (EN)",
    sizeMb: 75,
    desc: "Fastest inference, English only",
    language: "en",
  },
  {
    id: "base.en",
    label: "Base (EN)",
    sizeMb: 148,
    desc: "Best balance of speed and accuracy on Apple Silicon",
    language: "en",
    badge: "BEST FOR MAC",
    badgePlatform: "mac",
  },
  {
    id: "small.en",
    label: "Small (EN)",
    sizeMb: 488,
    desc: "Highest accuracy, English only",
    language: "en",
  },
];

// Multilingual models: support 100+ languages. Best default on Windows / Linux.
// Also work on macOS (still Metal-accelerated) but are larger than the .en variants.
const ML_MODELS: ModelInfo[] = [
  {
    id: "tiny",
    label: "Tiny",
    sizeMb: 75,
    desc: "Fastest inference, 100+ languages",
    language: "multilingual",
  },
  {
    id: "base",
    label: "Base",
    sizeMb: 148,
    desc: "Best balance of speed and accuracy",
    language: "multilingual",
    badge: "RECOMMENDED",
    badgePlatform: undefined, // shown on all non-mac platforms
  },
  {
    id: "small",
    label: "Small",
    sizeMb: 488,
    desc: "Highest accuracy, 100+ languages",
    language: "multilingual",
  },
];

function detectPlatform(): Platform {
  const p = navigator.platform.toLowerCase();
  if (p.includes("mac")) return "mac";
  if (p.includes("win")) return "windows";
  return "linux";
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface LocalModelStatus {
  downloaded: boolean;
  size_bytes: number | null;
  path: string | null;
}

interface DownloadProgress {
  modelId: string;
  progress: number;
  done: boolean;
  error: string | null;
}

type ModelState = "checking" | "not_downloaded" | "downloading" | "downloaded" | "error";

interface ModelViewState {
  state: ModelState;
  progress: number;
  error: string | null;
  sizeBytes: number | null;
}

interface ModelManagerProps {
  selectedModel: string;
  onSelectModel: (id: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ModelManager({ selectedModel, onSelectModel }: ModelManagerProps) {
  const platform = detectPlatform();

  // On macOS show EN models first; on Windows/Linux show multilingual first
  const primaryModels = platform === "mac" ? EN_MODELS : ML_MODELS;
  const secondaryModels = platform === "mac" ? ML_MODELS : EN_MODELS;

  const allModels = [...EN_MODELS, ...ML_MODELS];

  const [modelStates, setModelStates] = useState<Record<string, ModelViewState>>(() => {
    const init: Record<string, ModelViewState> = {};
    for (const m of allModels) {
      init[m.id] = { state: "checking", progress: 0, error: null, sizeBytes: null };
    }
    return init;
  });

  const [showSecondary, setShowSecondary] = useState(false);

  const updateModel = useCallback((id: string, update: Partial<ModelViewState>) => {
    setModelStates((prev) => ({ ...prev, [id]: { ...prev[id], ...update } }));
  }, []);

  useEffect(() => {
    const checkAll = async () => {
      for (const model of allModels) {
        try {
          const status = await invoke<LocalModelStatus>("get_local_model_status", {
            modelId: model.id,
          });
          updateModel(model.id, {
            state: status.downloaded ? "downloaded" : "not_downloaded",
            sizeBytes: status.size_bytes,
          });
        } catch {
          updateModel(model.id, { state: "not_downloaded" });
        }
      }
    };
    checkAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for download progress events from Rust
  useEffect(() => {
    const unlisten = listen<DownloadProgress>("model-download-progress", (event) => {
      const { modelId, progress, done, error } = event.payload;
      if (error) {
        updateModel(modelId, { state: "error", progress: 0, error });
        return;
      }
      if (done) {
        invoke<LocalModelStatus>("get_local_model_status", { modelId })
          .then((s) => updateModel(modelId, { state: "downloaded", progress: 1, sizeBytes: s.size_bytes }))
          .catch(() => updateModel(modelId, { state: "downloaded", progress: 1 }));
      } else {
        updateModel(modelId, { state: "downloading", progress });
      }
    });
    return () => { unlisten.then((f) => f()); };
  }, [updateModel]);

  const handleDownload = useCallback(async (modelId: string) => {
    updateModel(modelId, { state: "downloading", progress: 0, error: null });
    try {
      await invoke("download_local_model", { modelId });
    } catch (err) {
      updateModel(modelId, { state: "error", error: String(err) });
    }
  }, [updateModel]);

  const handleDelete = useCallback(async (modelId: string) => {
    try {
      await invoke("delete_local_model", { modelId });
      updateModel(modelId, { state: "not_downloaded", sizeBytes: null });
      if (selectedModel === modelId) {
        onSelectModel(platform === "mac" ? "base.en" : "base");
      }
    } catch (err) {
      console.error("Failed to delete model:", err);
    }
  }, [selectedModel, onSelectModel, updateModel, platform]);

  const platformLabel = platform === "mac" ? "Apple Silicon" : platform === "windows" ? "Windows" : "Linux";
  const primarySectionLabel = platform === "mac"
    ? "Apple Silicon · English (Metal accelerated)"
    : "Multilingual · 100+ languages";
  const secondarySectionLabel = platform === "mac"
    ? "Multilingual · 100+ languages"
    : "English only · smaller & faster";

  return (
    <div className="space-y-3">
      {/* Primary section */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-[10px] text-neutral-500 uppercase tracking-wider">
            {primarySectionLabel}
          </p>
          {platform === "mac" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
              Recommended for {platformLabel}
            </span>
          )}
          {platform !== "mac" && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
              Recommended for {platformLabel}
            </span>
          )}
        </div>
        {primaryModels.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            platform={platform}
            ms={modelStates[model.id]}
            isSelected={selectedModel === model.id}
            onSelect={() => onSelectModel(model.id)}
            onDownload={() => handleDownload(model.id)}
            onDelete={() => handleDelete(model.id)}
          />
        ))}
      </div>

      {/* Secondary section (collapsible) */}
      <div>
        <button
          onClick={() => setShowSecondary((v) => !v)}
          className="flex items-center gap-1.5 text-[10px] text-neutral-600 hover:text-neutral-400 transition-colors"
        >
          <span>{showSecondary ? "▾" : "▸"}</span>
          <span className="uppercase tracking-wider">{secondarySectionLabel}</span>
        </button>
        <AnimatePresence>
          {showSecondary && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-1.5 mt-1.5 overflow-hidden"
            >
              {secondaryModels.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  platform={platform}
                  ms={modelStates[model.id]}
                  isSelected={selectedModel === model.id}
                  onSelect={() => onSelectModel(model.id)}
                  onDownload={() => handleDownload(model.id)}
                  onDelete={() => handleDelete(model.id)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="text-[10px] text-neutral-600">
        Models from <span className="text-neutral-500">ggerganov/whisper.cpp</span> on HuggingFace.
        Downloaded once, run offline.
        {platform === "mac" && " Metal GPU acceleration enabled automatically."}
        {platform !== "mac" && " CUDA acceleration supported if available."}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ModelCard
// ─────────────────────────────────────────────────────────────────────────────

function ModelCard({
  model, platform, ms, isSelected, onSelect, onDownload, onDelete,
}: {
  model: ModelInfo;
  platform: Platform;
  ms: ModelViewState;
  isSelected: boolean;
  onSelect: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  // Show the badge only if it matches this platform (or has no platform restriction)
  const showBadge = model.badge && (
    model.badgePlatform === undefined || model.badgePlatform === platform
  );

  return (
    <motion.div
      layout
      onClick={onSelect}
      className={`rounded-lg border transition-colors cursor-pointer ${
        isSelected
          ? "border-indigo-500/50 bg-indigo-500/5"
          : "border-neutral-700 bg-neutral-800/50 hover:border-neutral-600"
      }`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between">
          {/* Left: radio + label */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-3 h-3 rounded-full border-2 shrink-0 transition-colors ${
                isSelected ? "border-indigo-500 bg-indigo-500" : "border-neutral-600"
              }`}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-medium text-white">{model.label}</span>
                <span className="text-[10px] text-neutral-500">{model.sizeMb} MB</span>
                {showBadge && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                    {model.badge}
                  </span>
                )}
                <span className={`text-[9px] px-1 py-0.5 rounded border ${
                  model.language === "en"
                    ? "bg-amber-500/10 text-amber-400/80 border-amber-500/20"
                    : "bg-neutral-700/50 text-neutral-500 border-neutral-600/50"
                }`}>
                  {model.language === "en" ? "EN only" : "Multilingual"}
                </span>
              </div>
              <p className="text-[10px] text-neutral-500 mt-0.5">{model.desc}</p>
            </div>
          </div>

          {/* Right: status + actions */}
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            <StatusIcon ms={ms} />
            {(ms.state === "not_downloaded" || ms.state === "error") && (
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(); }}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500
                           text-[10px] text-white transition-colors"
              >
                <Download className="w-2.5 h-2.5" />
                Download
              </button>
            )}
            {ms.state === "downloaded" && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="p-1 rounded-md text-neutral-600 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                title="Delete model"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* Download progress bar */}
        <AnimatePresence>
          {ms.state === "downloading" && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2"
            >
              <div className="w-full h-1 bg-neutral-700 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-indigo-500 rounded-full"
                  animate={{ width: `${Math.round(ms.progress * 100)}%` }}
                  transition={{ duration: 0.2 }}
                />
              </div>
              <p className="text-[10px] text-neutral-500 mt-0.5 text-right">
                {Math.round(ms.progress * 100)}%
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error message */}
        <AnimatePresence>
          {ms.state === "error" && ms.error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[10px] text-red-400 mt-1 truncate"
            >
              {ms.error}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function StatusIcon({ ms }: { ms: ModelViewState }) {
  switch (ms.state) {
    case "checking":    return <Loader2 className="w-3.5 h-3.5 text-neutral-500 animate-spin" />;
    case "downloaded":  return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
    case "downloading": return <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin" />;
    case "error":       return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    default:            return null;
  }
}
