//! Finder からファイルを開く（ダブルクリック・「このアプリで開く」）ときの、ファイルのパスの扱い。

use std::sync::Mutex;

/// パーセントエンコード（%E4%BC%81 など）を、元の文字に戻す。壊れていれば None
fn percent_decode(text: &str) -> Option<String> {
    let bytes = text.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = text.get(i + 1..i + 3)?;
            decoded.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            decoded.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(decoded).ok()
}

/// `file:///Users/me/a.ideatree` のようなURLを、ファイルのパスに変換する。
/// ファイルのURLでない、別のホストを指す、パスがない、エンコードが壊れている場合は None
pub fn path_from_file_url(url: &str) -> Option<String> {
    let scheme = url.get(..7)?;
    if !scheme.eq_ignore_ascii_case("file://") {
        return None;
    }
    let rest = &url[7..];
    let slash = rest.find('/')?;
    let host = &rest[..slash];
    if !host.is_empty() && !host.eq_ignore_ascii_case("localhost") {
        return None;
    }
    percent_decode(&rest[slash..])
}

/// 起動のときに Finder から渡された、開くファイルのパスを、画面の準備ができるまで溜めておく
#[derive(Default)]
pub struct PendingOpenFiles(Mutex<Vec<String>>);

impl PendingOpenFiles {
    pub fn push(&self, path: String) {
        self.0.lock().unwrap_or_else(|e| e.into_inner()).push(path);
    }

    /// 溜めていたパスを、すべて取り出す（取り出したあとは、空になる）
    pub fn take(&self) -> Vec<String> {
        std::mem::take(&mut *self.0.lock().unwrap_or_else(|e| e.into_inner()))
    }
}

/// フロントエンドの `invoke("take_pending_open_files")` から呼ばれるコマンド。
#[tauri::command]
pub fn take_pending_open_files(pending: tauri::State<PendingOpenFiles>) -> Vec<String> {
    pending.take()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fileのurlを_パスに変換する() {
        assert_eq!(
            path_from_file_url("file:///Users/me/ideas.ideatree"),
            Some("/Users/me/ideas.ideatree".to_string())
        );
    }

    #[test]
    fn パーセントエンコードされた空白や日本語を_元に戻す() {
        assert_eq!(
            path_from_file_url("file:///Users/me/My%20Maps/%E4%BC%81%E7%94%BB.ideatree"),
            Some("/Users/me/My Maps/企画.ideatree".to_string())
        );
    }

    #[test]
    fn プラス記号は_そのまま文字として扱う() {
        assert_eq!(path_from_file_url("file:///a+b.ideatree"), Some("/a+b.ideatree".to_string()));
    }

    #[test]
    fn ホスト名がlocalhostでも_変換できる() {
        assert_eq!(
            path_from_file_url("file://localhost/Users/me/a.ideatree"),
            Some("/Users/me/a.ideatree".to_string())
        );
    }

    #[test]
    fn 大文字のスキームも受け付ける() {
        assert_eq!(path_from_file_url("FILE:///a.ideatree"), Some("/a.ideatree".to_string()));
    }

    #[test]
    fn ファイルのurlでないものは_nullになる() {
        assert_eq!(path_from_file_url("https://example.com/a.ideatree"), None);
        assert_eq!(path_from_file_url("/Users/me/a.ideatree"), None);
        assert_eq!(path_from_file_url(""), None);
    }

    #[test]
    fn 別のホストを指すurlは_nullになる() {
        assert_eq!(path_from_file_url("file://server/share/a.ideatree"), None);
    }

    #[test]
    fn パスがない_または壊れたエンコードは_nullになる() {
        assert_eq!(path_from_file_url("file://"), None);
        assert_eq!(path_from_file_url("file:///a%zz.ideatree"), None);
        assert_eq!(path_from_file_url("file:///a%"), None);
        assert_eq!(path_from_file_url("file:///a%E4%BC.ideatree"), None); // UTF-8 として不正
    }

    #[test]
    fn 起動時に開くファイルを_順に溜めて_取り出すと空になる() {
        let pending = PendingOpenFiles::default();
        assert!(pending.take().is_empty());

        pending.push("/a.ideatree".to_string());
        pending.push("/b.ideatree".to_string());

        assert_eq!(pending.take(), vec!["/a.ideatree", "/b.ideatree"]);
        assert!(pending.take().is_empty());
    }
}
