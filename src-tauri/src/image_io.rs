//! 画像ファイルを読み込み、ノードに設定できる、base64 のデータURLにする。

use base64::Engine;
use std::fs;
use std::io::ErrorKind;
use std::path::Path;

/// 読み込める画像の大きさの上限（フロントエンドの `MAX_IMAGE_BYTES` と同じ値）
pub const MAX_IMAGE_BYTES: u64 = 2 * 1024 * 1024;

/// ファイルの先頭のバイト列（マジックナンバー）から、画像の種類を判定する。拡張子は見ない
fn detect_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

/// 画像ファイル（PNG・JPEG・GIF・WebP）を読み込み、データURLにする。
/// 画像でない・大きすぎる場合は、エラーにする。
pub fn read_image_data_url(path: &Path) -> Result<String, String> {
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
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err(format!(
            "画像が大きすぎます（上限 {} MB）: {}",
            MAX_IMAGE_BYTES / 1024 / 1024,
            path.display()
        ));
    }

    let bytes =
        fs::read(path).map_err(|e| format!("ファイルを読み込めません: {}: {e}", path.display()))?;
    let mime = detect_mime(&bytes).ok_or_else(|| {
        format!(
            "画像ファイルではありません（PNG・JPEG・GIF・WebP のみ）: {}",
            path.display()
        )
    })?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{encoded}"))
}

/// フロントエンドの `invoke("load_image", { path })` から呼ばれるコマンド。
#[tauri::command]
pub fn load_image(path: String) -> Result<String, String> {
    read_image_data_url(Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use std::fs;
    use tempfile::tempdir;

    const PNG_HEADER: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    const JPEG_HEADER: [u8; 4] = [0xFF, 0xD8, 0xFF, 0xE0];

    fn encode(bytes: &[u8]) -> String {
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    fn webp_bytes() -> Vec<u8> {
        let mut bytes = b"RIFF".to_vec();
        bytes.extend_from_slice(&[0x1A, 0, 0, 0]);
        bytes.extend_from_slice(b"WEBPVP8 ");
        bytes
    }

    #[test]
    fn pngファイルをデータurlにする() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("a.png");
        let mut bytes = PNG_HEADER.to_vec();
        bytes.extend_from_slice(b"data");
        fs::write(&path, &bytes).unwrap();

        let url = read_image_data_url(&path).unwrap();

        assert_eq!(url, format!("data:image/png;base64,{}", encode(&bytes)));
    }

    #[test]
    fn jpegとgifとwebpも種類を見分けてデータurlにする() {
        let dir = tempdir().unwrap();
        let cases: Vec<(&str, Vec<u8>, &str)> = vec![
            ("a.jpg", [&JPEG_HEADER[..], b"data"].concat(), "image/jpeg"),
            ("a.gif", b"GIF89a....".to_vec(), "image/gif"),
            ("b.gif", b"GIF87a....".to_vec(), "image/gif"),
            ("a.webp", webp_bytes(), "image/webp"),
        ];
        for (name, bytes, mime) in cases {
            let path = dir.path().join(name);
            fs::write(&path, &bytes).unwrap();

            let url = read_image_data_url(&path).unwrap();

            assert_eq!(
                url,
                format!("data:{mime};base64,{}", encode(&bytes)),
                "{name}"
            );
        }
    }

    #[test]
    fn 種類は拡張子ではなく中身で判断する() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("photo.txt");
        fs::write(&path, [&PNG_HEADER[..], b"data"].concat()).unwrap();

        assert!(
            read_image_data_url(&path)
                .unwrap()
                .starts_with("data:image/png;base64,")
        );
    }

    #[test]
    fn 画像でないファイルはエラーになる() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("note.png");
        fs::write(&path, "これは画像ではありません").unwrap();

        let err = read_image_data_url(&path).unwrap_err();

        assert!(
            err.contains("画像ファイルではありません（PNG・JPEG・GIF・WebP のみ）"),
            "{err}"
        );
    }

    #[test]
    fn svgは対象外でエラーになる() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("a.svg");
        fs::write(&path, "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>").unwrap();

        assert!(read_image_data_url(&path).is_err());
    }

    #[test]
    fn 短すぎるファイルや空のファイルはエラーになる() {
        let dir = tempdir().unwrap();
        let tiny = dir.path().join("tiny.png");
        fs::write(&tiny, [0x89, 0x50]).unwrap();
        let empty = dir.path().join("empty.png");
        fs::write(&empty, "").unwrap();

        assert!(read_image_data_url(&tiny).is_err());
        assert!(read_image_data_url(&empty).is_err());
    }

    #[test]
    fn 上限ちょうどの大きさは読み込めて超えるとエラーになる() {
        let dir = tempdir().unwrap();
        let ok = dir.path().join("ok.png");
        let mut bytes = PNG_HEADER.to_vec();
        bytes.resize(MAX_IMAGE_BYTES as usize, 0);
        fs::write(&ok, &bytes).unwrap();
        assert!(read_image_data_url(&ok).is_ok());

        let big = dir.path().join("big.png");
        bytes.push(0);
        fs::write(&big, &bytes).unwrap();
        let err = read_image_data_url(&big).unwrap_err();
        assert!(err.contains("画像が大きすぎます（上限 2 MB）"), "{err}");
    }

    #[test]
    fn ファイルがなければエラーになる() {
        let dir = tempdir().unwrap();

        let err = read_image_data_url(&dir.path().join("missing.png")).unwrap_err();

        assert!(err.contains("ファイルが見つかりません"), "{err}");
    }

    #[test]
    fn パスが空やフォルダならエラーになる() {
        let dir = tempdir().unwrap();

        assert!(
            read_image_data_url(std::path::Path::new(""))
                .unwrap_err()
                .contains("読み込み元のパスが空です")
        );
        assert!(
            read_image_data_url(dir.path())
                .unwrap_err()
                .contains("ファイルを読み込めません")
        );
    }

    #[test]
    fn コマンドはパス文字列を受け取ってデータurlを返す() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("cmd.png");
        fs::write(&path, [&PNG_HEADER[..], b"x"].concat()).unwrap();

        let url = load_image(path.to_string_lossy().into_owned()).unwrap();

        assert!(url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn ファイルの下のパスを読もうとすると_見つからない以外のエラーになる() {
        let dir = tempdir().unwrap();
        let file = dir.path().join("a.png");
        fs::write(&file, PNG_HEADER).unwrap();

        let err = read_image_data_url(&file.join("b.png")).unwrap_err();

        assert!(err.contains("ファイルを読み込めません"), "{err}");
    }
}
