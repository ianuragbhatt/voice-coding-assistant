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
        .manage(commands::WhisperState::new())
        .invoke_handler(tauri::generate_handler![
            commands::type_text,
            commands::get_store_value,
            commands::set_store_value,
            commands::update_shortcut,
            commands::get_local_model_status,
            commands::download_local_model,
            commands::delete_local_model,
            commands::transcribe_local,
            commands::check_accessibility_permission,
            commands::open_permission_settings,
        ])
        .setup(|app| {
            let store = app.store_builder("settings.json").build()?;

            // Default shortcut
            if store.get("shortcut").is_none() {
                let default_shortcut = if cfg!(target_os = "macos") { "cmd+shift+v" } else { "ctrl+shift+v" };
                store.set("shortcut", default_shortcut);
            }

            // Default providers
            if store.get("providers").is_none() {
                store.set("providers", serde_json::json!({
                    "stt": { "base_url": "https://api.openai.com/v1", "api_key": "", "model": "whisper-1" },
                    "llm": { "base_url": "https://api.openai.com/v1", "api_key": "", "model": "gpt-4o-mini", "temperature": 0.3 }
                }));
            }

            // Merge settings: preserve existing keys, add new ones with defaults
            // This handles the migration from old settings that don't have sttMode/localModel
            {
                let mut settings = store
                    .get("settings")
                    .and_then(|v| v.as_object().cloned())
                    .unwrap_or_default();
                settings.entry("silenceTimeoutMs").or_insert(serde_json::json!(3000));
                settings.entry("sttMode").or_insert(serde_json::json!("api"));
                // macOS defaults to English-only model (faster with Metal, ~30% smaller)
                let default_model = if cfg!(target_os = "macos") { "base.en" } else { "base" };
                settings.entry("localModel").or_insert(serde_json::json!(default_model));
                store.set("settings", serde_json::Value::Object(settings));
            }

            store.save()?;

            // Create the floating voice modal window
            let voice_window = tauri::WebviewWindowBuilder::new(
                app,
                "voice-modal",
                tauri::WebviewUrl::App("/voice.html".into()),
            )
            .title("Voice Assistant")
            .inner_size(480.0, 118.0)
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

            // Enable navigator.mediaDevices in WKWebView (macOS private API)
            #[cfg(target_os = "macos")]
            {
                use objc2::runtime::AnyObject;
                use objc2::msg_send;
                use objc2_foundation::{ns_string, NSNumber};

                voice_window.with_webview(|wv| unsafe {
                    let wk_webview = wv.inner() as *mut AnyObject;
                    let config: *mut AnyObject = msg_send![wk_webview, configuration];
                    let prefs: *mut AnyObject = msg_send![config, preferences];
                    let yes = NSNumber::numberWithBool(true);
                    let no  = NSNumber::numberWithBool(false);
                    let _: () = msg_send![prefs, setValue: &*yes, forKey: ns_string!("mediaDevicesEnabled")];
                    let _: () = msg_send![prefs, setValue: &*no,  forKey: ns_string!("mediaCaptureRequiresSecureConnection")];
                }).ok();
            }

            let _ = voice_window;

            // Register global shortcut from store
            let shortcut_str = store
                .get("shortcut")
                .and_then(|v| v.as_str().map(String::from))
                .unwrap_or_else(|| {
                    if cfg!(target_os = "macos") { "cmd+shift+v".to_string() } else { "ctrl+shift+v".to_string() }
                });
            register_shortcut(app.handle(), &shortcut_str);

            // System tray
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
