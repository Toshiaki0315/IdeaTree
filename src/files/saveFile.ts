import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type { MindMap } from "../domain/mindmap";
import { serialize } from "../domain/serialize";

/** 保存するファイルの拡張子（どちらも、中身は同じ JSON）。IdeaTree の標準は .ideatree */
const EXTENSIONS = [".ideatree", ".json"];
const DEFAULT_EXTENSION = ".ideatree";

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
      defaultPath: "IdeaTree.ideatree",
      filters: [{ name: "IdeaTree", extensions: ["ideatree", "json"] }],
    });
    if (chosen === null) return null;
    path = EXTENSIONS.some((extension) => chosen.toLowerCase().endsWith(extension))
      ? chosen
      : chosen + DEFAULT_EXTENSION;
  }

  try {
    await invoke("save_file", { path, contents: serialize(map) });
  } catch (error) {
    throw new Error(`保存に失敗しました: ${errorMessage(error)}`);
  }
  return path;
}
