import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * ダイアログで画像（PNG・JPEG・GIF・WebP）を選ばせ、データURLとして返す。
 * キャンセル時は null。読み込めない画像（形式が違う・大きすぎる）は、理由を含むエラーにする。
 */
export async function pickImage(): Promise<string | null> {
  const path = await open({
    title: "画像を選ぶ",
    multiple: false,
    directory: false,
    filters: [{ name: "画像", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
  });
  if (path === null) return null;

  try {
    return await invoke<string>("load_image", { path });
  } catch (error) {
    throw new Error(`画像を読み込めません: ${errorMessage(error)}`);
  }
}
