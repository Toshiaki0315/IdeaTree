/** テーマの設定。自動は、システムの配色（ライト・ダーク）に合わせる */
export type ThemeSetting = "auto" | "light" | "dark";
/** 実際に使うテーマ */
export type Theme = "light" | "dark";

/** マップを描くときの配色（枝の色は、どちらのテーマでも同じ） */
export interface Palette {
  /** 背景（ラベルの縁取りと、中心の楕円の塗りにも使う） */
  background: string;
  /** 中心ノードの文字と枠の色（色を指定していないとき） */
  centralText: string;
}

export const PALETTES: Record<Theme, Palette> = {
  light: { background: "#FFFFFF", centralText: "#333333" },
  dark: { background: "#1E1F22", centralText: "#E6E6E6" },
};

/** 保存した設定を読む。知らない値や、ないときは、自動 */
export function parseThemeSetting(value: unknown): ThemeSetting {
  return value === "light" || value === "dark" ? value : "auto";
}

/** 設定とシステムの配色から、実際に使うテーマを決める */
export function resolveTheme(setting: ThemeSetting, systemDark: boolean): Theme {
  if (setting === "auto") return systemDark ? "dark" : "light";
  return setting;
}
