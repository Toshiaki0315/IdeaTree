import type { MindMap, NodeId } from "./mindmap";

/**
 * ノードの折りたたみ／展開を切り替える（元のマップは変更しない）。
 * 子を持たないノードは折りたためないので、同じマップを返す。
 * （子を失ったのに折りたたみが残っているノードは、展開状態に戻す）
 */
export function toggleCollapse(map: MindMap, nodeId: NodeId): MindMap {
  const node = map.nodes[nodeId];
  if (!node) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }

  if (node.childIds.length === 0 && !node.collapsed) return map;

  return {
    ...map,
    nodes: { ...map.nodes, [nodeId]: { ...node, collapsed: !node.collapsed } },
  };
}
