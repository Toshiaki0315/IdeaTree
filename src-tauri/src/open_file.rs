//! Finder からファイルを開く（ダブルクリック・「このアプリで開く」）ときの、ファイルのパスの扱い。

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
