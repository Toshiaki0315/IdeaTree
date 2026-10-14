import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { deserialize } from "../domain/deserialize";
import type { MindMap } from "../domain/mindmap";
import { errorMessage } from "./errorMessage";

/** パスを指定して、JSON ファイルを読み込み、マインドマップを復元する（ダイアログは開かない） */
export async function loadFileAt(path: string): Promise<{ map: MindMap; path: string }> {
  try {
    const contents = await invoke<string>("load_file", { path });
    return { map: deserialize(contents), path };
  } catch (error) {
    throw new Error(`読み込みに失敗しました: ${errorMessage(error)}`);
  }
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
    filters: [{ name: "IdeaTree", extensions: ["ideatree", "json"] }],
  });
  if (path === null) return null;
  return loadFileAt(path);
}
