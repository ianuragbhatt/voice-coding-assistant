// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use enigo::{Enigo, Keyboard, Settings};
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_store::StoreExt;

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["cmd+shift+v", "ctrl+shift+v"])
                .unwrap()
                .on_shortcut("cmd+shift+v", |app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_voice_modal(app);
                    }
                })
                .on_shortcut("ctrl+shift+v", |app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_voice_modal(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::type_text,
            commands::get_store_value,
            commands::set_store_value,
        ])
        .setup(|app| {
            // Initialize store with default values
            let store = app.store_builder("settings.json").build();

            // Set default shortcut if not exists
            if store.get("shortcut").is_none() {
                let default_shortcut = if cfg!(target_os = "macos") {
                    "cmd+shift+v"
                } else {
                    "ctrl+shift+v"
                };
                store.set("shortcut", default_shortcut);
            }

            // Set default providers if not exists
            if store.get("providers").is_none() {
                let default_providers = serde_json::json!({
                    "stt": {
                        "base_url": "https://api.openai.com/v1",
                        "api_key": "",
                        "model": "whisper-1"
                    },
                    "llm": {
                        "base_url": "https://api.openai.com/v1",
                        "api_key": "",
                        "model": "gpt-4o-mini",
                        "temperature": 0.3
                    }
                });
                store.set("providers", default_providers);
            }

            store.save()?;

            // Create the voice modal window (hidden initially)
            let voice_window = tauri::WebviewWindowBuilder::new(
                app,
                "voice-modal",
                tauri::WebviewUrl::App("/voice.html".into()),
            )
            .title("Voice Assistant")
            .inner_size(480.0, 320.0)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible(false)
            .center()
            .build()?;

            // Set window level to floating panel on macOS
            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                let _ = voice_window.set_title_bar_style(TitleBarStyle::Transparent);
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn toggle_voice_modal(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("voice-modal") {
        let is_visible = window.is_visible().unwrap_or(false);

        if is_visible {
            let _ = window.hide();
            // Emit event to stop recording
            let _ = window.emit("voice:toggle", false);
        } else {
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();
            // Emit event to start recording
            let _ = window.emit("voice:toggle", true);
        }
    }
}
