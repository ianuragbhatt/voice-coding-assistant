# 🎙️ Voice Coding Assistant

> Speak naturally. Code precisely.

A cross-platform desktop application that transforms your voice into structured coding commands using AI. Perfect for developers who want to speed up their workflow with voice-to-text transcription optimized for coding agents.

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/ianuragbhatt/voice-coding-assistant)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/ianuragbhatt/voice-coding-assistant)

![Voice Coding Assistant Screenshot](https://via.placeholder.com/800x400/1a1a1a/3b82f6?text=Voice+Coding+Assistant)

## ✨ Features

### 🎯 Core Functionality
- **Global Shortcut Activation** - Press `Cmd+Shift+V` (Mac) or `Ctrl+Shift+V` (Windows/Linux) to instantly open the voice interface
- **Real-time Audio Recording** - Crystal clear recording with live waveform visualization
- **Speech-to-Text** - Powered by OpenAI Whisper or any compatible API
- **AI Rephrasing** - Automatically transforms casual speech into precise coding commands
- **Editable Preview** - Review and edit before sending to your cursor position
- **Text Injection** - Types text directly at your cursor position in any application

### 🤖 AI-Powered Optimization
The app includes specialized prompt engineering that converts natural language like:
> "Uhh, create like a function that calculates the fibonacci numbers using recursion please"

Into structured coding commands:
> "Create a recursive function named 'fibonacci' that takes an integer n as input and returns the nth Fibonacci number. Include base cases for n=0 and n=1."

### ⚙️ Flexible Configuration
- **Custom Providers** - Works with any OpenAI-compatible API:
  - OpenAI (api.openai.com)
  - Groq (api.groq.com) - Recommended for speed
  - Ollama (local)
  - OpenRouter
  - Azure OpenAI
  - Custom endpoints
- **Independent STT & LLM** - Configure different providers for speech-to-text and rephrasing
- **Settings Persistence** - All configurations saved locally

### 🎨 Beautiful UI
- **Glassmorphism Design** - Modern, translucent interface
- **Dark Mode** - Easy on the eyes for developers
- **Smooth Animations** - Powered by Framer Motion
- **Responsive** - Works on various screen sizes

## 📦 Installation

### Download Pre-built Binaries
Coming soon! For now, build from source.

### Build from Source

#### Prerequisites
- [Node.js](https://nodejs.org/) 18+ and npm
- [Rust](https://rustup.rs/) 1.77+ (install via rustup)
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)

```bash
# Clone the repository
git clone https://github.com/ianuragbhatt/voice-coding-assistant.git
cd voice-coding-assistant

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev

# Build for production
npm run tauri:build
```

#### Platform-Specific Notes

**macOS:**
- Grant microphone permission when prompted
- Grant accessibility permission for keyboard injection (System Preferences → Security & Privacy → Accessibility)

**Windows:**
- Run as administrator if keyboard injection doesn't work in some applications

**Linux:**
- Install additional dependencies: `sudo apt install libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev patchelf`

## 🚀 Usage

### Quick Start

1. **Launch the app** - It runs in the background (check your system tray)
2. **Open any text editor** - VS Code, terminal, chat app, etc.
3. **Press the shortcut** - `Cmd+Shift+V` (Mac) or `Ctrl+Shift+V` (Windows/Linux)
4. **Speak naturally** - Describe what you want to code
5. **Review & Edit** - See the transcribed and optimized text
6. **Send** - Click "Send" to type it at your cursor position

### Example Workflow

```
You say: "Create a React component with a useState hook"
↓
Transcribed: "Create a React component with a useState hook"
↓
Optimized: "Create a React functional component named 'MyComponent'. 
            Import useState from 'react'. Define the component with 
            a state variable initialized using useState(). Return JSX 
            that displays the state value and includes a button to 
            update the state."
↓
Typed at cursor: [The optimized text]
```

### Configuration

1. Click the ⚙️ (settings) icon in the voice modal
2. Enter your API credentials:
   - **STT Provider**: For speech-to-text (e.g., Whisper)
   - **LLM Provider**: For rephrasing (e.g., GPT-4o-mini)
3. Click "Save"
4. Toggle "AI Rephrasing" on/off as needed

**Recommended Setup:**
- **STT**: Groq (fastest) - `https://api.groq.com/openai/v1`
- **LLM**: OpenAI - `https://api.openai.com/v1` or Groq for both

### Tips

- **Pause briefly** at the end of sentences for better transcription
- **Edit the preview** - You can modify the text before sending
- **Retry** - Click "Retry" if transcription wasn't accurate
- **Cancel** - Press Escape or click X to close without typing

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ VoiceModal   │  │ AudioVis     │  │ Settings     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ Tauri Bridge
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Backend (Rust)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Global       │  │ Store        │  │ Keyboard     │       │
│  │ Shortcut     │  │ (Settings)   │  │ Injection    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ API Calls
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    External APIs                             │
│  ┌──────────────┐            ┌──────────────┐              │
│  │ Whisper STT  │            │ GPT/LLM      │              │
│  │ (Any Provider│            │ (Any Provider│              │
│  └──────────────┘            └──────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Framer Motion** - Animations
- **Lucide React** - Icons
- **Vite** - Build tool

### Backend
- **Rust** - Systems language
- **Tauri v2** - Desktop framework
- **enigo** - Keyboard simulation
- **tauri-plugin-global-shortcut** - System shortcuts
- **tauri-plugin-store** - Local storage

## 📝 Documentation

- **[AGENTS.md](AGENTS.md)** - Developer documentation for AI agents and contributors
- **[CHANGELOG.md](CHANGELOG.md)** - Version history and changes

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](AGENTS.md#contributing-guidelines) for details.

### Development Setup

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/voice-coding-assistant.git
cd voice-coding-assistant

# Install dependencies
npm install

# Run development server
npm run tauri:dev

# Run tests
npm test
```

## 🐛 Troubleshooting

### Common Issues

**Microphone not working**
- Grant microphone permission in system settings
- Check if another app is using the microphone

**Global shortcut not working**
- Another app might be using `Cmd/Ctrl+Shift+V`
- Try restarting the application
- Check system keyboard shortcuts

**Text not appearing at cursor**
- Ensure the target window stays focused
- Grant accessibility permission (macOS)
- Try running as administrator (Windows)

**API errors**
- Verify API key is correct
- Check base URL format (should end with `/v1`)
- Ensure you have credits/quota available

See [AGENTS.md](AGENTS.md#troubleshooting) for more detailed troubleshooting.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Tauri](https://tauri.app/) - For the amazing desktop framework
- [OpenAI](https://openai.com/) - For Whisper and GPT models
- [Groq](https://groq.com/) - For fast inference
- [enigo](https://github.com/enigo-rs/enigo) - For cross-platform keyboard control

## 📞 Support

- 🐛 [Report Issues](https://github.com/ianuragbhatt/voice-coding-assistant/issues)
- 💡 [Request Features](https://github.com/ianuragbhatt/voice-coding-assistant/issues)
- 📧 Contact: [Your Email or Discord]

---

<p align="center">
  Made with ❤️ for developers who love to speak their code
</p>
