import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { bytesToBase64 } from "../domain/base64";
import { layout } from "../domain/layout";
import type { MindMap } from "../domain/mindmap";
import { buildPdf } from "../domain/pdf";
import { exportSvg } from "../domain/svgExport";
import { rasterizeSvg } from "./rasterize";

/** 画面の 1px（96dpi）を、PDF の pt（72dpi）にする倍率 */
const PX_TO_PT = 0.75;

type Format = "svg" | "png" | "pdf";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** パスの拡張子から、書き出す形式を決める（知らない拡張子や、ない場合は SVG） */
function formatOf(path: string): Format {
  const extension = path.toLowerCase().split(".").pop();
  return extension === "png" || extension === "pdf" ? extension : "svg";
}

/** exportSvg が書いた、画像の大きさ（<svg> の width と height） */
function sizeOf(svg: string): { width: number; height: number } {
  const [, width, height] = /<svg [^>]*width="([\d.]+)" height="([\d.]+)"/.exec(svg) as RegExpExecArray;
  return { width: Number(width), height: Number(height) };
}

/**
 * マインドマップを、SVG・PNG・PDF のいずれかで書き出し、書き出したパスを返す。
 * 形式は、保存ダイアログで選んだファイルの拡張子で決まる（知らない拡張子は、SVG として .svg を補う）。
 * ダイアログをキャンセルした場合は null。
 */
export async function exportFile(map: MindMap): Promise<string | null> {
  const chosen = await save({
    title: "書き出し",
    defaultPath: "IdeaTree.svg",
    filters: [
      { name: "SVG（ベクター画像）", extensions: ["svg"] },
      { name: "PNG（画像）", extensions: ["png"] },
      { name: "PDF", extensions: ["pdf"] },
    ],
  });
  if (chosen === null) return null;

  const format = formatOf(chosen);
  const path = format === "svg" && !chosen.toLowerCase().endsWith(".svg") ? `${chosen}.svg` : chosen;

  try {
    const svg = exportSvg(layout(map));
    if (format === "svg") {
      await invoke("save_file", { path, contents: svg });
    } else {
      const { width, height } = sizeOf(svg);
      let bytes: Uint8Array;
      if (format === "png") {
        bytes = (await rasterizeSvg(svg, width, height, "png")).bytes;
      } else {
        const image = await rasterizeSvg(svg, width, height, "jpeg");
        bytes = buildPdf({
          jpeg: image.bytes,
          imageWidth: image.width,
          imageHeight: image.height,
          pageWidth: width * PX_TO_PT,
          pageHeight: height * PX_TO_PT,
        });
      }
      await invoke("save_binary_file", { path, dataBase64: bytesToBase64(bytes) });
    }
  } catch (error) {
    throw new Error(`書き出しに失敗しました: ${errorMessage(error)}`);
  }
  return path;
}
