/** クリックできる範囲の、最小の大きさ（短いテキストでも、押しにくくならないように） */
export const MIN_HIT_WIDTH = 56;
export const MIN_HIT_HEIGHT = 36;

const PADDING_X = 12;
const PADDING_Y = 10;
/** 半角文字の幅は、文字サイズのこの割合として数える（全角は 1） */
const HALF_WIDTH_RATIO = 0.6;

/** 文字の幅の見積もり。全角は文字サイズと同じ幅、半角は 6 割の幅として足す */
export function estimateTextWidth(label: string, fontSize: number): number {
  return [...label].reduce(
    (sum, char) => sum + (char.charCodeAt(0) < 0x80 ? HALF_WIDTH_RATIO : 1) * fontSize,
    0,
  );
}

/** ラベルのまわりの、クリックできる範囲の大きさ（文字の幅の見積もりに、余白を足す） */
export function hitAreaSize(label: string, fontSize: number): { width: number; height: number } {
  return {
    width: Math.max(MIN_HIT_WIDTH, estimateTextWidth(label, fontSize) + PADDING_X * 2),
    height: Math.max(MIN_HIT_HEIGHT, fontSize + PADDING_Y * 2),
  };
}
