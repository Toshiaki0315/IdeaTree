import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** アイコンの図形の1つ。24×24 の座標の、パス（塗りと線の色は、#RRGGBB か none） */
export interface IconShape {
  d: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
}

export interface IconPreset {
  /** 表示する名前 */
  name: string;
  /** ノードに保存する識別子（英小文字） */
  value: string;
  /** アイコンの絵（24×24 の座標で描く） */
  shapes: IconShape[];
}

/** 円（中心 cx, cy、半径 r）を表すパス */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r}A${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}Z`;
}

const WHITE = "#FFFFFF";

/**
 * アイコンの選択肢。IdeaTree のオリジナルの、フラットで丸みのある、カラフルな絵。
 * 保存するのは識別子だけで、任意の文字列やデータは、保存しない。
 */
export const ICON_PRESETS: IconPreset[] = [
  {
    name: "重要",
    value: "star",
    shapes: [
      {
        d: "M12 2L14.9 8.6L22 9.3L16.6 14L18.2 21L12 17.3L5.8 21L7.4 14L2 9.3L9.1 8.6Z",
        fill: "#F4B400",
        stroke: "#C98A00",
        strokeWidth: 1.2,
      },
    ],
  },
  {
    name: "完了",
    value: "check",
    shapes: [
      { d: circle(12, 12, 10), fill: "#2E9E5B" },
      { d: "M7 12.5L10.2 15.7L17 8.8", stroke: WHITE, strokeWidth: 2.6 },
    ],
  },
  {
    name: "注意",
    value: "warning",
    shapes: [
      { d: "M12 3L22 20H2Z", fill: "#F59E0B", stroke: "#D97706", strokeWidth: 1.6 },
      { d: "M12 9.5V14", stroke: WHITE, strokeWidth: 2.4 },
      { d: "M12 17.2V17.3", stroke: WHITE, strokeWidth: 2.6 },
    ],
  },
  {
    name: "質問",
    value: "question",
    shapes: [
      { d: circle(12, 12, 10), fill: "#3B82F6" },
      { d: "M9.2 9.3A2.9 2.9 0 1 1 13.4 11.9C12.5 12.4 12 13 12 14", stroke: WHITE, strokeWidth: 2.2 },
      { d: "M12 17.4V17.5", stroke: WHITE, strokeWidth: 2.6 },
    ],
  },
  {
    name: "アイデア",
    value: "idea",
    shapes: [
      {
        d: "M12 2.5A6.5 6.5 0 0 0 8.4 14.4C9.1 14.9 9.5 15.6 9.5 16.4V17H14.5V16.4C14.5 15.6 14.9 14.9 15.6 14.4A6.5 6.5 0 0 0 12 2.5Z",
        fill: "#FFD43B",
        stroke: "#E0A800",
        strokeWidth: 1.2,
      },
      { d: "M9.7 19.5H14.3M10.5 21.6H13.5", stroke: "#7B6A3A", strokeWidth: 1.8 },
    ],
  },
  {
    name: "目標",
    value: "target",
    shapes: [
      { d: circle(12, 12, 10), fill: "#EF4444" },
      { d: circle(12, 12, 6.5), fill: WHITE },
      { d: circle(12, 12, 3.2), fill: "#EF4444" },
    ],
  },
  {
    name: "期限",
    value: "deadline",
    shapes: [
      { d: circle(12, 12, 9), fill: "#EEF2FF", stroke: "#6366F1", strokeWidth: 2.2 },
      { d: "M12 7V12.2L15.4 14.2", stroke: "#6366F1", strokeWidth: 2.2 },
    ],
  },
  {
    name: "緊急",
    value: "urgent",
    shapes: [
      { d: "M6 3V21", stroke: "#7F1D1D", strokeWidth: 2.2 },
      { d: "M6 4H18L15.4 8L18 12H6Z", fill: "#DC2626", stroke: "#B91C1C", strokeWidth: 1 },
    ],
  },
  {
    name: "好き",
    value: "heart",
    shapes: [
      {
        d: "M12 21C12 21 4 15.8 4 10A4.6 4.6 0 0 1 12 7A4.6 4.6 0 0 1 20 10C20 15.8 12 21 12 21Z",
        fill: "#EC4899",
        stroke: "#BE185D",
        strokeWidth: 1.2,
      },
    ],
  },
  {
    name: "メモ",
    value: "memo",
    shapes: [
      {
        d: "M12 2A6.5 6.5 0 0 0 5.5 8.5C5.5 14 12 22 12 22C12 22 18.5 14 18.5 8.5A6.5 6.5 0 0 0 12 2Z",
        fill: "#8B5CF6",
      },
      { d: circle(12, 8.6, 2.6), fill: WHITE },
    ],
  },
  {
    name: "調査",
    value: "research",
    shapes: [
      { d: circle(10.5, 10.5, 7), fill: "#E0F2FE", stroke: "#0EA5E9", strokeWidth: 2.2 },
      { d: "M15.6 15.6L21 21", stroke: "#0369A1", strokeWidth: 3 },
    ],
  },
  {
    name: "お金",
    value: "money",
    shapes: [
      { d: circle(12, 12, 9.5), fill: "#FACC15", stroke: "#CA8A04", strokeWidth: 1.4 },
      { d: circle(12, 12, 6.8), stroke: "#CA8A04", strokeWidth: 1 },
      { d: "M8.5 7.5L12 12.2L15.5 7.5M12 12.2V17M9 13H15M9 15.2H15", stroke: "#A16207", strokeWidth: 1.8 },
    ],
  },
];

/** 以前の版で保存していた、絵文字のアイコン → 現在の識別子 */
const LEGACY_EMOJI: Record<string, string> = {
  "⭐": "star",
  "✅": "check",
  "⚠️": "warning",
  "❓": "question",
  "💡": "idea",
  "🎯": "target",
  "⏰": "deadline",
  "❗": "urgent",
  "❤️": "heart",
  "📌": "memo",
  "🔍": "research",
  "💰": "money",
};

/** 識別子から、アイコンの図形を返す。選択肢にない識別子は、空 */
export function iconShapes(id: string): IconShape[] {
  return ICON_PRESETS.find((preset) => preset.value === id)?.shapes ?? [];
}

/** 値が、アイコンの選択肢の識別子か */
export function isIcon(value: unknown): value is string {
  return typeof value === "string" && ICON_PRESETS.some((preset) => preset.value === value);
}

/** 以前の絵文字のアイコンを、現在の識別子に変換する。絵文字でなければ undefined */
export function legacyIconToId(value: unknown): string | undefined {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LEGACY_EMOJI, value)
    ? LEGACY_EMOJI[value]
    : undefined;
}

/**
 * ノードのアイコンを設定する（undefined で外す）。元のマップは変更しない。
 * 変化がなければ、同じマップを返す。
 */
export function setNodeIcon(map: MindMap, nodeId: NodeId, icon: string | undefined): MindMap {
  const node = map.nodes[nodeId];
  if (!node) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }
  if (icon !== undefined && !isIcon(icon)) {
    throw new Error("アイコンは、選択肢の中から選んでください");
  }
  if (node.icon === icon) return map;

  const updated: MindMapNode = { ...node, icon };
  if (icon === undefined) delete updated.icon;
  return { ...map, nodes: { ...map.nodes, [nodeId]: updated } };
}
