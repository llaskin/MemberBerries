mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::filesystem::list_projects,
            commands::filesystem::list_rollups,
            commands::filesystem::read_state,
            commands::filesystem::read_config,
            commands::filesystem::read_stream,
            commands::filesystem::list_mornings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
