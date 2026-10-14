//! 自動保存（編集中の内容の一時保存）。アプリが落ちても、次の起動で復元できるようにする。

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

        assert_eq!(fs::read_to_string(target.join(AUTOSAVE_FILE)).unwrap(), "{\"a\":1}");
    }

    #[test]
    fn 書き直すと内容が置き換わり_一時ファイルは残らない() {
        let dir = tempdir().unwrap();

        write_autosave_in(dir.path(), "古い内容がとても長く書かれている").unwrap();
        write_autosave_in(dir.path(), "新").unwrap();

        assert_eq!(fs::read_to_string(dir.path().join(AUTOSAVE_FILE)).unwrap(), "新");
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

        assert_eq!(read_autosave_in(dir.path()).unwrap(), Some("日本語の内容".to_string()));
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
}
