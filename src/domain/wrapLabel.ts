import { estimateTextWidth } from "./textWidth";

/** 1行に入れる幅の上限（文字サイズの何倍か。全角なら、この文字数） */
export const MAX_LABEL_EM = 10;

/** 行の高さは、文字サイズのこの倍 */
export const LINE_HEIGHT_RATIO = 1.25;

/**
 * ラベルを、1行の幅の上限（文字サイズ × MAX_LABEL_EM）で折り返す。
 * 英単語は空白の位置で折り返し（行頭・行末の空白は捨てる）、区切れないときは文字の途中で折り返す。
 * 空のラベルも、1行（空の行）として返す。
 */
export function wrapLabel(label: string, fontSize: number): string[] {
  const maxWidth = MAX_LABEL_EM * fontSize;
  const lines: string[] = [];
  let current = "";

  for (const char of label) {
    if (char === " " && current === "") continue; // 行頭の空白は捨てる
    if (estimateTextWidth(current + char, fontSize) > maxWidth + 1e-9) {
      const space = current.lastIndexOf(" ");
      if (char === " ") {
        lines.push(current.trimEnd());
        current = "";
        continue;
      }
      if (space > 0) {
        lines.push(current.slice(0, space).trimEnd());
        current = current.slice(space + 1);
      } else {
        lines.push(current);
        current = "";
      }
    }
    current += char;
  }
  lines.push(current.trimEnd());
  return lines;
}

export interface LabelBlock {
  /** 折り返したあとの、各行 */
  lines: string[];
  /** 一番広い行の幅 */
  width: number;
  /** 全体の高さ */
  height: number;
}

/** 折り返したラベルの、行と全体の大きさ */
export function labelBlock(label: string, fontSize: number): LabelBlock {
  const lines = wrapLabel(label, fontSize);
  return {
    lines,
    width: Math.max(...lines.map((line) => estimateTextWidth(line, fontSize))),
    height: lines.length * fontSize * LINE_HEIGHT_RATIO,
  };
}

/** 行の数だけの、各行の中心の y 座標（全体の中心が centerY になるよう、上下に並べる） */
export function lineCenters(count: number, fontSize: number, centerY: number): number[] {
  const step = fontSize * LINE_HEIGHT_RATIO;
  return Array.from({ length: count }, (_, i) => centerY + (i - (count - 1) / 2) * step);
}
