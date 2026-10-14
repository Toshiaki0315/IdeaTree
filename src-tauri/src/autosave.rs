//! 自動保存（編集中の内容の一時保存）。アプリが落ちても、次の起動で復元できるようにする。

use crate::file_io::{read_text_file, write_text_file};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// 自動保存のファイル名（アプリのデータフォルダの中に置く）
pub const AUTOSAVE_FILE: &str = "autosave.json";

/// 自動保存を書き込む。フォルダがなければ作る。途中で失敗しても、前の内容を壊さない
pub fn write_autosave_in(dir: &Path, contents: &str) -> Result<(), String> {
    fs::create_dir_all(dir)
        .map_err(|e| format!("自動保存の保存先を用意できません: {}: {e}", dir.display()))?;
    write_text_file(&dir.join(AUTOSAVE_FILE), contents)
}

/// 自動保存を読み出す。なければ None
pub fn read_autosave_in(dir: &Path) -> Result<Option<String>, String> {
    let path = dir.join(AUTOSAVE_FILE);
    if !path.exists() {
        return Ok(None);
    }
    read_text_file(&path).map(Some)
}

/// 自動保存を削除する。なくてもエラーにしない
pub fn clear_autosave_in(dir: &Path) -> Result<(), String> {
    match fs::remove_file(dir.join(AUTOSAVE_FILE)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("自動保存を削除できません: {e}")),
    }
}

/// 自動保存を置く、アプリのデータフォルダ
fn autosave_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("アプリのデータフォルダを取得できません: {e}"))
}

/// フロントエンドの `invoke("write_autosave", { contents })` から呼ばれるコマンド。
#[tauri::command]
pub fn write_autosave(app: tauri::AppHandle, contents: String) -> Result<(), String> {
    write_autosave_in(&autosave_dir(&app)?, &contents)
}

/// フロントエンドの `invoke("read_autosave")` から呼ばれるコマンド。
#[tauri::command]
pub fn read_autosave(app: tauri::AppHandle) -> Result<Option<String>, String> {
    read_autosave_in(&autosave_dir(&app)?)
}

/// フロントエンドの `invoke("clear_autosave")` から呼ばれるコマンド。
#[tauri::command]
pub fn clear_autosave(app: tauri::AppHandle) -> Result<(), String> {
    clear_autosave_in(&autosave_dir(&app)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn フォルダがなくても作って書き込める() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("app").join("data");

        write_autosave_in(&target, "{\"a\":1}").unwrap();

        assert_eq!(
            fs::read_to_string(target.join(AUTOSAVE_FILE)).unwrap(),
            "{\"a\":1}"
        );
    }

    #[test]
    fn 書き直すと内容が置き換わり_一時ファイルは残らない() {
        let dir = tempdir().unwrap();

        write_autosave_in(dir.path(), "古い内容がとても長く書かれている").unwrap();
        write_autosave_in(dir.path(), "新").unwrap();

        assert_eq!(
            fs::read_to_string(dir.path().join(AUTOSAVE_FILE)).unwrap(),
            "新"
        );
        let names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec![AUTOSAVE_FILE]);
    }

    #[test]
    fn 書き込んだ内容を読み出せる() {
        let dir = tempdir().unwrap();
        write_autosave_in(dir.path(), "日本語の内容").unwrap();

        assert_eq!(
            read_autosave_in(dir.path()).unwrap(),
            Some("日本語の内容".to_string())
        );
    }

    #[test]
    fn 自動保存がなければ_読み出しはnoneを返す() {
        let dir = tempdir().unwrap();

        assert_eq!(read_autosave_in(dir.path()).unwrap(), None);
        assert_eq!(read_autosave_in(&dir.path().join("missing")).unwrap(), None);
    }

    #[test]
    fn 削除すると読み出せなくなる() {
        let dir = tempdir().unwrap();
        write_autosave_in(dir.path(), "内容").unwrap();

        clear_autosave_in(dir.path()).unwrap();

        assert_eq!(read_autosave_in(dir.path()).unwrap(), None);
        assert!(!dir.path().join(AUTOSAVE_FILE).exists());
    }

    #[test]
    fn 自動保存がなくても_削除はエラーにならない() {
        let dir = tempdir().unwrap();

        assert!(clear_autosave_in(dir.path()).is_ok());
        assert!(clear_autosave_in(&dir.path().join("missing")).is_ok());
    }

    #[test]
    fn 保存先のパスがファイルなどで作れなければエラーになる() {
        let dir = tempdir().unwrap();
        let blocker = dir.path().join("blocker");
        fs::write(&blocker, "ファイル").unwrap();

        let err = write_autosave_in(&blocker.join("sub"), "x").unwrap_err();

        assert!(err.contains("自動保存の保存先を用意できません"), "{err}");
    }

    #[test]
    fn 読み出しは_自動保存の場所がフォルダなど読めないものならエラーになる() {
        let dir = tempdir().unwrap();
        fs::create_dir(dir.path().join(AUTOSAVE_FILE)).unwrap();

        assert!(read_autosave_in(dir.path()).is_err());
    }

    #[test]
    fn 削除できないときは_エラーにする() {
        let dir = tempdir().unwrap();
        // 自動保存のファイルの位置にフォルダがあると、ファイルとしては削除できない
        fs::create_dir(dir.path().join(AUTOSAVE_FILE)).unwrap();

        let err = clear_autosave_in(dir.path()).unwrap_err();

        assert!(err.contains("自動保存を削除できません"), "{err}");
    }
}
