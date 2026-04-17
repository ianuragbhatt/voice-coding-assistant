# CLAUDE.md — Voice Coding Assistant

## Project Structure

Tauri v2 desktop app (React + Rust) at the repository root.

```
mac_voice_tool/
├── src/                        ← React frontend
│   ├── components/
│   │   ├── VoiceModal.tsx      ← Main UI state machine
│   │   ├── SettingsPanel.tsx   ← Settings UI (providers, model, permissions)
│   │   ├── ModelManager.tsx    ← Whisper model download/selection UI
│   │   ├── AudioVisualizer.tsx ← Frequency-bar waveform (recording state)
│   │   └── SiriWave.tsx        ← Sine-wave animation (idle/processing states)
│   ├── hooks/
│   │   ├── useAudioRecorder.ts     ← Mic capture → PCM WAV via ScriptProcessorNode
│   │   ├── useLocalTranscription.ts← Local whisper.cpp inference via Tauri IPC
│   │   ├── useSpeechToText.ts      ← Cloud STT via OpenAI-compatible API
│   │   └── useLLMRephraser.ts      ← LLM text optimization (OpenAI-compatible)
│   └── test/                   ← Vitest test suite
├── src-tauri/
│   ├── src/
│   │   ├── main.rs             ← App setup, tray, shortcut registration
│   │   └── commands.rs         ← All Tauri commands + WhisperState cache
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── Entitlements.plist      ← macOS: audio-input + network entitlements
│   └── Info.plist              ← macOS: NSMicrophoneUsageDescription etc.
├── package.json
└── vite.config.ts
```

## Build Commands

```bash
# Dev mode (hot-reload frontend + Rust auto-recompile)
npm run tauri:dev

# TypeScript type check
npx tsc --noEmit

# Rust compile check
cd src-tauri && cargo check

# Run all tests
npm test                        # Vitest (25 frontend tests)
cd src-tauri && cargo test      # Rust unit tests (6 tests)

# Production build
npm run tauri:build
```

All npm commands from repo root. All `cargo` commands from `src-tauri/`.

## Architecture

### STT modes (selectable in Settings → Providers)

| Mode | Path | Requires |
|------|------|----------|
| **Local** | `useLocalTranscription` → `transcribe_local` → whisper-rs | Model downloaded once |
| **API** | `useSpeechToText` → OpenAI `/audio/transcriptions` | API key + internet |

### Audio pipeline

```
getUserMedia (16 kHz mono)
  → ScriptProcessorNode (4096 buffer) → Float32Array chunks
  → float32ToWav() → WAV Blob (16-bit PCM, 44-byte header)
  → [local] Array.from(Uint8Array) → invoke("transcribe_local")
  → [api]   File("audio.wav") → fetch /audio/transcriptions
```

### Text injection (macOS critical path)

`type_text` runs on a `spawn_blocking` thread:
1. Save clipboard → set text → `activate_prev_app()` → sleep 300ms
2. `run_on_main_thread(simulate_paste_keystroke)` — **must be main thread**;
   HIToolbox (`TSMGetInputSourceProperty`) crashes on macOS 14+ if called off-thread
3. Wait on `mpsc::sync_channel` (3s timeout) → restore clipboard

### Whisper model cache (`WhisperState`)

`Arc<WhisperContext>` cached in `Mutex<WhisperModelCache>` as Tauri managed state.
Model reloaded only when `model_id` changes. Arc lets it be cloned into `spawn_blocking`.

### Voice modal state machine

```
idle → recording → transcribing → rephrasing → preview
                                ↘ (rephrasing disabled) ↗
```

Window resizes: compact (118px) ↔ preview (240px) ↔ settings (390px).

## Tauri Commands

| Command | Purpose |
|---------|---------|
| `type_text(text)` | Clipboard paste with main-thread keyboard simulation |
| `get_store_value(key)` | Read from `settings.json` store |
| `set_store_value(key, value)` | Write to `settings.json` store |
| `update_shortcut(shortcut)` | Re-register global hotkey + persist |
| `get_local_model_status(modelId)` | Check if GGUF model file exists + size |
| `download_local_model(modelId)` | Stream from HuggingFace, emit `model-download-progress` events |
| `delete_local_model(modelId)` | Remove model file from disk |
| `transcribe_local(audioWav, modelId)` | Run whisper.cpp inference, returns transcript |
| `check_accessibility_permission()` | `AXIsProcessTrusted()` on macOS, `true` elsewhere |
| `open_permission_settings(permissionType)` | Open System Settings to mic/accessibility pane |

## Settings Schema

Stored in `settings.json` via `tauri-plugin-store`:

```json
{
  "shortcut": "cmd+shift+v",
  "providers": {
    "stt": { "base_url": "", "api_key": "", "model": "whisper-1" },
    "llm": { "base_url": "", "api_key": "", "model": "gpt-4o-mini", "temperature": 0.3 }
  },
  "settings": {
    "silenceTimeoutMs": 3000,
    "sttMode": "api",
    "localModel": "base"
  }
}
```

`sttMode`: `"api"` (default, backward-compatible) | `"local"` (whisper.cpp, offline)  
`localModel`: `"tiny"` (75 MB) | `"base"` (148 MB, default) | `"small"` (488 MB)

## Whisper Models

Downloaded from `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{id}.bin`  
Stored at `{app_data_dir}/whisper_models/ggml-{id}.bin`  
macOS: `~/Library/Application Support/com.voicecodingassistant.app/whisper_models/`

## macOS Requirements

### Permissions (both required)

**Microphone** — granted automatically on first recording via browser dialog.  
Entitlement: `com.apple.security.device.audio-input`

**Accessibility** — required for keyboard simulation (Cmd+V paste injection).  
Must be granted manually: System Settings → Privacy & Security → Accessibility → add the binary.  
In dev mode the binary is at `src-tauri/target/debug/voice-coding-assistant` (use Cmd+Shift+G in the file picker since it won't appear in the Applications list).

### Private API (dev mode)

`macOSPrivateApi: true` enables two WKWebView KVC keys in `main.rs`:
- `mediaDevicesEnabled` → allows `navigator.mediaDevices` in WKWebView
- `mediaCaptureRequiresSecureConnection: false` → allows mic without HTTPS

## Common Gotchas

- `simulate_paste_keystroke` **must** run on the main thread — HIToolbox crashes otherwise on macOS 14+
- `whisper_rs::WhisperContext` is wrapped in `Arc` so it can be moved into `spawn_blocking` closures
- `float32ToWav` output is accepted by both whisper.cpp (local) and OpenAI Whisper API (cloud)
- `tauri-plugin-shell::open` is deprecated (use opener plugin in future); `#[allow(deprecated)]` suppresses the warning
- `sttMode` defaults to `"api"` so existing users are unaffected when upgrading
- Settings merging in `main.rs` (not `is_none()` guard) ensures new keys are added to existing stores without wiping old values

## LLM Rephrasing

System prompt optimizes spoken voice commands into precise coding instructions.
Works with any OpenAI-compatible endpoint: OpenAI, Ollama (`localhost:11434/v1`), LM Studio, vLLM, etc.
If `api_key` is empty, rephrasing is silently skipped and raw transcript is used.
