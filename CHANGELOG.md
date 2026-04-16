# Changelog

All notable changes to the Voice Coding Assistant project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Customizable global shortcuts
- Multiple language support
- Local Whisper model (on-device transcription)
- Voice command recognition (cancel, retry, confirm)
- Command history/persistence
- Encrypted API key storage
- System tray menu for quick access
- Dark/light theme toggle
- Export/import settings

## [1.0.0] - 2026-04-16

### Added
- Initial release of Voice Coding Assistant
- Global shortcut activation (Cmd/Ctrl+Shift+V)
- Real-time audio recording with waveform visualization
- Speech-to-text via OpenAI-compatible APIs (Whisper)
- AI rephrasing for coding agents via LLM APIs
- Editable preview before sending
- Text injection at cursor position using enigo
- Settings persistence using tauri-plugin-store
- Cross-platform support (macOS, Windows, Linux)
- Glassmorphism UI with dark theme
- Provider configuration panel (STT and LLM independently)
- AI rephrasing toggle
- Error handling with user-friendly messages
- App icons for all platforms
- Comprehensive documentation (AGENTS.md, README.md)

### Technical Details
- **Frontend**: React 18 + TypeScript + Tailwind CSS + Framer Motion
- **Backend**: Rust + Tauri v2
- **Audio**: Web Audio API with MediaRecorder (WebM/Opus)
- **Keyboard**: enigo for cross-platform text injection
- **Storage**: tauri-plugin-store for local settings
- **Shortcuts**: tauri-plugin-global-shortcut

### Security
- CSP headers configured for API connections
- API keys stored locally (not encrypted in v1.0.0)
- No audio data sent except to configured APIs
- No cloud storage of user data

### Known Issues
- First-time microphone permission required
- Window focus must be maintained during text injection
- Shortcuts are hardcoded (not user-configurable at runtime)
- API keys stored in plain text (to be encrypted in future)

---

## Release Notes Template

### [X.Y.Z] - YYYY-MM-DD

#### Added
- New features

#### Changed
- Changes in existing functionality

#### Deprecated
- Soon-to-be removed features

#### Removed
- Now removed features

#### Fixed
- Bug fixes

#### Security
- Security improvements

---

## Version History

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-04-16 | Initial release |

---

## Contributing to Changelog

When making changes:
1. Add entries under `[Unreleased]` section
2. Categorize under appropriate heading (Added/Changed/Fixed/etc.)
3. Include issue/PR number when applicable
4. Move to version section on release
5. Update version links at bottom of file

[Unreleased]: https://github.com/ianuragbhatt/voice-coding-assistant/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ianuragbhatt/voice-coding-assistant/releases/tag/v1.0.0
