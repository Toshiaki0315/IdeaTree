//! マインドマップ（JSON）のファイル入出力。

use std::fs;
use std::path::Path;

/// 一時ファイルに書き込んでから置き換えることで、保存の途中で失敗しても元のファイルを壊さない。
pub fn write_text_file(path: &Path, contents: &str) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("保存先のパスが空です".to_string());
    }
    let parent = match path.parent() {
        Some(p) if !p.as_os_str().is_empty() => p,
        _ => Path::new("."),
    };
    if !parent.is_dir() {
        return Err(format!("保存先のフォルダが存在しません: {}", parent.display()));
    }
    let name = match path.file_name() {
        Some(name) if !path.is_dir() => name.to_string_lossy().into_owned(),
        _ => return Err(format!("ファイルを書き込めません: {}", path.display())),
    };

    let temp = parent.join(format!(".{name}.tmp"));
    let result = fs::write(&temp, contents).and_then(|_| fs::rename(&temp, path));
    if let Err(e) = result {
        let _ = fs::remove_file(&temp);
        return Err(format!("ファイルを書き込めません: {}: {e}", path.display()));
    }
    Ok(())
}

/// フロントエンドの `invoke("save_file", { path, contents })` から呼ばれるコマンド。
#[tauri::command]
pub fn save_file(path: String, contents: String) -> Result<(), String> {
    write_text_file(Path::new(&path), &contents)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;

    #[test]
    fn 新しいファイルを作成して内容を書き込む() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("map.json");

        write_text_file(&path, "{\"version\":1}").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"version\":1}");
    }

    #[test]
    fn 日本語をutf8のまま書き込める() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("map.json");

        write_text_file(&path, "アイデア").unwrap();

        assert_eq!(fs::read(&path).unwrap(), "アイデア".as_bytes());
    }

    #[test]
    fn 既存ファイルは全体が新しい内容で置き換わる() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("map.json");
        fs::write(&path, "とても長い古い内容とても長い古い内容").unwrap();

        write_text_file(&path, "新").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "新");
    }

    #[test]
    fn 空の内容も書き込める() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("map.json");

        write_text_file(&path, "").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "");
    }

    #[test]
    fn 書き込み後に一時ファイルが残らない() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("map.json");

        write_text_file(&path, "a").unwrap();
        write_text_file(&path, "b").unwrap();

        let names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["map.json"]);
    }

    #[test]
    fn 保存先のフォルダが存在しなければエラーになる() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("missing").join("map.json");

        let err = write_text_file(&path, "a").unwrap_err();

        assert!(err.contains("保存先のフォルダが存在しません"), "{err}");
    }

    #[test]
    fn パスが空ならエラーになる() {
        let err = write_text_file(Path::new(""), "a").unwrap_err();

        assert!(err.contains("保存先のパスが空です"), "{err}");
    }

    #[test]
    fn パスがフォルダを指していればエラーになり中身は壊れない() {
        let dir = tempdir().unwrap();
        let target = dir.path().join("folder");
        fs::create_dir(&target).unwrap();
        fs::write(target.join("keep.txt"), "残す").unwrap();

        let err = write_text_file(&target, "a").unwrap_err();

        assert!(err.contains("ファイルを書き込めません"), "{err}");
        assert_eq!(fs::read_to_string(target.join("keep.txt")).unwrap(), "残す");
    }

    #[test]
    fn コマンドはパス文字列と内容を受け取って保存する() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("cmd.json");

        save_file(path.to_string_lossy().into_owned(), "コマンド".to_string()).unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "コマンド");
    }

    #[test]
    fn 書き込んだファイルをそのまま読み込める() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("map.json");
        write_text_file(&path, "{\"version\":1}").unwrap();

        assert_eq!(read_text_file(&path).unwrap(), "{\"version\":1}");
    }

    #[test]
    fn 日本語をutf8のまま読み込める() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("map.json");
        fs::write(&path, "アイデア").unwrap();

        assert_eq!(read_text_file(&path).unwrap(), "アイデア");
    }

    #[test]
    fn 空のファイルは空文字列として読み込める() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("empty.json");
        fs::write(&path, "").unwrap();

        assert_eq!(read_text_file(&path).unwrap(), "");
    }

    #[test]
    fn 読み込み元のファイルが存在しなければエラーになる() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("missing.json");

        let err = read_text_file(&path).unwrap_err();

        assert!(err.contains("ファイルが見つかりません"), "{err}");
    }

    #[test]
    fn 読み込み元のパスが空ならエラーになる() {
        let err = read_text_file(Path::new("")).unwrap_err();

        assert!(err.contains("読み込み元のパスが空です"), "{err}");
    }

    #[test]
    fn 読み込み元がフォルダならエラーになる() {
        let dir = tempdir().unwrap();

        let err = read_text_file(dir.path()).unwrap_err();

        assert!(err.contains("ファイルを読み込めません"), "{err}");
    }

    #[test]
    fn utf8として読めない内容ならエラーになる() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("binary.json");
        fs::write(&path, [0xff, 0xfe, 0x00, 0x80]).unwrap();

        let err = read_text_file(&path).unwrap_err();

        assert!(err.contains("UTF-8のテキストではありません"), "{err}");
    }

    #[test]
    fn 上限を超える大きなファイルは読み込まずエラーになる() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("huge.json");
        let file = fs::File::create(&path).unwrap();
        file.set_len(MAX_READ_BYTES + 1).unwrap();

        let err = read_text_file(&path).unwrap_err();

        assert!(err.contains("ファイルが大きすぎます"), "{err}");
    }

    #[test]
    fn 上限ちょうどの大きさのファイルは読み込める() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("limit.json");
        fs::write(&path, vec![b'a'; MAX_READ_BYTES as usize]).unwrap();

        assert_eq!(read_text_file(&path).unwrap().len(), MAX_READ_BYTES as usize);
    }

    #[test]
    fn 読み込みコマンドはパス文字列を受け取って内容を返す() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("cmd.json");
        fs::write(&path, "コマンド").unwrap();

        let contents = load_file(path.to_string_lossy().into_owned()).unwrap();

        assert_eq!(contents, "コマンド");
    }
}
