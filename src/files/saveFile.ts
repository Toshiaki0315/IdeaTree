import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { MindMap } from "../domain/mindmap";
import { serialize } from "../domain/serialize";

const EXTENSION = ".json";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * マインドマップをJSONファイルとして保存し、保存したパスを返す。
 * existingPath があればダイアログを開かず上書き保存し、
 * なければ保存ダイアログで選ばせる（キャンセル時は null）。
 */
export async function saveFile(map: MindMap, existingPath?: string): Promise<string | null> {
  let path = existingPath;
  if (path === undefined) {
    const chosen = await save({
      title: "マインドマップを保存",
      defaultPath: "IdeaTree.json",
      filters: [{ name: "IdeaTree (JSON)", extensions: ["json"] }],
    });
    if (chosen === null) return null;
    path = chosen.toLowerCase().endsWith(EXTENSION) ? chosen : chosen + EXTENSION;
  }

  try {
    await invoke("save_file", { path, contents: serialize(map) });
  } catch (error) {
    throw new Error(`保存に失敗しました: ${errorMessage(error)}`);
  }
  return path;
}
