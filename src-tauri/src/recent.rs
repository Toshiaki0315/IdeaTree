//! 最近使ったファイルの一覧の保存（アプリのデータフォルダ）。

use crate::file_io::{read_text_file, write_text_file};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// 一覧のファイル名（アプリのデータフォルダの中に置く）
pub const RECENT_FILE: &str = "recent-files.json";

/// 一覧を書き込む。フォルダがなければ作る。途中で失敗しても、前の内容を壊さない
pub fn write_recent_in(dir: &Path, contents: &str) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| {
        format!(
            "最近使ったファイルの保存先を用意できません: {}: {e}",
            dir.display()
        )
    })?;
    write_text_file(&dir.join(RECENT_FILE), contents)
}

/// 一覧を読み出す。なければ None
pub fn read_recent_in(dir: &Path) -> Result<Option<String>, String> {
    let path = dir.join(RECENT_FILE);
    if !path.exists() {
        return Ok(None);
    }
    read_text_file(&path).map(Some)
}

fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("アプリのデータフォルダを取得できません: {e}"))
}

/// フロントエンドの `invoke("write_recent_files", { contents })` から呼ばれるコマンド。
#[tauri::command]
pub fn write_recent_files(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    write_recent_in(&data_dir(&app)?, &contents)
}

/// フロントエンドの `invoke("read_recent_files")` から呼ばれるコマンド。
#[tauri::command]
pub fn read_recent_files(app: tauri::AppHandle) -> Result<Option<String>, String> {
    read_recent_in(&data_dir(&app)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn フォルダがなくても作って書き込み_読み出せる() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("app").join("data");

        write_recent_in(&target, "[{\"path\":\"/a\"}]").unwrap();

        assert_eq!(
            read_recent_in(&target).unwrap(),
            Some("[{\"path\":\"/a\"}]".to_string())
        );
        assert!(target.join(RECENT_FILE).exists());
    }

    #[test]
    fn 書き直すと内容が置き換わる() {
        let dir = tempdir().unwrap();

        write_recent_in(dir.path(), "古い内容がとても長く書かれている").unwrap();
        write_recent_in(dir.path(), "新").unwrap();

        assert_eq!(
            fs::read_to_string(dir.path().join(RECENT_FILE)).unwrap(),
            "新"
        );
    }

    #[test]
    fn 一覧がなければ_読み出しはnoneを返す() {
        let dir = tempdir().unwrap();

        assert_eq!(read_recent_in(dir.path()).unwrap(), None);
        assert_eq!(read_recent_in(&dir.path().join("missing")).unwrap(), None);
    }

    #[test]
    fn 保存先を用意できなければエラーになる() {
        let dir = tempdir().unwrap();
        let blocker = dir.path().join("blocker");
        fs::write(&blocker, "ファイル").unwrap();

        let err = write_recent_in(&blocker.join("sub"), "x").unwrap_err();

        assert!(err.contains("保存先を用意できません"), "{err}");
    }
}
