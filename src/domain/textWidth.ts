/** 半角文字の幅は、文字サイズのこの割合として数える（全角は 1） */
const HALF_WIDTH_RATIO = 0.6;

/** 文字の幅の見積もり。全角は文字サイズと同じ幅、半角は 6 割の幅として足す */
export function estimateTextWidth(label: string, fontSize: number): number {
  return [...label].reduce(
    (sum, char) => sum + (char.charCodeAt(0) < 0x80 ? HALF_WIDTH_RATIO : 1) * fontSize,
    0,
  );
}
