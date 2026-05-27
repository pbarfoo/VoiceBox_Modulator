use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

const BACKEND_PORT: u16 = 17861;

struct BackendProcess(Mutex<Option<Child>>);

#[tauri::command]
fn backend_port() -> u16 {
    BACKEND_PORT
}

/// Resolve the project root in dev (parent of src-tauri). In a bundled app the
/// sidecar binary is launched differently (Phase 4); for now we support dev +
/// an explicit override via the VOICEBOX_BACKEND_DIR env var.
fn backend_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("VOICEBOX_BACKEND_DIR") {
        return PathBuf::from(dir);
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest.parent().unwrap().join("backend")
}

fn spawn_backend() -> Option<Child> {
    let dir = backend_dir();
    let python = dir.join(".venv").join("bin").join("python");
    if !python.exists() {
        eprintln!(
            "[voicebox] backend venv not found at {}. Run backend setup first.",
            python.display()
        );
        return None;
    }
    match Command::new(python)
        .args([
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            &BACKEND_PORT.to_string(),
        ])
        .current_dir(&dir)
        .spawn()
    {
        Ok(child) => {
            println!("[voicebox] backend started (pid {})", child.id());
            Some(child)
        }
        Err(e) => {
            eprintln!("[voicebox] failed to start backend: {e}");
            None
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(BackendProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![backend_port])
        .setup(|app| {
            let child = spawn_backend();
            *app.state::<BackendProcess>().0.lock().unwrap() = child;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                if let Some(mut child) = app.state::<BackendProcess>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
        });
}
