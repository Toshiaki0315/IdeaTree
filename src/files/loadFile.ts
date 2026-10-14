import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { deserialize } from "../domain/deserialize";
import type { MindMap } from "../domain/mindmap";
import { fromOutline } from "../domain/outline";
import { errorMessage } from "./errorMessage";

/** 読み込んだ文書。imported が true なら、アウトラインの取り込み（保存先は、まだない） */
export interface LoadedDocument {
  map: MindMap;
  path: string;
  imported?: true;
}

/** パスの拡張子が、アウトライン（Markdown・テキスト）か */
function isOutlinePath(path: string): boolean {
  return /\.(md|markdown|txt)$/i.test(path);
}

/**
 * パスを指定して、ファイルを読み込み、マインドマップを復元する（ダイアログは開かない）。
 * .md・.markdown・.txt は、アウトラインとして取り込む（imported が true）。それ以外は、IdeaTree の JSON。
 */
export async function loadFileAt(path: string): Promise<LoadedDocument> {
  try {
    const contents = await invoke<string>("load_file", { path });
    if (isOutlinePath(path)) return { map: fromOutline(contents), path, imported: true };
    return { map: deserialize(contents), path };
  } catch (error) {
    throw new Error(`読み込みに失敗しました: ${errorMessage(error)}`);
  }
}

/**
 * 読み込みダイアログでJSONファイルを選ばせ、マインドマップを復元して返す。
 * キャンセル時は null。壊れたファイルは、理由を含むエラーにする。
 */
export async function loadFile(): Promise<LoadedDocument | null> {
  const path = await open({
    title: "マインドマップを開く",
    multiple: false,
    directory: false,
    filters: [
      { name: "IdeaTree", extensions: ["ideatree", "json"] },
      { name: "アウトライン（Markdown・テキスト）", extensions: ["md", "markdown", "txt"] },
    ],
  });
  if (path === null) return null;
  return loadFileAt(path);
}
