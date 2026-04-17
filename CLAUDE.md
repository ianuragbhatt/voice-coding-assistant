# Voice Coding Assistant

A cross-platform desktop app (Tauri v2 · React · Rust) that records your voice, transcribes it locally or via cloud API, optionally improves the phrasing with an LLM, then injects the result into whatever app you're typing in.

---

## Project layout

```
mac_voice_tool/
├── src/                            React frontend
│   ├── components/
│   │   ├── VoiceModal.tsx          Main UI — state machine + all user interactions
│   │   ├── SettingsPanel.tsx       Settings UI (STT mode, providers, permissions)
│   │   ├── ModelManager.tsx        Whisper model download / selection per platform
│   │   ├── AudioVisualizer.tsx     Frequency-bar waveform shown while recording
│   │   └── SiriWave.tsx            Sine-wave animation (idle / processing states)
│   ├── hooks/
│   │   ├── useAudioRecorder.ts     Mic → PCM 16 kHz → WAV blob (ScriptProcessorNode)
│   │   ├── useLocalTranscription.ts  Sends WAV to Rust → whisper.cpp inference
│   │   ├── useSpeechToText.ts      Sends WAV to OpenAI-compatible cloud STT API
│   │   └── useLLMRephraser.ts      Sends transcript to OpenAI-compatible LLM
│   └── test/                       Vitest test suite (30 tests)
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                 App init, tray, shortcut, settings defaults
│   │   └── commands.rs             All Tauri commands + WhisperState cache
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── Entitlements.plist          macOS: audio-input + network entitlements
│   └── Info.plist                  macOS: NSMicrophoneUsageDescription etc.
├── CLAUDE.md                       ← you are here
├── package.json
└── vite.config.ts
```

---

## Build & run

```bash
# Dev (hot-reload frontend + Rust auto-recompile)
npm run tauri:dev

# Type-check TypeScript
npx tsc --noEmit

# Compile-check Rust
cd src-tauri && cargo check

# Run all tests
npm test                        # Vitest — 30 frontend tests
cd src-tauri && cargo test      # Rust unit tests — 6 tests

# Production build
npm run tauri:build
```

All `npm` commands from the repo root. All `cargo` commands from `src-tauri/`.

---

## How it works

### Voice modal state machine

```
idle → recording → transcribing → rephrasing → preview → (inject & close)
                              ↘ (rephrasing off) ↗
```

Window heights: **compact 118 px** (idle/recording) · **preview 240 px** · **settings 390 px**

### Audio pipeline

```
getUserMedia({ sampleRate: 16000, channelCount: 1 })
  └─ ScriptProcessorNode (4096 buf) → Float32Array chunks
       └─ float32ToWav() → 16-bit PCM WAV blob
            ├─ [local]  Array.from(Uint8Array) → invoke("transcribe_local")
            └─ [cloud]  File("audio.wav")      → fetch /audio/transcriptions
```

`ScriptProcessorNode` replaced `MediaRecorder` so both inference paths receive the same WAV format.

### Text injection (macOS critical path)

`type_text` runs on a `tokio::spawn_blocking` thread:
1. Save clipboard → write text → `activate_prev_app()` → sleep 300 ms
2. `app.run_on_main_thread(simulate_paste_keystroke)` — **must be on the main thread**;
   HIToolbox (`TSMGetInputSourceProperty`) hard-crashes on macOS 14+ when called off-thread
3. Block on `mpsc::sync_channel` (3 s timeout) → restore clipboard

### Whisper model cache

`WhisperContext` is wrapped in `Arc` and stored in a `Mutex<WhisperModelCache>` as Tauri managed state. The model is loaded once and reused; it only reloads when the selected `model_id` changes. The `Arc` lets the context be cloned into `spawn_blocking` closures without moving the lock.

---

## Tauri commands

| Command | Description |
|---------|-------------|
| `type_text(text)` | Clipboard-paste with main-thread keyboard simulation |
| `get_store_value(key)` | Read from `settings.json` |
| `set_store_value(key, value)` | Write to `settings.json` |
| `update_shortcut(shortcut)` | Re-register global hotkey and persist |
| `get_local_model_status(modelId)` | Check if GGUF model file exists + size |
| `download_local_model(modelId)` | Stream model from HuggingFace, emit `model-download-progress` events |
| `delete_local_model(modelId)` | Remove model file from disk |
| `transcribe_local(audioWav, modelId)` | Run whisper.cpp inference, return transcript |
| `check_accessibility_permission()` | `AXIsProcessTrusted()` on macOS; `true` on other platforms |
| `open_permission_settings(permissionType)` | Open System Settings to mic / accessibility pane (macOS) |

