# AGENTS.md - Voice Coding Assistant

> This file contains essential information for AI agents working on this project.

## Project Overview

Voice Coding Assistant is a cross-platform desktop app that provides instant voice-to-text transcription with AI-powered rephrasing optimized for coding agents. It uses a global shortcut to open a floating modal window where users can speak, review the transcribed and rephrased text, and send it to their cursor position.

**Key Features:**
- Global shortcut activation (Cmd/Ctrl+Shift+V)
- Real-time audio recording with waveform visualization
- Speech-to-text via OpenAI-compatible APIs (Whisper)
- AI rephrasing for coding agents via LLM APIs
- Editable preview before sending
- Text injection at cursor position
- Settings persistence

## Documentation

### User Documentation
- **README.md** - User-facing documentation (setup, usage, features)
- **CHANGELOG.md** - Version history and changes
- **LICENSE** - MIT License

### Developer Documentation
- **AGENTS.md** (this file) - AI agent reference
- Inline code comments - Detailed JSDoc/Rustdoc comments
- Architecture Decision Records (ADRs) - Key design decisions

### API Documentation
See "Component API Reference" section below for detailed API docs.

## Tech Stack

### Frontend
- **Framework**: React 18 + TypeScript
- **Styling**: Tailwind CSS with custom glassmorphism theme
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Build Tool**: Vite 5
- **Tauri API**: @tauri-apps/api v2

### Backend (Rust)
- **Framework**: Tauri v2
- **Plugins**:
  - tauri-plugin-global-shortcut (system-wide hotkeys)
  - tauri-plugin-store (settings persistence)
  - tauri-plugin-shell
- **Key Crates**:
  - enigo (cross-platform keyboard input simulation)
  - clipboard-rs (clipboard operations)

## Architecture

```
voice-coding-assistant/
├── src/                          # React Frontend
│   ├── components/
│   │   ├── VoiceModal.tsx        # Main floating window UI
│   │   ├── AudioVisualizer.tsx   # Real-time waveform
│   │   └── SettingsPanel.tsx     # Provider configuration UI
│   ├── hooks/
│   │   ├── useAudioRecorder.ts   # Web Audio API recording
│   │   ├── useSpeechToText.ts    # STT API integration
│   │   └── useLLMRephraser.ts    # LLM rephrasing logic
│   ├── App.tsx                   # Main app (hidden window)
│   ├── voice.tsx                 # Voice modal entry
│   └── index.css                 # Tailwind + custom styles
├── src-tauri/                    # Rust Backend
│   ├── src/
│   │   ├── main.rs               # App entry + shortcut handler
│   │   ├── commands.rs           # Tauri commands
│   │   ├── lib.rs                # Library exports
│   │   └── keyboard.rs           # Text injection
│   ├── icons/                    # App icons
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri configuration
├── docs/                         # Additional documentation
├── index.html / voice.html       # Entry HTML files
└── AGENTS.md                     # This file
```

## Window Structure

The app uses **two windows**:

1. **Main Window** (`main` label)
   - Hidden on startup (`visible: false`)
   - Used for app lifecycle management
   - Not user-facing

2. **Voice Modal** (`voice-modal` label)
   - Floating transparent window (480x320px)
   - Always on top, no decorations
   - Opens via global shortcut
   - Loads `voice.html`

## Component API Reference

### VoiceModal
Main floating window component managing the recording flow.

**Props**: None (self-contained)

**State Machine**:
```typescript
type AppState = "idle" | "recording" | "transcribing" | "rephrasing" | "preview";
```

**Events**:
- Listens for `voice:toggle` from Rust
- Emits window show/hide commands

### useAudioRecorder Hook
```typescript
interface UseAudioRecorderReturn {
  isRecording: boolean;
  audioBlob: Blob | null;
  error: string | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetRecorder: () => void;
}
```

### useSpeechToText Hook
```typescript
interface UseSpeechToTextReturn {
  transcribe: (audioBlob: Blob) => Promise<string>;
  isTranscribing: boolean;
  error: string | null;
}
```

### useLLMRephraser Hook
```typescript
interface UseLLMRephraserReturn {
  rephrase: (text: string) => Promise<string>;
  isRephrasing: boolean;
  error: string | null;
}
```

### Rust Commands
```rust
// Type text at cursor position
#[tauri::command]
pub async fn type_text(text: String) -> Result<(), String>

// Get value from store
#[tauri::command]
pub async fn get_store_value(app: AppHandle, key: String) -> Result<Option<Value>, String>

// Set value in store
#[tauri::command]
pub async fn set_store_value(app: AppHandle, key: String, value: Value) -> Result<(), String>
```

## Key Commands

### Build Commands
```bash
# Install dependencies
npm install

# Build frontend
npm run build

# Build Rust (development)
cd src-tauri && cargo build

# Build full app (production)
npm run tauri:build

# Run in dev mode
npm run tauri:dev
```

### Development Commands
```bash
# Type check only
npx tsc --noEmit

# Format Rust code
cargo fmt

# Lint Rust code
cargo clippy

# Check Rust without building
cargo check
```

