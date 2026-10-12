import type { MindMap, NodeId } from "./mindmap";

/** メインブランチに順に割り当てる、カラフルなパレット */
export const BRANCH_COLORS: readonly string[] = [
  "#E63946", // 赤
  "#F4A100", // オレンジ
  "#E9C46A", // 黄
  "#2A9D8F", // 緑
  "#1D9BF0", // 青
  "#6C5CE7", // 紫
  "#E84393", // ピンク
  "#8D6E63", // 茶
];

/**
 * ノードが属するメインブランチ（ルート直下）の色を返す。
 * ルートには色がないため null を返す。
 */
export function getBranchColor(map: MindMap, nodeId: NodeId): string | null {
  let node = map.nodes[nodeId];
  if (!node) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }

  while (node.parentId !== null && map.nodes[node.parentId].parentId !== null) {
    node = map.nodes[node.parentId];
  }
  if (node.parentId === null) return null;

  const index = map.nodes[node.parentId].childIds.indexOf(node.id);
  return BRANCH_COLORS[index % BRANCH_COLORS.length];
}
