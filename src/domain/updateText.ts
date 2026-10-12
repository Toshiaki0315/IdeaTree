import type { MindMap, NodeId } from "./mindmap";

/** 指定ノードのテキストを更新する（元のマップは変更しない） */
export function updateText(map: MindMap, nodeId: NodeId, text: string): MindMap {
  const node = map.nodes[nodeId];
  if (!node) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }

  return { ...map, nodes: { ...map.nodes, [nodeId]: { ...node, text } } };
}
