import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** アイコンの選択肢。記号は、選択肢の中のものだけを許可する（任意の文字列は、保存しない） */
export const ICON_PRESETS: { name: string; value: string }[] = [
  { name: "重要", value: "⭐" },
  { name: "完了", value: "✅" },
  { name: "注意", value: "⚠️" },
  { name: "質問", value: "❓" },
  { name: "アイデア", value: "💡" },
  { name: "目標", value: "🎯" },
  { name: "期限", value: "⏰" },
  { name: "緊急", value: "❗" },
  { name: "好き", value: "❤️" },
  { name: "メモ", value: "📌" },
  { name: "調査", value: "🔍" },
  { name: "お金", value: "💰" },
];

/** 値が、アイコンの選択肢の記号か */
export function isIcon(value: unknown): value is string {
  return typeof value === "string" && ICON_PRESETS.some((preset) => preset.value === value);
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
