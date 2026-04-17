import { useEffect, useState, useRef, useCallback } from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, RefreshCw, Send, ShieldAlert } from "lucide-react";
import AudioVisualizer from "./AudioVisualizer";
import SiriWave from "./SiriWave";
import SettingsPanel from "./SettingsPanel";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { useLLMRephraser } from "../hooks/useLLMRephraser";
import { useLocalTranscription } from "../hooks/useLocalTranscription";

type AppState = "idle" | "recording" | "transcribing" | "rephrasing" | "preview";

const WIN_W = 480;
const HEIGHT: Record<string, number> = {
  compact:  118,
  preview:  240,
  settings: 390,
};

export default function VoiceModal() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [transcribedText, setTranscribedText] = useState("");
  const [rephrasedText, setRephrasedText] = useState("");
  const [editedText, setEditedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [enableRephrasing, setEnableRephrasing] = useState(true);
  // Accessibility warning (macOS only — shown in idle bar)
  const [accessibilityMissing, setAccessibilityMissing] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    isRecording, audioBlob, error: recorderError,
    startRecording, stopRecording, resetRecorder,
  } = useAudioRecorder();

  const { transcribe, error: sttError } = useSpeechToText();
  const { rephrase, error: llmError } = useLLMRephraser();
  const { transcribe: localTranscribe, error: localSttError } = useLocalTranscription();

  // Check accessibility permission on mount (macOS only)
  useEffect(() => {
    const check = async () => {
      try {
        const granted = await invoke<boolean>("check_accessibility_permission");
        setAccessibilityMissing(!granted);
      } catch {
        setAccessibilityMissing(false);
      }
    };
    check();
  }, []);

  const resizeWindow = useCallback(async (mode: keyof typeof HEIGHT) => {
    const win = getCurrentWindow();
    await win.setSize(new LogicalSize(WIN_W, HEIGHT[mode]));
  }, []);

  const hideWindow = useCallback(async () => {
    const win = getCurrentWindow();
    await win.hide();
    setAppState("idle");
    setShowSettings(false);
    resetRecorder();
    await resizeWindow("compact");
  }, [resetRecorder, resizeWindow]);

  const handleStartRecording = useCallback(async () => {
    resetRecorder();
    setTranscribedText("");
    setRephrasedText("");
    setEditedText("");
    setError(null);
    setShowSettings(false);
    await resizeWindow("compact");
    await startRecording();
  }, [resetRecorder, startRecording, resizeWindow]);

  const handleStopRecording = useCallback(async () => {
    await stopRecording();
  }, [stopRecording]);

  const handleCancel = useCallback(async () => {
    await hideWindow();
  }, [hideWindow]);

  const handleSend = useCallback(async () => {
    const textToSend = editedText;

    // On macOS, check accessibility permission BEFORE hiding the window.
    // Without it, enigo can't simulate Cmd+V and the text is lost silently.
    const isMacOS = navigator.platform.includes("Mac");
    if (isMacOS) {
      try {
        const granted = await invoke<boolean>("check_accessibility_permission");
        if (!granted) {
          setError(
            "Accessibility permission required to inject text. " +
            "Open System Settings → Privacy & Security → Accessibility → add this app, then try again."
          );
          setAccessibilityMissing(true);
          return; // keep modal open so user can see the error
        }
      } catch {
        // If the check itself fails, proceed anyway
      }
    }

    await hideWindow();
    try {
      await invoke("type_text", { text: textToSend });
    } catch (err) {
      console.error("Failed to type text:", err);
    }
  }, [editedText, hideWindow]);

  const processAudio = useCallback(async (blob: Blob) => {
    try {
      setAppState("transcribing");

      // Read current STT mode and local model from store
      const settings = await invoke<any>("get_store_value", { key: "settings" });
      const sttMode: string = settings?.sttMode ?? "api";
      const localModel: string = settings?.localModel ?? "base";

      let text: string;
      if (sttMode === "local") {
        text = await localTranscribe(blob, localModel);
      } else {
        text = await transcribe(blob);
      }
      setTranscribedText(text);

      if (enableRephrasing) {
        setAppState("rephrasing");
        const rephrased = await rephrase(text);
        setRephrasedText(rephrased);
        setEditedText(rephrased);
      } else {
        setRephrasedText(text);
        setEditedText(text);
      }

      await resizeWindow("preview");
      setAppState("preview");
      setTimeout(() => textareaRef.current?.focus(), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process audio");
      setAppState("idle");
    }
  }, [transcribe, localTranscribe, rephrase, enableRephrasing, resizeWindow]);

  useEffect(() => {
    const unlisten = listen<boolean>("voice:toggle", (event) => {
      if (event.payload) handleStartRecording();
      else handleStopRecording();
    });
    return () => { unlisten.then((f) => f()); };
  }, [handleStartRecording, handleStopRecording]);

  useEffect(() => {
    const unlisten = listen("voice:open-settings", () => {
      setShowSettings(true);
      resizeWindow("settings");
    });
    return () => { unlisten.then((f) => f()); };
  }, [resizeWindow]);

  useEffect(() => {
    if (isRecording) { setAppState("recording"); setError(null); }
  }, [isRecording]);

  useEffect(() => {
    if (audioBlob && !isRecording) processAudio(audioBlob);
  }, [audioBlob, isRecording, processAudio]);

  useEffect(() => {
    const err = recorderError || sttError || llmError || localSttError;
    if (err) setError(err);
  }, [recorderError, sttError, llmError, localSttError]);

  useEffect(() => {
    if (appState !== "preview") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); handleSend(); }
      else if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [appState, handleSend, handleCancel]);

  const isMac = navigator.platform.includes("Mac");
  const isProcessing = appState === "transcribing" || appState === "rephrasing";

  const toggleSettings = useCallback(() => {
    const next = !showSettings;
    setShowSettings(next);
    if (next) resizeWindow("settings");
    else {
      if (appState === "preview") resizeWindow("preview");
      else resizeWindow("compact");
    }
  }, [showSettings, appState, resizeWindow]);

  return (
    <div className="w-full h-screen bg-transparent flex flex-col">
      <div className="w-full h-full bg-[#1c1c1e] rounded-xl flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {showSettings ? (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex flex-col h-full overflow-hidden"
            >
              <div
                data-tauri-drag-region
                className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] select-none shrink-0"
              >
                <span className="text-[11px] font-medium text-white/40 pointer-events-none">Settings</span>
                <button
                  onClick={toggleSettings}
                  className="text-[11px] text-white/40 hover:text-white/70 transition-colors px-2 py-0.5 rounded"
                >
                  Done
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                <SettingsPanel
                  enableRephrasing={enableRephrasing}
                  setEnableRephrasing={setEnableRephrasing}
                  onClose={toggleSettings}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="main"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex flex-col h-full"
            >
              {/* Original text chip (only when rephrasing changed text) */}
              <AnimatePresence>
                {appState === "preview" && enableRephrasing && transcribedText && transcribedText !== rephrasedText && (
                  <motion.div
                    key="original-chip"
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="px-4 pt-3 shrink-0"
                  >
                    <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.05] border border-white/[0.06]">
                      <p className="text-[10px] text-white/30 mb-0.5">Original</p>
                      <p className="text-[11px] text-white/45 italic leading-snug">"{transcribedText}"</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Main visualizer / content area */}
              <div data-tauri-drag-region className="flex-1 flex items-center px-3 min-h-0">
                <AnimatePresence mode="wait">
                  {appState === "recording" && (
                    <motion.div key="rec" className="w-full h-[72px]"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <AudioVisualizer isRecording={true} />
                    </motion.div>
                  )}
                  {isProcessing && (
                    <motion.div key="proc" className="w-full h-[72px]"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                      <SiriWave active />
                    </motion.div>
                  )}
                  {appState === "preview" && (
                    <motion.div key="preview" className="w-full"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <div className="flex items-center justify-between mb-1 px-1">
                        <span className="text-[10px] text-white/30">
                          {enableRephrasing ? "Optimized" : "Transcribed"}
                        </span>
                        <span className="text-[10px] text-white/20">{editedText.length} chars</span>
                      </div>
                      <textarea
                        ref={textareaRef}
                        value={editedText}
                        onChange={(e) => setEditedText(e.target.value)}
                        className="w-full h-[108px] px-2.5 py-2 rounded-lg bg-white/[0.06] border border-white/[0.08]
                                   text-[12px] text-white/90 placeholder-white/20 font-mono leading-relaxed
                                   focus:outline-none focus:border-white/20 focus:ring-0
                                   resize-none transition-colors duration-150"
                        placeholder="Transcribed text will appear here…"
                      />
                    </motion.div>
                  )}
                  {appState === "idle" && (
                    <motion.div key="idle" className="w-full h-[72px]"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                      <SiriWave active={false} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Error strip */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className="px-3 pb-1 shrink-0"
                  >
                    <div className="px-2.5 py-1.5 rounded-lg bg-red-900/30 border border-red-800/40 text-red-400 text-[11px] leading-snug">
                      {accessibilityMissing && error.includes("Accessibility") ? (
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex-1">Accessibility permission needed to inject text.</span>
                          <button
                            onClick={async () => {
                              await invoke("open_permission_settings", { permissionType: "accessibility" });
                              // Re-check after user returns to the app
                              setTimeout(async () => {
                                const granted = await invoke<boolean>("check_accessibility_permission").catch(() => false);
                                setAccessibilityMissing(!granted);
                                if (granted) setError(null);
                              }, 2000);
                            }}
                            className="shrink-0 px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30
                                       text-[10px] text-red-300 hover:bg-red-500/30 transition-colors whitespace-nowrap"
                          >
                            Open Settings
                          </button>
                        </div>
                      ) : (
                        error
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Bottom action bar */}
              <div className="flex items-center justify-between px-3.5 py-2.5 border-t border-white/[0.06] shrink-0">
                {/* Left — status + accessibility warning */}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-[7px] h-[7px] rounded-full transition-colors duration-300 ${
                      isRecording
                        ? "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] animate-pulse"
                        : isProcessing ? "bg-amber-400/70" : "bg-white/15"
                    }`}
                  />
                  <span className="text-[11px] text-white/35 select-none">
                    {isRecording ? "Recording" : isProcessing ? "Voice processing" : appState === "preview" ? "Ready" : "Voice Coding"}
                  </span>
                  {/* Accessibility warning badge (macOS only) */}
                  {accessibilityMissing && appState === "idle" && (
                    <button
                      onClick={toggleSettings}
                      className="flex items-center gap-0.5 text-[10px] text-amber-400/70 hover:text-amber-400 transition-colors"
                      title="Accessibility permission required for text injection"
                    >
                      <ShieldAlert className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>

                {/* Right — action buttons */}
                <div className="flex items-center gap-1.5">
                  {appState === "recording" && (
                    <>
                      <button
                        onClick={handleStopRecording}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-white/70
                                   hover:text-white hover:bg-white/10 transition-colors"
                      >
                        Stop <Kbd>{isMac ? "⌘" : "Ctrl"}↑</Kbd>
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-white/40
                                   hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                      >
                        Cancel <Kbd>esc</Kbd>
                      </button>
                    </>
                  )}
                  {isProcessing && (
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-white/40
                                 hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                    >
                      Cancel <Kbd>esc</Kbd>
                    </button>
                  )}
                  {appState === "preview" && (
                    <>
                      <button
                        onClick={() => handleStartRecording()}
                        className="px-2.5 py-1 rounded-md text-[11px] text-white/40 hover:text-white/70
                                   hover:bg-white/[0.06] transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                      <button
                        onClick={handleCancel}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] text-white/40
                                   hover:text-white/70 hover:bg-white/[0.06] transition-colors"
                      >
                        Cancel <Kbd>esc</Kbd>
                      </button>
                      <button
                        onClick={handleSend}
                        disabled={!editedText.trim()}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium
                                   bg-white/10 text-white/80 hover:bg-white/[0.16] hover:text-white
                                   disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Send className="w-3 h-3" />
                        Send <Kbd>{isMac ? "⌘" : "Ctrl"}↵</Kbd>
                      </button>
                    </>
                  )}
                  {(appState === "idle" || appState === "recording" || appState === "preview") && (
                    <button
                      onClick={toggleSettings}
                      className="ml-0.5 p-1.5 rounded-md text-white/25 hover:text-white/60
                                 hover:bg-white/[0.06] transition-colors"
                      title="Settings"
                    >
                      <Settings className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] px-1 py-0.5 rounded bg-white/10 text-white/35 border border-white/[0.08] font-normal leading-none">
      {children}
    </span>
  );
}
