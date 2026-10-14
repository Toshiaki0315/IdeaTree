import { BRANCH_COLORS } from "./branchColor";

const COLOR_NAMES = ["赤", "オレンジ", "黄", "緑", "青", "紫", "ピンク", "茶"];

export interface Preset<T> {
  name: string;
  value: T;
}

/** スタイルパネルの色の選択肢（メインブランチのパレットと同じ） */
export const COLOR_PRESETS: Preset<string>[] = BRANCH_COLORS.map((value, i) => ({
  name: COLOR_NAMES[i],
  value,
}));

/** スタイルパネルのフォントの選択肢（macOS に標準で入っているフォント） */
export const FONT_PRESETS: Preset<string>[] = [
  { name: "ヒラギノ角ゴ", value: "Hiragino Sans" },
  { name: "ヒラギノ丸ゴ", value: "Hiragino Maru Gothic ProN" },
  { name: "ヒラギノ明朝", value: "Hiragino Mincho ProN" },
  { name: "等幅", value: "Menlo" },
];

/** スタイルパネルの文字サイズの選択肢 */
export const FONT_SIZE_PRESETS: number[] = [12, 14, 16, 20, 24, 32, 40, 48];

/** スタイルパネルの、画像の倍率の選択肢（標準の 100% は「自動」） */
export const IMAGE_SCALE_PRESETS: number[] = [0.5, 0.75, 1.5, 2, 3];
