import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** システムのクリップボードに、文字列を書き込む */
export async function writeClipboardText(text: string): Promise<void> {
  try {
    await writeText(text);
  } catch (error) {
    throw new Error(`クリップボードに書き込めません: ${errorMessage(error)}`);
  }
}

/** システムのクリップボードの文字列を読み込む（文字列以外が入っている場合などは、エラーにする） */
export async function readClipboardText(): Promise<string> {
  try {
    return await readText();
  } catch (error) {
    throw new Error(`クリップボードを読み込めません: ${errorMessage(error)}`);
  }
}
