use serde::Serialize;
use std::fs;
use std::path::PathBuf;

fn axon_home() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join(".axon")
}

fn workspace_dir(project: &str) -> PathBuf {
    axon_home().join("workspaces").join(project)
}

// ─── Types ───────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub status: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "lastRollup")]
    pub last_rollup: Option<String>,
    #[serde(rename = "episodeCount")]
    pub episode_count: usize,
    #[serde(rename = "openLoopCount")]
    pub open_loop_count: usize,
}

#[derive(Serialize)]
pub struct RollupFile {
    pub filename: String,
    pub content: String,
}

#[derive(Serialize)]
pub struct FileContent {
    pub content: String,
}

// ─── Helpers ─────────────────────────────────────────────────────

fn extract_yaml_field(content: &str, field: &str) -> Option<String> {
    for line in content.lines() {
        if let Some(rest) = line.strip_prefix(&format!("{}:", field)) {
            let val = rest.trim().to_string();
            if !val.is_empty() {
                return Some(val);
            }
        }
    }
    None
}

fn count_open_loops(content: &str) -> usize {
    content
        .lines()
        .filter(|line| {
            let trimmed = line.trim_start();
            trimmed.starts_with("- [ ]") || trimmed.starts_with("- [>]")
        })
        .count()
}

// ─── Commands ────────────────────────────────────────────────────

#[tauri::command]
pub fn list_projects() -> Vec<ProjectInfo> {
    let ws_dir = axon_home().join("workspaces");
    let mut projects = Vec::new();

    let entries = match fs::read_dir(&ws_dir) {
        Ok(e) => e,
        Err(_) => return projects,
    };

    for entry in entries.flatten() {
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }

        let name = entry.file_name().to_string_lossy().to_string();
        let ws_path = entry.path();

        // Parse config.yaml
        let mut status = "active".to_string();
        let mut project_path = String::new();
        let mut created_at = String::new();

        if let Ok(cfg) = fs::read_to_string(ws_path.join("config.yaml")) {
            status = extract_yaml_field(&cfg, "status").unwrap_or_else(|| "active".to_string());
            project_path = extract_yaml_field(&cfg, "project_path").unwrap_or_default();
            created_at = extract_yaml_field(&cfg, "created_at").unwrap_or_default();
        }

        // Parse state.md
        let mut last_rollup = None;
        let mut open_loop_count = 0;

        if let Ok(state) = fs::read_to_string(ws_path.join("state.md")) {
            last_rollup = extract_yaml_field(&state, "last_rollup");
            open_loop_count = count_open_loops(&state);
        }

        // Count episodes
        let episode_count = fs::read_dir(ws_path.join("episodes"))
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|e| {
                        e.path()
                            .extension()
                            .map(|ext| ext == "md")
                            .unwrap_or(false)
                    })
                    .count()
            })
            .unwrap_or(0);

        projects.push(ProjectInfo {
            name,
            path: project_path,
            status,
            created_at,
            last_rollup,
            episode_count,
            open_loop_count,
        });
    }

    projects
}

#[tauri::command]
pub fn list_rollups(project: String) -> Vec<RollupFile> {
    let ep_dir = workspace_dir(&project).join("episodes");
    let mut rollups = Vec::new();

    let mut files: Vec<_> = fs::read_dir(&ep_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "md")
                .unwrap_or(false)
        })
        .collect();

    // Sort descending by filename (date-based names)
    files.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    for entry in files {
        let filename = entry.file_name().to_string_lossy().to_string();
        if let Ok(content) = fs::read_to_string(entry.path()) {
            rollups.push(RollupFile { filename, content });
        }
    }

    rollups
}

#[tauri::command]
pub fn read_state(project: String) -> FileContent {
    let path = workspace_dir(&project).join("state.md");
    let content = fs::read_to_string(&path).unwrap_or_default();
    FileContent { content }
}

#[tauri::command]
pub fn read_config(project: String) -> FileContent {
    let path = workspace_dir(&project).join("config.yaml");
    let content = fs::read_to_string(&path).unwrap_or_default();
    FileContent { content }
}

#[tauri::command]
pub fn read_stream(project: String) -> FileContent {
    let path = workspace_dir(&project).join("stream.md");
    let content = fs::read_to_string(&path).unwrap_or_default();
    FileContent { content }
}

#[tauri::command]
pub fn list_mornings(project: String) -> Vec<RollupFile> {
    let morning_dir = workspace_dir(&project).join("mornings");
    let mut mornings = Vec::new();

    let mut files: Vec<_> = fs::read_dir(&morning_dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.ends_with(".log") || name.ends_with(".md")
        })
        .collect();

    files.sort_by(|a, b| b.file_name().cmp(&a.file_name()));

    for entry in files {
        let filename = entry.file_name().to_string_lossy().to_string();
        if let Ok(content) = fs::read_to_string(entry.path()) {
            mornings.push(RollupFile { filename, content });
        }
    }

    mornings
}
