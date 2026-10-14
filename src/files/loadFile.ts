import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { deserialize } from "../domain/deserialize";
import type { MindMap } from "../domain/mindmap";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 読み込みダイアログでJSONファイルを選ばせ、マインドマップを復元して返す。
 * キャンセル時は null。壊れたファイルは、理由を含むエラーにする。
 */
export async function loadFile(): Promise<{ map: MindMap; path: string } | null> {
  const path = await open({
    title: "マインドマップを開く",
    multiple: false,
    directory: false,
    filters: [{ name: "IdeaTree (JSON)", extensions: ["json"] }],
  });
  if (path === null) return null;

  try {
    const contents = await invoke<string>("load_file", { path });
    return { map: deserialize(contents), path };
  } catch (error) {
    throw new Error(`読み込みに失敗しました: ${errorMessage(error)}`);
  }
}

export async function loadFileAt(_path: string): Promise<{ map: MindMap; path: string }> {
  throw new Error("未実装");
}
