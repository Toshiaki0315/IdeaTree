mod autosave;
mod file_io;
mod image_io;
mod open_file;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            file_io::save_file,
            file_io::save_binary_file,
            file_io::load_file,
            image_io::load_image,
            autosave::write_autosave,
            autosave::read_autosave,
            autosave::clear_autosave
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
