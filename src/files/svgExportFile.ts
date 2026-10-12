import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { layout } from "../domain/layout";
import type { MindMap } from "../domain/mindmap";
import { exportSvg } from "../domain/svgExport";

const EXTENSION = ".svg";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * マインドマップをSVG画像として書き出し、書き出したパスを返す。
 * 保存ダイアログをキャンセルした場合は null。
 */
export async function svgExportFile(map: MindMap): Promise<string | null> {
  const chosen = await save({
    title: "SVGとして書き出し",
    defaultPath: "IdeaTree.svg",
    filters: [{ name: "SVG", extensions: ["svg"] }],
  });
  if (chosen === null) return null;
  const path = chosen.toLowerCase().endsWith(EXTENSION) ? chosen : chosen + EXTENSION;

  try {
    await invoke("save_file", { path, contents: exportSvg(layout(map)) });
  } catch (error) {
    throw new Error(`書き出しに失敗しました: ${errorMessage(error)}`);
  }
  return path;
}
