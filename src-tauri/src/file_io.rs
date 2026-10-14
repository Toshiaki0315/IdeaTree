//! マインドマップ（JSON）のファイル入出力。

use base64::Engine;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

/// 読み込めるファイルの上限（想定外の巨大ファイルでメモリを使い切らないため）
pub const MAX_READ_BYTES: u64 = 50 * 1024 * 1024;

/// テキストを書き込む（UTF-8）。書き込み方は、`write_bytes_file` と同じ。
pub fn write_text_file(path: &Path, contents: &str) -> Result<(), String> {
    write_bytes_file(path, contents.as_bytes())
}

/// 一時ファイルに書き込んでから置き換えることで、保存の途中で失敗しても元のファイルを壊さない。
pub fn write_bytes_file(path: &Path, contents: &[u8]) -> Result<(), String> {
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

/// フロントエンドの `invoke("save_binary_file", { path, dataBase64 })` から呼ばれるコマンド。
/// 画像（PNG）や PDF など、テキストでないデータを、base64 で受け取って保存する。
#[tauri::command]
pub fn save_binary_file(path: String, data_base64: String) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("書き込むデータの形式が不正です: {e}"))?;
    write_bytes_file(Path::new(&path), &bytes)
}

/// フロントエンドの `invoke("save_file", { path, contents })` から呼ばれるコマンド。
#[tauri::command]
pub fn save_file(path: String, contents: String) -> Result<(), String> {
    write_text_file(Path::new(&path), &contents)
}

/// UTF-8 のテキストファイルを読み込む。存在しない・巨大すぎる・テキストでない場合はエラーにする。
pub fn read_text_file(path: &Path) -> Result<String, String> {
    if path.as_os_str().is_empty() {
        return Err("読み込み元のパスが空です".to_string());
    }
    let metadata = fs::metadata(path).map_err(|e| match e.kind() {
        ErrorKind::NotFound => format!("ファイルが見つかりません: {}", path.display()),
        _ => format!("ファイルを読み込めません: {}: {e}", path.display()),
    })?;
    if metadata.is_dir() {
        return Err(format!("ファイルを読み込めません: {}", path.display()));
    }
    if metadata.len() > MAX_READ_BYTES {
        return Err(format!(
            "ファイルが大きすぎます（上限 {} MB）: {}",
            MAX_READ_BYTES / 1024 / 1024,
            path.display()
        ));
    }

    let bytes = fs::read(path)
        .map_err(|e| format!("ファイルを読み込めません: {}: {e}", path.display()))?;
    String::from_utf8(bytes)
        .map_err(|_| format!("ファイルがUTF-8のテキストではありません: {}", path.display()))
}

/// フロントエンドの `invoke("load_file", { path })` から呼ばれるコマンド。
#[tauri::command]
pub fn load_file(path: String) -> Result<String, String> {
    read_text_file(Path::new(&path))
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

    #[test]
    fn バイナリ_utf8でないバイト列もそのまま書き込める() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("image.png");
        let bytes = [0x89, b'P', b'N', b'G', 0x00, 0xFF, 0xFE, 0x80];

        write_bytes_file(&path, &bytes).unwrap();

        assert_eq!(fs::read(&path).unwrap(), bytes);
    }

    #[test]
    fn バイナリ_既存ファイルを置き換え_一時ファイルが残らない() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("image.png");

        write_bytes_file(&path, &[1, 2, 3, 4, 5, 6]).unwrap();
        write_bytes_file(&path, &[9]).unwrap();

        assert_eq!(fs::read(&path).unwrap(), vec![9]);
        let names: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["image.png"]);
    }

    #[test]
    fn バイナリ_保存先のフォルダがなければエラーになる() {
        let dir = tempdir().unwrap();

        let err = write_bytes_file(&dir.path().join("missing").join("a.png"), &[1]).unwrap_err();

        assert!(err.contains("保存先のフォルダが存在しません"), "{err}");
    }

    #[test]
    fn バイナリ_コマンドはbase64の文字列を復号して保存する() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("cmd.pdf");

        // "%PDF-" に続く、バイナリのバイト列
        save_binary_file(path.to_string_lossy().into_owned(), "JVBERi0A/w==".to_string()).unwrap();

        assert_eq!(fs::read(&path).unwrap(), b"%PDF-\x00\xff");
    }

    #[test]
    fn バイナリ_base64として不正なデータはエラーになり_何も書き込まない() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("bad.png");

        let err = save_binary_file(path.to_string_lossy().into_owned(), "これは%%base64ではない".to_string())
            .unwrap_err();

        assert!(err.contains("書き込むデータの形式が不正です"), "{err}");
        assert!(!path.exists());
    }
}
