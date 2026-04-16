# CLAUDE.md — Voice Coding Assistant

## Project Structure

This is a Tauri v2 desktop app (React + Rust) at the **repository root**. All source lives directly in `mac_voice_tool/` — there is no subdirectory nesting.

```
mac_voice_tool/          ← repo root, also the project root
├── src/                 ← React frontend
├── src-tauri/           ← Rust backend
├── package.json         ← Frontend deps (run npm commands here)
└── src-tauri/Cargo.toml ← Rust deps
```

## Build Commands

```bash
# Dev mode (hot-reload frontend + auto-recompile Rust)
npm run tauri:dev

# Type check TypeScript
npx tsc --noEmit

# Check Rust compiles
cd src-tauri && cargo check

# Production build
npm run tauri:build
```

All npm commands must be run from the repo root (`mac_voice_tool/`).
All `cargo` commands must be run from `src-tauri/`.

## Key Files

| File | Purpose |
|------|---------|
| `src/components/VoiceModal.tsx` | Main UI state machine (idle → recording → transcribing → rephrasing → preview) |
| `src/hooks/useAudioRecorder.ts` | MediaRecorder + silence detection via AnalyserNode |
| `src/hooks/useSpeechToText.ts` | Whisper API call |
| `src/hooks/useLLMRephraser.ts` | LLM rephrase (system/user message roles) |
| `src/components/SettingsPanel.tsx` | Providers, shortcut, silence timeout config |
| `src-tauri/src/main.rs` | App setup, shortcut registration, system tray |
| `src-tauri/src/commands.rs` | Tauri commands + `toggle_voice_modal` |
| `src-tauri/tauri.conf.json` | CSP, permissions, window config |

## Architecture Rules

- **Two windows**: `main` (hidden, lifecycle) and `voice-modal` (floating, 480×320)
- **Text injection**: clipboard-based (save → set → Cmd/Ctrl+V → restore) via `clipboard-rs`
- **Shortcut**: stored in `settings.json`, read on startup, re-registered via `update_shortcut` command
- **Silence detection**: AnalyserNode in `useAudioRecorder`, configurable via `settings.silenceTimeoutMs`
- **System tray**: `TrayIconBuilder` in `main.rs`, menu events handled inline
- **LLM prompting**: always use `system`/`user` message roles — never string interpolation
- **CSP**: `connect-src: "'self' https: http:"` — intentionally wide to support custom API endpoints

## Settings Schema

```json
{
  "shortcut": "cmd+shift+v",
  "providers": {
    "stt": { "base_url": "", "api_key": "", "model": "whisper-1" },
    "llm": { "base_url": "", "api_key": "", "model": "gpt-4o-mini", "temperature": 0.3 }
  },
  "settings": {
    "silenceTimeoutMs": 3000
  }
}
```

## Common Gotchas

- `toggle_voice_modal` is defined in `commands.rs` (not `main.rs`) so the library crate can reference it
- `clipboard-rs` `set_text` takes `String` (owned), not `&str`
- Tauri v2 tray feature requires `"tray-icon"` and `"image-png"` in Cargo.toml features
- Tray permission key is `"core:tray:default"` (not `"tray:default"`)
- `Shortcut::from_str` error type is `global_hotkey::hotkey::HotKeyParseError`, use `map_err(|e| format!(...))` without naming the type

## macOS Requirements

- **Microphone**: grant on first launch
- **Accessibility**: required for clipboard paste simulation (System Settings → Privacy & Security → Accessibility)
