use tauri::{Emitter, Manager};

mod autosave;
mod file_io;
mod image_io;
mod open_file;
mod recent;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .manage(open_file::PendingOpenFiles::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            file_io::save_file,
            file_io::save_binary_file,
            file_io::load_file,
            image_io::load_image,
            autosave::write_autosave,
            autosave::read_autosave,
            autosave::clear_autosave,
            open_file::take_pending_open_files,
            recent::write_recent_files,
            recent::read_recent_files
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        // Finder から、ファイルを開くよう頼まれたとき（macOS）。起動の途中で届くことがあるので、
        // 画面の準備ができるまで溜めておき、準備ができていれば、画面にも知らせる
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = event {
            for url in urls {
                if let Some(path) = open_file::path_from_file_url(url.as_str()) {
                    app_handle
                        .state::<open_file::PendingOpenFiles>()
                        .push(path.clone());
                    let _ = app_handle.emit("open-file", path);
                }
            }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app_handle, event);
    });
}
