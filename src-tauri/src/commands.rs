use clipboard_rs::{Clipboard, ClipboardContext};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

/// Type text at the current cursor position using clipboard paste.
/// Saves existing clipboard, sets new text, simulates Cmd/Ctrl+V, then restores.
#[tauri::command]
pub async fn type_text(text: String) -> Result<(), String> {
    std::thread::spawn(move || {
        let ctx = ClipboardContext::new().map_err(|e| format!("Clipboard init failed: {}", e))?;

        // Save current clipboard text (best-effort; ignore error if clipboard is empty/non-text)
        let saved = ctx.get_text().ok();

        // Write our text to clipboard
        ctx.set_text(text)
            .map_err(|e| format!("Failed to set clipboard: {}", e))?;

        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

        // Small delay to ensure the target window is focused
        std::thread::sleep(std::time::Duration::from_millis(100));

        // Simulate paste shortcut
        #[cfg(target_os = "macos")]
        {
            enigo
                .key(Key::Meta, Direction::Press)
                .map_err(|e| format!("Key press failed: {}", e))?;
            enigo
                .key(Key::Unicode('v'), Direction::Click)
                .map_err(|e| format!("Key click failed: {}", e))?;
            enigo
                .key(Key::Meta, Direction::Release)
                .map_err(|e| format!("Key release failed: {}", e))?;
        }
        #[cfg(not(target_os = "macos"))]
        {
            enigo
                .key(Key::Control, Direction::Press)
                .map_err(|e| format!("Key press failed: {}", e))?;
            enigo
                .key(Key::Unicode('v'), Direction::Click)
                .map_err(|e| format!("Key click failed: {}", e))?;
            enigo
                .key(Key::Control, Direction::Release)
                .map_err(|e| format!("Key release failed: {}", e))?;
        }

        // Brief delay to let the paste complete before restoring clipboard
        std::thread::sleep(std::time::Duration::from_millis(100));

        // Restore previous clipboard contents (best-effort)
        if let Some(prev) = saved {
            let _ = ctx.set_text(prev);
        }

        Ok::<(), String>(())
    })
    .join()
    .map_err(|_| "Thread panicked".to_string())?
}

/// Get a value from the store
#[tauri::command]
pub async fn get_store_value(app: AppHandle, key: String) -> Result<Option<Value>, String> {
    let store = app
        .store_builder("settings.json")
        .build()
        .map_err(|e| e.to_string())?;
    Ok(store.get(&key))
}

/// Set a value in the store
#[tauri::command]
pub async fn set_store_value(app: AppHandle, key: String, value: Value) -> Result<(), String> {
    let store = app
        .store_builder("settings.json")
        .build()
        .map_err(|e| e.to_string())?;
    store.set(&key, value);
    store.save().map_err(|e| e.to_string())
}

/// Unregister all current shortcuts and register a new one, then persist it
#[tauri::command]
pub async fn update_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    // Validate the shortcut string parses correctly
    let new_shortcut: Shortcut = shortcut
        .parse()
        .map_err(|e| format!("Invalid shortcut: {}", e))?;

    // Unregister all existing shortcuts
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| format!("Failed to unregister shortcuts: {}", e))?;

    // Register the new shortcut
    app.global_shortcut()
        .on_shortcut(new_shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle_voice_modal(app);
            }
        })
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;

    // Persist the new shortcut to the store
    let store = app
        .store_builder("settings.json")
        .build()
        .map_err(|e| e.to_string())?;
    store.set("shortcut", shortcut);
    store.save().map_err(|e| e.to_string())
}

/// Toggle the voice modal window visibility
pub fn toggle_voice_modal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("voice-modal") {
        let is_visible = window.is_visible().unwrap_or(false);

        if is_visible {
            let _ = window.hide();
            let _ = window.emit("voice:toggle", false);
        } else {
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.emit("voice:toggle", true);
        }
    }
}
