import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Settings, Mic, Keyboard } from "lucide-react";

function App() {
  useEffect(() => {
    // Hide the main window immediately - we only need the voice modal
    const hideMainWindow = async () => {
      const mainWindow = getCurrentWindow();
      await mainWindow.hide();
    };
    hideMainWindow();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 flex items-center justify-center p-8">
      <div className="glass-panel p-12 max-w-2xl w-full text-center">
        <div className="mb-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <Mic className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-4 gradient-text">
            Voice Coding Assistant
          </h1>
          <p className="text-white/60 text-lg">
            Running in the background. Use the global shortcut to activate.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="glass-button p-6 flex flex-col items-center gap-3">
            <Keyboard className="w-8 h-8 text-blue-400" />
            <div>
              <p className="font-semibold text-white mb-1">Global Shortcut</p>
              <p className="text-white/50 text-sm">
                {navigator.platform.includes("Mac")
                  ? "Cmd + Shift + V"
                  : "Ctrl + Shift + V"}
              </p>
            </div>
          </div>
          <div className="glass-button p-6 flex flex-col items-center gap-3">
            <Settings className="w-8 h-8 text-purple-400" />
            <div>
              <p className="font-semibold text-white mb-1">Configuration</p>
              <p className="text-white/50 text-sm">Right-click tray icon</p>
            </div>
          </div>
        </div>

        <div className="text-white/40 text-sm">
          <p>The app is running in your system tray.</p>
          <p>Press the shortcut anytime to open the voice interface.</p>
        </div>
      </div>
    </div>
  );
}

export default App;
