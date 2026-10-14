import { labelBlock } from "./wrapLabel";

export { estimateTextWidth } from "./textWidth";

/** クリックできる範囲の、最小の大きさ（短いテキストでも、押しにくくならないように） */
export const MIN_HIT_WIDTH = 56;
export const MIN_HIT_HEIGHT = 36;

const PADDING_X = 12;
const PADDING_Y = 10;

/** ラベルのまわりの、クリックできる範囲の大きさ（折り返したラベルの大きさに、余白を足す） */
export function hitAreaSize(label: string, fontSize: number): { width: number; height: number } {
  const block = labelBlock(label, fontSize);
  return {
    width: Math.max(MIN_HIT_WIDTH, block.width + PADDING_X * 2),
    height: Math.max(MIN_HIT_HEIGHT, block.height + PADDING_Y * 2),
  };
}
