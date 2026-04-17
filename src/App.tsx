import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Settings, Mic, Keyboard } from "lucide-react";

function App() {
  useEffect(() => {
    const hideMainWindow = async () => {
      const mainWindow = getCurrentWindow();
      await mainWindow.hide();
    };
    hideMainWindow();
  }, []);

  return (
    <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-8">
      <div className="panel p-10 max-w-2xl w-full text-center">
        <div className="mb-8">
          <div className="w-16 h-16 mx-auto mb-5 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Mic className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-3 text-white">
            Voice Coding Assistant
          </h1>
          <p className="text-neutral-500 text-base">
            Running in the background. Use the global shortcut to activate.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
          <div className="p-5 rounded-lg bg-neutral-800 flex flex-col items-center gap-3">
            <Keyboard className="w-7 h-7 text-indigo-400" />
            <div>
              <p className="font-medium text-white mb-0.5">Global Shortcut</p>
              <p className="text-neutral-500 text-sm">
                {navigator.platform.includes("Mac")
                  ? "Cmd + Shift + V"
                  : "Ctrl + Shift + V"}
              </p>
            </div>
          </div>
          <div className="p-5 rounded-lg bg-neutral-800 flex flex-col items-center gap-3">
            <Settings className="w-7 h-7 text-indigo-400" />
            <div>
              <p className="font-medium text-white mb-0.5">Configuration</p>
              <p className="text-neutral-500 text-sm">Click the gear icon in the voice modal</p>
            </div>
          </div>
        </div>

        <div className="text-neutral-600 text-sm">
          <p>The app is running in the background.</p>
          <p>Press the shortcut anytime to open the voice interface.</p>
        </div>
      </div>
    </div>
  );
}

export default App;