---

## Settings schema

Stored in `settings.json` via `tauri-plugin-store`. New keys are **merged** in `main.rs` on startup — existing values are never overwritten.

```json
{
  "shortcut": "cmd+shift+v",
  "providers": {
    "stt": { "base_url": "https://api.openai.com/v1", "api_key": "", "model": "whisper-1" },
    "llm": { "base_url": "https://api.openai.com/v1", "api_key": "", "model": "gpt-4o-mini", "temperature": 0.3 }
  },
  "settings": {
    "silenceTimeoutMs": 3000,
    "sttMode": "api",
    "localModel": "base.en"
  }
}
```

`sttMode` — `"api"` (default, backward-compatible) | `"local"` (offline whisper.cpp)  
`localModel` — see model table below; default is `"base.en"` on macOS, `"base"` elsewhere

---

## Local whisper models

Downloaded from `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{id}.bin`  
Stored at `{app_data_dir}/whisper_models/ggml-{id}.bin`

| ID | Size | Language | Platform badge |
|----|------|----------|----------------|
| `tiny.en` | 75 MB | English only | macOS primary |
| `base.en` | 148 MB | English only | **BEST FOR MAC** (default on macOS) |
| `small.en` | 488 MB | English only | macOS primary |
| `tiny` | 75 MB | Multilingual | Windows / Linux primary |
| `base` | 148 MB | Multilingual | **RECOMMENDED** (default on Win/Linux) |
| `small` | 488 MB | Multilingual | Windows / Linux primary |

English-only models are ~30 % smaller and faster because they skip the multilingual decoder. On macOS, whisper.cpp uses Metal automatically — no extra configuration needed. On Windows/Linux, CUDA is supported by recompiling with the `cuda` feature in `Cargo.toml`.

---

## LLM rephrasing

System prompt converts raw dictation into precise coding instructions (removes filler words, adds technical specificity). Works with any OpenAI-compatible endpoint:

- **OpenAI** — set base URL to `https://api.openai.com/v1`
- **Ollama** — `http://localhost:11434/v1` (no API key needed)
- **LM Studio** — `http://localhost:1234/v1`
- **Any vLLM / compatible server** — set the base URL accordingly

If `api_key` is empty the rephrasing step is silently skipped and the raw transcript is used.

---

## macOS setup

### Permissions

Both permissions are required for full functionality.

**Microphone** — the OS dialog appears automatically on the first recording attempt.  
Entitlement: `com.apple.security.device.audio-input`

**Accessibility** — required so `enigo` can simulate Cmd+V to paste text.  
Must be granted manually:  
`System Settings → Privacy & Security → Accessibility → +`  

In **dev mode** the binary is not in `/Applications`. Use **Cmd+Shift+G** in the file picker and navigate to:
```
src-tauri/target/debug/voice-coding-assistant
```
In **production** the `.app` bundle appears in the list automatically after the first launch.

### Private WebView API

`macOSPrivateApi: true` is set in `tauri.conf.json`. This enables two WKWebView KVC keys in `main.rs`:

| Key | Purpose |
|-----|---------|
| `mediaDevicesEnabled` | Allows `navigator.mediaDevices` inside WKWebView |
| `mediaCaptureRequiresSecureConnection: false` | Allows mic access without HTTPS in dev mode |

---

## Known gotchas

| Situation | Detail |
|-----------|--------|
| `simulate_paste_keystroke` must run on main thread | HIToolbox asserts main-queue on macOS 14+; use `run_on_main_thread` + channel |
| `WhisperContext` in `Arc` | Required to clone into `spawn_blocking` without moving the mutex guard |
| WAV format for both paths | `float32ToWav` output is accepted by whisper.cpp and the OpenAI Whisper API |
| `sttMode` defaults to `"api"` | Existing users upgrading are unaffected until they opt into local mode |
| Settings merging, not guarding | `main.rs` uses `.or_insert()` per key so new fields are added without wiping old values |
| `tauri-plugin-shell::open` deprecated | Suppressed with `#[allow(deprecated)]`; switch to `tauri-plugin-opener` when convenient |
| Parakeet (CoreML) not implemented | Would require Swift sidecar or ONNX Runtime; whisper.cpp + Metal covers the use case well |