## Configuration

Settings are stored in `settings.json` via tauri-plugin-store:

```json
{
  "shortcut": "cmd+shift+v",
  "providers": {
    "stt": {
      "base_url": "https://api.openai.com/v1",
      "api_key": "...",
      "model": "whisper-1"
    },
    "llm": {
      "base_url": "https://api.openai.com/v1",
      "api_key": "...",
      "model": "gpt-4o-mini",
      "temperature": 0.3
    }
  }
}
```

### Supported Providers
Any OpenAI API-compatible service:
- OpenAI (api.openai.com)
- Groq (api.groq.com) - Recommended for speed
- Ollama (local)
- OpenRouter
- Azure OpenAI
- Custom endpoints

## App State Flow

```
Shortcut Pressed
      ↓
Show Voice Modal + Start Recording
      ↓
Stop Recording (shortcut again or button)
      ↓
Transcribe Audio → Show "Transcribing..."
      ↓
Rephrase Text (if enabled) → Show "Optimizing..."
      ↓
Show Preview (editable text)
      ↓
User Edits → Send → Type at cursor
```

## Important Implementation Details

### Audio Recording
- Uses Web Audio API with MediaRecorder
- Format: WebM/Opus (best compression)
- Chunked recording (100ms intervals)
- Auto cleanup on stop/unmount

### Text Injection
- Uses `enigo` crate for cross-platform keyboard simulation
- 100ms delay before typing for window focus
- Types raw text (no clipboard to preserve user clipboard)

### Global Shortcuts
- Registered in Rust (main.rs)
- Platform detection for Mac vs Windows shortcuts
- Shortcut is hardcoded but could be made configurable

### Security
- CSP configured for OpenAI/Groq APIs
- API keys stored locally in settings.json
- No cloud storage of audio data

## Common Tasks

### Add a New Provider
1. Update SettingsPanel.tsx to add UI fields
2. Update useSpeechToText.ts or useLLMRephraser.ts for API calls
3. Update TypeScript interfaces

### Modify the UI
1. Edit VoiceModal.tsx for main interface changes
2. Edit index.css for styling (Tailwind + custom classes)
3. Framer Motion used for animations

### Add New Shortcut
1. Register in main.rs with tauri-plugin-global-shortcut
2. Listen for events in VoiceModal.tsx
3. Update tauri.conf.json capabilities

### Fix Store API Issues
The tauri-plugin-store v2 API returns `Result`:
```rust
// Correct usage
let store = app.store_builder("settings.json").build()?;
store.set("key", value);
store.save()?;
```

## Testing

### Manual Test Flow
1. Build: `npm run tauri:build`
2. Install the .app/.exe
3. Open any text editor
4. Press Cmd/Ctrl+Shift+V
5. Speak: "Create a function to calculate fibonacci"
6. Verify preview shows optimized text
7. Click Send → verify text appears at cursor

### Dev Testing
```bash
# Run with dev tools
npm run tauri:dev

# Check Rust logs
RUST_LOG=debug cargo tauri dev
```

### Test Cases
1. **Basic Flow**: Record → Stop → Send
2. **Cancel**: Record → Cancel (should not type anything)
3. **Retry**: Record → Stop → Retry → New recording
4. **Settings**: Open settings → Change provider → Save
5. **Error Handling**: Disconnect internet → Record → Should show error

## Troubleshooting

### Common Issues

#### Build Errors

**Error**: `can't find library voice_coding_assistant_lib`
- **Fix**: Create `src-tauri/src/lib.rs` with library exports

**Error**: Store API method not found on `Result<T, E>`
- **Fix**: Add `?` operator: `app.store_builder("...").build()?`

**Error**: `tsc` command shows help instead of type-checking
- **Fix**: Use `./node_modules/.bin/tsc` or `npx tsc`

#### Runtime Issues

**Microphone not working**:
- Check macOS/Windows privacy settings
- Grant microphone permission to the app

**Global shortcut not working**:
- Check if another app is using Cmd/Ctrl+Shift+V
- Try changing the shortcut in settings

**Text not appearing at cursor**:
- Ensure target window stays focused
- Check if enigo has permission (macOS Accessibility)

#### API Errors

**STT "Unauthorized"**:
- Check API key in settings
- Verify base_url is correct

**LLM not rephrasing**:
- Check if LLM provider is configured
- Verify API key and model name
- Check temperature value (0.0 - 1.0)

## Environment Setup

### Prerequisites
- Node.js 18+ and npm
- Rust 1.77+ (install via rustup)
- Tauri CLI: `cargo install tauri-cli`

### IDE Setup
- **VS Code Extensions**:
  - rust-analyzer (Rust language server)
  - ESLint + Prettier (JS/TS formatting)
  - Tailwind CSS IntelliSense
  - Tauri (official extension)

### Environment Variables
No environment variables required - all config is in the settings store.

## Development Workflow

1. **Start Development**
   ```bash
   npm run tauri:dev
   ```

