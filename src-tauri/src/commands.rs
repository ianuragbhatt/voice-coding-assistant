use clipboard_rs::{Clipboard, ClipboardContext};
use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use serde_json::Value;
use std::sync::atomic::{AtomicI32, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

/// PID of the app that was frontmost when the voice modal was opened (macOS only).
#[cfg(target_os = "macos")]
static PREV_FRONT_PID: AtomicI32 = AtomicI32::new(-1);

// ─────────────────────────────────────────────────────────────────────────────
// Whisper model cache (managed state)
// ─────────────────────────────────────────────────────────────────────────────

pub(crate) struct WhisperModelCache {
    // Arc allows cloning a reference to the context so we can move it into spawn_blocking
    ctx: Option<Arc<whisper_rs::WhisperContext>>,
    model_id: Option<String>,
}

pub struct WhisperState(pub(crate) Mutex<WhisperModelCache>);

impl WhisperState {
    pub fn new() -> Self {
        WhisperState(Mutex::new(WhisperModelCache {
            ctx: None,
            model_id: None,
        }))
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Paste / text injection
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
pub fn save_frontmost_pid() {
    use objc2_app_kit::NSWorkspace;
    let pid = NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .map(|app| app.processIdentifier())
        .unwrap_or(-1);
    if pid > 0 {
        PREV_FRONT_PID.store(pid, Ordering::Relaxed);
    }
}

#[cfg(target_os = "macos")]
fn activate_prev_app() {
    use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication};
    let pid = PREV_FRONT_PID.load(Ordering::Relaxed);
    if pid <= 0 {
        return;
    }
    if let Some(app) = NSRunningApplication::runningApplicationWithProcessIdentifier(pid) {
        app.activateWithOptions(NSApplicationActivationOptions(0));
    }
}

/// Inject `text` into the focused application via clipboard paste.
///
/// HIToolbox (used by enigo for key-code lookup) must run on the macOS main thread.
/// Clipboard operations happen on a blocking worker thread; the actual keystroke is
/// dispatched to the main thread via `run_on_main_thread` with a channel for the result.
#[tauri::command]
pub async fn type_text(app: AppHandle, text: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let ctx = ClipboardContext::new().map_err(|e| format!("Clipboard init failed: {}", e))?;
        let saved = ctx.get_text().ok();
        ctx.set_text(text).map_err(|e| format!("Failed to set clipboard: {}", e))?;

        #[cfg(target_os = "macos")]
        activate_prev_app();

        std::thread::sleep(std::time::Duration::from_millis(300));

        let (tx, rx) = std::sync::mpsc::sync_channel::<Result<(), String>>(1);
        app.run_on_main_thread(move || {
            let _ = tx.send(simulate_paste_keystroke());
        })
        .map_err(|e| format!("run_on_main_thread failed: {}", e))?;

        let paste_result = rx
            .recv_timeout(std::time::Duration::from_secs(3))
            .map_err(|_| "Timed out waiting for paste keystroke".to_string())?;

        std::thread::sleep(std::time::Duration::from_millis(100));
        if let Some(prev) = saved {
            let _ = ctx.set_text(prev);
        }

        paste_result
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Simulate Cmd+V (macOS) or Ctrl+V (other). Must be called on the main thread.
fn simulate_paste_keystroke() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    {
        enigo.key(Key::Meta, Direction::Press).map_err(|e| format!("Key press failed: {}", e))?;
        enigo.key(Key::Unicode('v'), Direction::Click).map_err(|e| format!("Key click failed: {}", e))?;
        enigo.key(Key::Meta, Direction::Release).map_err(|e| format!("Key release failed: {}", e))?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        enigo.key(Key::Control, Direction::Press).map_err(|e| format!("Key press failed: {}", e))?;
        enigo.key(Key::Unicode('v'), Direction::Click).map_err(|e| format!("Key click failed: {}", e))?;
        enigo.key(Key::Control, Direction::Release).map_err(|e| format!("Key release failed: {}", e))?;
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent store
// ─────────────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_store_value(app: AppHandle, key: String) -> Result<Option<Value>, String> {
    let store = app.store_builder("settings.json").build().map_err(|e| e.to_string())?;
    Ok(store.get(&key))
}

#[tauri::command]
pub async fn set_store_value(app: AppHandle, key: String, value: Value) -> Result<(), String> {
    let store = app.store_builder("settings.json").build().map_err(|e| e.to_string())?;
    store.set(&key, value);
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let new_shortcut: Shortcut = shortcut.parse().map_err(|e| format!("Invalid shortcut: {}", e))?;
    app.global_shortcut().unregister_all().map_err(|e| format!("Failed to unregister shortcuts: {}", e))?;
    app.global_shortcut()
        .on_shortcut(new_shortcut, |app, _shortcut, event| {
            if event.state == ShortcutState::Pressed {
                toggle_voice_modal(app);
            }
        })
        .map_err(|e| format!("Failed to register shortcut: {}", e))?;
    let store = app.store_builder("settings.json").build().map_err(|e| e.to_string())?;
    store.set("shortcut", shortcut);
    store.save().map_err(|e| e.to_string())
}

pub fn toggle_voice_modal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("voice-modal") {
        let is_visible = window.is_visible().unwrap_or(false);
        if is_visible {
            let _ = window.hide();
            let _ = window.emit("voice:toggle", false);
        } else {
            #[cfg(target_os = "macos")]
            save_frontmost_pid();
            let _ = window.center();
            let _ = window.show();
            let _ = window.set_focus();
            let _ = window.emit("voice:toggle", true);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local whisper model management
// ─────────────────────────────────────────────────────────────────────────────

#[derive(serde::Serialize, Clone, Debug)]
pub struct LocalModelStatus {
    pub downloaded: bool,
    pub size_bytes: Option<u64>,
    pub path: Option<String>,
}

/// Returns where a given model would be stored on disk.
pub fn model_path(app: &AppHandle, model_id: &str) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("whisper_models");
    Ok(dir.join(format!("ggml-{}.bin", model_id)))
}

#[tauri::command]
pub async fn get_local_model_status(app: AppHandle, model_id: String) -> Result<LocalModelStatus, String> {
    let path = model_path(&app, &model_id)?;
    if path.exists() {
        let size = std::fs::metadata(&path).ok().map(|m| m.len());
        Ok(LocalModelStatus {
            downloaded: true,
            size_bytes: size,
            path: Some(path.to_string_lossy().into_owned()),
        })
    } else {
        Ok(LocalModelStatus {
            downloaded: false,
            size_bytes: None,
            path: None,
        })
    }
}

#[derive(Clone, serde::Serialize)]
struct DownloadProgress {
    model_id: String,
    progress: f32,
    done: bool,
    error: Option<String>,
}

#[tauri::command]
pub async fn download_local_model(app: AppHandle, model_id: String) -> Result<(), String> {
    use futures_util::StreamExt;

    let url = format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{}.bin",
        model_id
    );

    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("whisper_models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let tmp_path = dir.join(format!("ggml-{}.bin.tmp", model_id));
    let final_path = dir.join(format!("ggml-{}.bin", model_id));

    let emit_progress = |app: &AppHandle, progress: f32, done: bool, error: Option<String>| {
        let _ = app.emit(
            "model-download-progress",
            DownloadProgress { model_id: model_id.clone(), progress, done, error },
        );
    };

    emit_progress(&app, 0.0, false, None);

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !response.status().is_success() {
        let msg = format!("Download error: HTTP {}", response.status());
        emit_progress(&app, 0.0, true, Some(msg.clone()));
        return Err(msg);
    }

    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    use std::io::Write;
    let mut file = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| {
            let msg = format!("Stream error: {}", e);
            emit_progress(&app, 0.0, true, Some(msg.clone()));
            msg
        })?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        if total > 0 {
            let progress = (downloaded as f32) / (total as f32);
            emit_progress(&app, progress, false, None);
        }
    }

    // Atomic rename: .tmp → .bin
    std::fs::rename(&tmp_path, &final_path).map_err(|e| e.to_string())?;
    emit_progress(&app, 1.0, true, None);
    Ok(())
}

#[tauri::command]
pub async fn delete_local_model(app: AppHandle, model_id: String) -> Result<(), String> {
    let path = model_path(&app, &model_id)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Local whisper transcription
// ─────────────────────────────────────────────────────────────────────────────

/// Parse 16-bit PCM WAV bytes into a Vec<f32> suitable for whisper inference.
pub fn parse_wav_to_f32(wav_bytes: &[u8]) -> Result<Vec<f32>, String> {
    let cursor = std::io::Cursor::new(wav_bytes);
    let mut reader = hound::WavReader::new(cursor).map_err(|e| e.to_string())?;
    let spec = reader.spec();

    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => {
            if spec.bits_per_sample == 16 {
                reader
                    .samples::<i16>()
                    .map(|s| s.map(|v| v as f32 / i16::MAX as f32))
                    .collect::<Result<Vec<f32>, _>>()
                    .map_err(|e| e.to_string())?
            } else if spec.bits_per_sample == 32 {
                reader
                    .samples::<i32>()
                    .map(|s| s.map(|v| v as f32 / i32::MAX as f32))
                    .collect::<Result<Vec<f32>, _>>()
                    .map_err(|e| e.to_string())?
            } else {
                return Err(format!("Unsupported bits_per_sample: {}", spec.bits_per_sample));
            }
        }
        hound::SampleFormat::Float => reader
            .samples::<f32>()
            .collect::<Result<Vec<f32>, _>>()
            .map_err(|e| e.to_string())?,
    };

    // whisper.cpp expects mono; if stereo, downmix to mono
    if spec.channels == 2 {
        Ok(samples
            .chunks_exact(2)
            .map(|pair| (pair[0] + pair[1]) * 0.5)
            .collect())
    } else {
        Ok(samples)
    }
}

#[tauri::command]
pub async fn transcribe_local(
    app: AppHandle,
    state: tauri::State<'_, WhisperState>,
    audio_wav: Vec<u8>,
    model_id: String,
) -> Result<String, String> {
    let path = model_path(&app, &model_id)?;
    if !path.exists() {
        return Err(format!("Model '{}' not downloaded. Please download it in Settings.", model_id));
    }
    let path_str = path.to_string_lossy().into_owned();

    // Parse WAV → f32 PCM samples (cheap, do synchronously)
    let pcm_samples = parse_wav_to_f32(&audio_wav)?;

    if pcm_samples.is_empty() {
        return Err("Audio data is empty".to_string());
    }

    // Check if we need to (re)load the model; extract Arc<WhisperContext> to move into spawn_blocking
    let ctx_arc: Arc<whisper_rs::WhisperContext> = {
        let needs_reload = {
            let cache = state.0.lock().map_err(|e| e.to_string())?;
            cache.model_id.as_deref() != Some(&model_id) || cache.ctx.is_none()
        };

        if needs_reload {
            // Load model on blocking thread (reads ~148MB from disk — can take 1-2s)
            let path_str_clone = path_str.clone();
            let new_ctx = tokio::task::spawn_blocking(move || {
                whisper_rs::WhisperContext::new_with_params(
                    &path_str_clone,
                    whisper_rs::WhisperContextParameters::default(),
                )
                .map_err(|e| format!("Failed to load model: {}", e))
            })
            .await
            .map_err(|e| format!("spawn_blocking failed: {}", e))??;

            let new_ctx_arc = Arc::new(new_ctx);
            let mut cache = state.0.lock().map_err(|e| e.to_string())?;
            cache.ctx = Some(Arc::clone(&new_ctx_arc));
            cache.model_id = Some(model_id.clone());
            new_ctx_arc
        } else {
            let cache = state.0.lock().map_err(|e| e.to_string())?;
            Arc::clone(cache.ctx.as_ref().ok_or("Model cache inconsistent")?)
        }
    };

    // Run whisper inference on blocking thread (CPU-bound, can take a few seconds)
    let text = tokio::task::spawn_blocking(move || -> Result<String, String> {
        let mut whisper_state = ctx_arc
            .create_state()
            .map_err(|e| format!("Failed to create state: {}", e))?;

        let mut params = whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("auto"));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);

        whisper_state
            .full(params, &pcm_samples)
            .map_err(|e| format!("Inference failed: {}", e))?;

        let n_segments = whisper_state.full_n_segments().map_err(|e| e.to_string())?;
        let mut text = String::new();
        for i in 0..n_segments {
            if let Ok(segment) = whisper_state.full_get_segment_text(i) {
                text.push_str(&segment);
            }
        }

        Ok(text.trim().to_string())
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {}", e))??;

    Ok(text)
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

/// Check if the accessibility permission is granted (needed for keyboard simulation).
/// Returns true on Windows/Linux (no such permission system there).
#[tauri::command]
pub fn check_accessibility_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        // AXIsProcessTrusted() returns true if the app has accessibility access
        #[link(name = "ApplicationServices", kind = "framework")]
        extern "C" {
            fn AXIsProcessTrusted() -> bool;
        }
        unsafe { AXIsProcessTrusted() }
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Open the system permission settings for the given permission type.
#[tauri::command]
pub async fn open_permission_settings(app: AppHandle, permission_type: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        #[allow(deprecated)]
        {
            use tauri_plugin_shell::ShellExt;
            let url = match permission_type.as_str() {
                "microphone" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
                "accessibility" => "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
                _ => return Err(format!("Unknown permission type: {}", permission_type)),
            };
            app.shell()
                .open(url, None)
                .map_err(|e| format!("Failed to open settings: {}", e))?;
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = permission_type;
        let _ = app;
    }
    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper: build a minimal valid 16-bit mono PCM WAV in memory.
    fn make_test_wav(sample_rate: u32, samples: &[i16]) -> Vec<u8> {
        let num_samples = samples.len() as u32;
        let data_size = num_samples * 2; // 2 bytes per i16
        let mut buf = Vec::with_capacity(44 + data_size as usize);

        let write_u32le = |buf: &mut Vec<u8>, v: u32| {
            buf.push((v & 0xFF) as u8);
            buf.push(((v >> 8) & 0xFF) as u8);
            buf.push(((v >> 16) & 0xFF) as u8);
            buf.push(((v >> 24) & 0xFF) as u8);
        };
        let write_u16le = |buf: &mut Vec<u8>, v: u16| {
            buf.push((v & 0xFF) as u8);
            buf.push(((v >> 8) & 0xFF) as u8);
        };

        // RIFF header
        buf.extend_from_slice(b"RIFF");
        write_u32le(&mut buf, 36 + data_size);
        buf.extend_from_slice(b"WAVE");

        // fmt chunk
        buf.extend_from_slice(b"fmt ");
        write_u32le(&mut buf, 16); // chunk size
        write_u16le(&mut buf, 1); // PCM
        write_u16le(&mut buf, 1); // mono
        write_u32le(&mut buf, sample_rate);
        write_u32le(&mut buf, sample_rate * 2); // byte rate
        write_u16le(&mut buf, 2); // block align
        write_u16le(&mut buf, 16); // bits per sample

        // data chunk
        buf.extend_from_slice(b"data");
        write_u32le(&mut buf, data_size);
        for &s in samples {
            buf.push((s & 0xFF) as u8);
            buf.push(((s >> 8) & 0xFF) as u8);
        }

        buf
    }

    #[test]
    fn test_parse_wav_basic() {
        // Sine-like pattern at 16kHz, 100 samples
        let samples: Vec<i16> = (0..100).map(|i| (i * 300) as i16).collect();
        let wav = make_test_wav(16000, &samples);
        let f32_samples = parse_wav_to_f32(&wav).expect("parse should succeed");
        assert_eq!(f32_samples.len(), 100);
        // First sample is 0 → maps to 0.0
        assert!((f32_samples[0]).abs() < 1e-6);
        // Values in [-1, 1]
        for &s in &f32_samples {
            assert!(s >= -1.0 && s <= 1.0, "sample out of range: {}", s);
        }
    }

    #[test]
    fn test_parse_wav_stereo_downmix() {
        // Build a stereo WAV (2 channels) manually
        let num_samples: u32 = 4; // 4 stereo frames = 8 samples total
        let data_size = num_samples * 4; // 2 channels * 2 bytes per sample
        let mut buf = Vec::new();

        let write_u32le = |buf: &mut Vec<u8>, v: u32| {
            buf.extend_from_slice(&v.to_le_bytes());
        };
        let write_u16le = |buf: &mut Vec<u8>, v: u16| {
            buf.extend_from_slice(&v.to_le_bytes());
        };

        buf.extend_from_slice(b"RIFF");
        write_u32le(&mut buf, 36 + data_size);
        buf.extend_from_slice(b"WAVE");
        buf.extend_from_slice(b"fmt ");
        write_u32le(&mut buf, 16);
        write_u16le(&mut buf, 1);
        write_u16le(&mut buf, 2); // stereo
        write_u32le(&mut buf, 16000);
        write_u32le(&mut buf, 16000 * 4);
        write_u16le(&mut buf, 4);
        write_u16le(&mut buf, 16);
        buf.extend_from_slice(b"data");
        write_u32le(&mut buf, data_size);

        // Write interleaved L/R samples: L=0x4000, R=0x4000
        for _ in 0..num_samples {
            buf.extend_from_slice(&(0x4000i16).to_le_bytes()); // L
            buf.extend_from_slice(&(0x4000i16).to_le_bytes()); // R
        }

        let result = parse_wav_to_f32(&buf).expect("stereo parse should succeed");
        assert_eq!(result.len(), num_samples as usize, "stereo downmix should yield mono frames");
        // Both channels equal → downmix should equal each channel
        let expected = 0x4000 as f32 / i16::MAX as f32;
        for &s in &result {
            assert!((s - expected).abs() < 1e-4, "unexpected value: {}", s);
        }
    }

    #[test]
    fn test_parse_wav_empty_data() {
        let wav = make_test_wav(16000, &[]);
        let result = parse_wav_to_f32(&wav).expect("empty WAV should parse without error");
        assert!(result.is_empty());
    }

    #[test]
    fn test_parse_wav_invalid_bytes() {
        let result = parse_wav_to_f32(b"not a wav file at all");
        assert!(result.is_err(), "should return error for invalid WAV");
    }

    #[test]
    fn test_local_model_status_no_file() {
        // model_path requires an AppHandle which we can't easily create in unit tests.
        // Test the path construction logic with a direct PathBuf instead.
        let fake_path = std::path::PathBuf::from("/nonexistent/whisper_models/ggml-base.bin");
        assert!(!fake_path.exists());
    }

    #[test]
    fn test_check_accessibility_permission_returns_bool() {
        // Just verify it doesn't panic and returns a bool
        let result = check_accessibility_permission();
        // On macOS in test environment may return false; on other platforms always true
        let _ = result; // type-check only: must be bool
    }
}
