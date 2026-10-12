import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** メインブランチに順に割り当てる、カラフルなパレット */
export const BRANCH_COLORS: readonly string[] = [
  "#E63946", // 赤
  "#E8710A", // オレンジ
  "#BF8600", // 黄（白背景で読めるよう濃いめ）
  "#2A9D8F", // 緑
  "#1A7FD1", // 青
  "#6C5CE7", // 紫
  "#E84393", // ピンク
  "#8D6E63", // 茶
];

/** メインブランチの色。保存された色がなければ（従来のファイル）、並び順から決める */
function mainBranchColor(map: MindMap, main: MindMapNode): string {
  if (main.branchColor !== undefined) return main.branchColor;
  const siblings = map.nodes[main.parentId as NodeId].childIds;
  return BRANCH_COLORS[siblings.indexOf(main.id) % BRANCH_COLORS.length];
}

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

  return mainBranchColor(map, node);
}

/**
 * 新しいメインブランチに割り当てる色を返す。
 * パレットのうち、最も使われていない色（同数ならパレット順で先頭）。
 * 色をブランチに保存するので、他のブランチを削除しても、既存の色は変わらない。
 */
export function nextBranchColor(map: MindMap): string {
  const used = map.nodes[map.rootId].childIds.map((id) => mainBranchColor(map, map.nodes[id]));
  const counts = BRANCH_COLORS.map((color) => used.filter((u) => u === color).length);
  return BRANCH_COLORS[counts.indexOf(Math.min(...counts))];
}
