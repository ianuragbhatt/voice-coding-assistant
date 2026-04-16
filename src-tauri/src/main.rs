// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            commands::type_text,
            commands::get_store_value,
            commands::set_store_value,
            commands::update_shortcut,
        ])
        .setup(|app| {
            // Initialize store with default values
            let store = app.store_builder("settings.json").build()?;

            if store.get("shortcut").is_none() {
                let default_shortcut = if cfg!(target_os = "macos") {
                    "cmd+shift+v"
                } else {
                    "ctrl+shift+v"
                };
                store.set("shortcut", default_shortcut);
            }

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

            if store.get("settings").is_none() {
                let default_settings = serde_json::json!({
                    "silenceTimeoutMs": 3000
                });
                store.set("settings", default_settings);
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

            #[cfg(target_os = "macos")]
            {
                use tauri::TitleBarStyle;
                let _ = voice_window.set_title_bar_style(TitleBarStyle::Transparent);
            }
            let _ = voice_window;

            // Read shortcut from store and register it
            let shortcut_str = store
                .get("shortcut")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| {
                    if cfg!(target_os = "macos") {
                        "cmd+shift+v".to_string()
                    } else {
                        "ctrl+shift+v".to_string()
                    }
                });

            register_shortcut(app.handle(), &shortcut_str);

            // System tray setup
            let toggle_item = MenuItemBuilder::with_id("toggle", "Toggle Voice Assistant").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&toggle_item, &settings_item, &separator, &quit_item])
                .build()?;

            let icon = app
                .default_window_icon()
                .cloned()
                .unwrap_or_else(|| {
                    tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
                        .expect("failed to load tray icon")
                });

            TrayIconBuilder::new()
                .icon(icon)
                .tooltip("Voice Coding Assistant")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "toggle" => commands::toggle_voice_modal(app),
                    "settings" => open_settings(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

pub fn register_shortcut(app: &tauri::AppHandle, shortcut_str: &str) {
    if let Ok(shortcut) = shortcut_str.parse::<Shortcut>() {
        let _ = app.global_shortcut().on_shortcut(shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                commands::toggle_voice_modal(app);
            }
        });
    }
}

fn open_settings(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("voice-modal") {
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("voice:open-settings", ());
    }
}
