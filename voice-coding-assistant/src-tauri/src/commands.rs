use enigo::{Enigo, Keyboard, Settings};
use serde_json::Value;
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;

/// Type text at the current cursor position using enigo
#[tauri::command]
pub async fn type_text(text: String) -> Result<(), String> {
    std::thread::spawn(move || {
        let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

        // Small delay to ensure the target window is focused
        std::thread::sleep(std::time::Duration::from_millis(100));

        // Type the text
        enigo
            .text(&text)
            .map_err(|e| format!("Failed to type text: {}", e))?;

        Ok::<(), String>(())
    })
    .join()
    .map_err(|_| "Thread panicked".to_string())?
}

/// Get a value from the store
#[tauri::command]
pub async fn get_store_value(app: AppHandle, key: String) -> Result<Option<Value>, String> {
    let store = app.store_builder("settings.json").build();
    Ok(store.get(&key))
}

/// Set a value in the store
#[tauri::command]
pub async fn set_store_value(
    app: AppHandle,
    key: String,
    value: Value,
) -> Result<(), String> {
    let store = app.store_builder("settings.json").build();
    store.set(&key, value);
    store.save().map_err(|e| e.to_string())
}
