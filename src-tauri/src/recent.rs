//! 最近使ったファイルの一覧の保存（アプリのデータフォルダ）。

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

        assert_eq!(read_recent_in(&target).unwrap(), Some("[{\"path\":\"/a\"}]".to_string()));
        assert!(target.join(RECENT_FILE).exists());
    }

    #[test]
    fn 書き直すと内容が置き換わる() {
        let dir = tempdir().unwrap();

        write_recent_in(dir.path(), "古い内容がとても長く書かれている").unwrap();
        write_recent_in(dir.path(), "新").unwrap();

        assert_eq!(fs::read_to_string(dir.path().join(RECENT_FILE)).unwrap(), "新");
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
