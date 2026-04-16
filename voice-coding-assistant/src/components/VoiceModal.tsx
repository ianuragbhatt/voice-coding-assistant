import { useEffect, useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Square,
  Send,
  RefreshCw,
  Settings,
  X,
  Loader2,
  Sparkles,
} from "lucide-react";
import AudioVisualizer from "./AudioVisualizer";
import SettingsPanel from "./SettingsPanel";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { useLLMRephraser } from "../hooks/useLLMRephraser";

type AppState = "idle" | "recording" | "transcribing" | "rephrasing" | "preview";

export default function VoiceModal() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [transcribedText, setTranscribedText] = useState("");
  const [rephrasedText, setRephrasedText] = useState("");
  const [editedText, setEditedText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [enableRephrasing, setEnableRephrasing] = useState(true);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    isRecording,
    audioBlob,
    error: recorderError,
    startRecording,
    stopRecording,
    resetRecorder,
  } = useAudioRecorder();

  const { transcribe, error: sttError } = useSpeechToText();
  const { rephrase, error: llmError } = useLLMRephraser();

  // Listen for toggle events from Rust
  useEffect(() => {
    const unlisten = listen<boolean>("voice:toggle", (event) => {
      if (event.payload) {
        // Window is being shown, start recording
        handleStartRecording();
      } else {
        // Window is being hidden, stop recording
        handleStopRecording();
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Handle recording state changes
  useEffect(() => {
    if (isRecording) {
      setAppState("recording");
      setError(null);
    }
  }, [isRecording]);

  // Process audio when recording stops
  useEffect(() => {
    if (audioBlob && !isRecording) {
      processAudio(audioBlob);
    }
  }, [audioBlob, isRecording]);

  // Handle errors
  useEffect(() => {
    const err = recorderError || sttError || llmError;
    if (err) {
      setError(err);
    }
  }, [recorderError, sttError, llmError]);

  const handleStartRecording = async () => {
    resetRecorder();
    setTranscribedText("");
    setRephrasedText("");
    setEditedText("");
    setError(null);
    await startRecording();
  };

  const handleStopRecording = async () => {
    await stopRecording();
  };

  const processAudio = async (blob: Blob) => {
    try {
      setAppState("transcribing");

      // Transcribe audio
      const text = await transcribe(blob);
      setTranscribedText(text);

      if (enableRephrasing) {
        setAppState("rephrasing");
        // Rephrase for coding agents
        const rephrased = await rephrase(text);
        setRephrasedText(rephrased);
        setEditedText(rephrased);
      } else {
        setRephrasedText(text);
        setEditedText(text);
      }

      setAppState("preview");

      // Focus textarea
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process audio");
      setAppState("idle");
    }
  };

  const handleSend = async () => {
    try {
      await invoke("type_text", { text: editedText });
      await hideWindow();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to type text");
    }
  };

  const handleRetry = () => {
    handleStartRecording();
  };

  const handleCancel = async () => {
    await hideWindow();
  };

  const hideWindow = async () => {
    const window = getCurrentWindow();
    await window.hide();
    setAppState("idle");
    resetRecorder();
  };

  const toggleRecording = () => {
    if (isRecording) {
      handleStopRecording();
    } else {
      handleStartRecording();
    }
  };

  return (
    <div className="w-full h-screen bg-transparent flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="glass-panel w-full max-w-lg overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white">Voice Assistant</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleCancel}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Settings Panel */}
        <AnimatePresence>
          {showSettings && (
            <SettingsPanel
              enableRephrasing={enableRephrasing}
              setEnableRephrasing={setEnableRephrasing}
              onClose={() => setShowSettings(false)}
            />
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* Recording State */}
            {appState === "recording" && (
              <motion.div
                key="recording"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-8"
              >
                <div className="relative mb-8">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
                    <Mic className="w-10 h-10 text-white" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-blue-500/30 pulse-ring" />
                  <div
                    className="absolute inset-0 rounded-full bg-blue-500/20 pulse-ring"
                    style={{ animationDelay: "0.5s" }}
                  />
                </div>

                <AudioVisualizer isRecording={isRecording} />

                <p className="text-white/60 mt-6 mb-4">Listening...</p>

                <button
                  onClick={toggleRecording}
                  className="glass-button flex items-center gap-2 text-white"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop Recording
                </button>
              </motion.div>
            )}

            {/* Transcribing State */}
            {appState === "transcribing" && (
              <motion.div
                key="transcribing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-12"
              >
                <Loader2 className="w-12 h-12 text-blue-400 animate-spin-slow mb-4" />
                <p className="text-white/60">Transcribing audio...</p>
              </motion.div>
            )}

            {/* Rephrasing State */}
            {appState === "rephrasing" && (
              <motion.div
                key="rephrasing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-12"
              >
                <Sparkles className="w-12 h-12 text-purple-400 animate-pulse mb-4" />
                <p className="text-white/60">Optimizing for coding agents...</p>
              </motion.div>
            )}

            {/* Preview State */}
            {appState === "preview" && (
              <motion.div
                key="preview"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col"
              >
                {/* Original Text */}
                {enableRephrasing && transcribedText !== rephrasedText && (
                  <div className="mb-4 p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-xs text-white/40 mb-1">Original:</p>
                    <p className="text-sm text-white/60 italic">
                      "{transcribedText}"
                    </p>
                  </div>
                )}

                {/* Editable Text */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-white/40">
                      {enableRephrasing
                        ? "Optimized for coding agents:"
                        : "Transcribed text:"}
                    </span>
                    <span className="text-xs text-white/30">
                      {editedText.length} chars
                    </span>
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="glass-input h-32 font-mono text-sm"
                    placeholder="Text will appear here..."
                  />
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={handleRetry}
                    className="glass-button flex items-center gap-2 text-white/70 hover:text-white"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 rounded-xl text-white/60 hover:text-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={!editedText.trim()}
                      className="glass-button flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 border-0 hover:opacity-90 disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      Send
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Idle State */}
            {appState === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col items-center py-12"
              >
                <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <Mic className="w-8 h-8 text-white/30" />
                </div>
                <p className="text-white/40 text-center">
                  Press{" "}
                  <kbd className="px-2 py-1 rounded bg-white/10 text-white/60 text-sm">
                    {navigator.platform.includes("Mac")
                      ? "Cmd+Shift+V"
                      : "Ctrl+Shift+V"}
                  </kbd>{" "}
                  to start
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 p-3 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-sm"
            >
              {error}
            </motion.div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                isRecording ? "bg-red-500 animate-pulse" : "bg-white/20"
              }`}
            />
            <span className="text-xs text-white/40">
              {isRecording ? "Recording" : "Ready"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {enableRephrasing && (
              <span className="text-xs text-purple-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                AI Rephrasing On
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