2. **Make Changes**
   - Frontend hot-reloads automatically
   - Rust changes require recompilation (automatic)

3. **Test Changes**
   - Use manual test flow (see Testing section)
   - Check browser console for frontend errors
   - Check terminal for Rust errors

4. **Before Committing**
   ```bash
   npm run build          # Ensure frontend builds
   cd src-tauri && cargo check  # Ensure Rust compiles
   cargo fmt              # Format Rust code
   ```

## Known Limitations

1. **First-time microphone permission** - User must grant mic access
2. **Window focus** - Target app must remain focused during text injection
3. **Shortcuts** - Currently hardcoded, not user-configurable at runtime
4. **Audio format** - WebM/Opus required (most modern APIs support this)
5. **macOS Accessibility** - Requires accessibility permission for keyboard injection

## Error Handling

Errors are caught and displayed in the UI:
- Recording errors → Red banner in VoiceModal
- STT errors → "Failed to transcribe" message
- LLM errors → Falls back to original text
- Keyboard injection errors → Red banner

## Code Style

### TypeScript/React
- Strict TypeScript enabled
- Functional components with hooks
- Custom hooks for reusable logic
- Tailwind for all styling
- JSDoc comments for public functions

### Rust
- Error handling with `?` operator
- Tauri command functions return `Result<T, String>`
- Store operations must handle errors
- Rustdoc comments for public items

## Dependencies to Know

### Frontend
- `framer-motion` - All animations
- `lucide-react` - All icons
- `@tauri-apps/api` - Bridge to Rust

### Rust
- `enigo` - Keyboard simulation (critical for text injection)
- `tauri-plugin-*` - Tauri official plugins
- `serde` - JSON serialization

## Build Targets

- macOS: `.app` bundle (universal binary possible)
- Windows: `.exe` + `.msi` installer
- Linux: `.deb` or `.AppImage`

## Deployment

### macOS
```bash
npm run tauri:build
# Output: src-tauri/target/release/bundle/macos/*.app
```

### Windows
```bash
npm run tauri:build
# Output: src-tauri/target/release/bundle/msi/*.msi
```

### Linux
```bash
npm run tauri:build
# Output: src-tauri/target/release/bundle/deb/*.deb
```

## Contributing Guidelines

### Before Making Changes
1. Read this AGENTS.md file
2. Understand the state flow (see App State Flow)
3. Check for existing issues/PRs

### Making Changes
1. Create a feature branch
2. Follow code style (see Code Style section)
3. Add tests if applicable
4. Update documentation

### Code Review Checklist
- [ ] TypeScript compiles without errors
- [ ] Rust compiles without warnings
- [ ] UI looks correct on both light/dark modes
- [ ] Error handling is in place
- [ ] Settings are persisted correctly
- [ ] Global shortcut still works

## File-by-File Documentation

### Frontend

**VoiceModal.tsx**
- Main UI component
- Manages app state machine
- Handles window events from Rust
- Renders different UI states based on `appState`

**AudioVisualizer.tsx**
- Canvas-based waveform visualization
- Uses Web Audio API AnalyserNode
- Animated bars respond to frequency data

**SettingsPanel.tsx**
- Provider configuration UI
- Saves to Tauri store
- Toggle switches for features

**useAudioRecorder.ts**
- Web Audio API wrapper
- MediaRecorder for audio capture
- Blob creation from audio chunks

**useSpeechToText.ts**
- Whisper API integration
- FormData with audio file
- Error handling for API failures

**useLLMRephraser.ts**
- LLM API integration
- Prompt engineering for coding agents
- Falls back to original text on error

### Backend

**main.rs**
- App entry point
- Global shortcut registration
- Window creation and management
- Store initialization with defaults

**commands.rs**
- Tauri command handlers
- Keyboard text injection via enigo
- Store read/write operations

**lib.rs**
- Library exports
- Module declarations

## LLM Prompt Engineering

The rephrasing prompt is in `useLLMRephraser.ts`:

```typescript
const CODING_AGENT_PROMPT = `You are a command optimizer for coding AI agents...
```

### Prompt Guidelines
- Clear role definition
- Input/output examples
- Constraint instructions
- Output format specification

## Performance Considerations

### Frontend
- Audio visualizer uses requestAnimationFrame
- Canvas clearing is batched
- State updates are minimal
- Components use proper memoization

### Backend
- Audio processing is chunked
- API calls are async
- Store operations don't block UI
- Keyboard injection has small delay

## Security Considerations

- API keys stored in local config (not encrypted - TODO)
- No audio data sent except to configured APIs
- CSP headers restrict external connections
- File system access limited to store

## Future Enhancements

Potential improvements documented here for reference:
- Customizable shortcuts
- Multiple language support
- Local Whisper model (on-device)
- Voice command recognition (cancel, retry)
- History/persistence of past commands
- Encrypted API key storage
- Tray menu for quick access

---

**Last Updated**: 2026-04-16
**Version**: 1.0.0
**Maintainer**: Voice Coding Assistant Team
**Documentation Status**: Complete
