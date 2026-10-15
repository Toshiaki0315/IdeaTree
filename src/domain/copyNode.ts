import type { MindMap, MindMapNode, NodeId } from "./mindmap";
import { documentOrder } from "./search";
import { topmostNodes } from "./selection";

/** コピーしたサブツリー。元のマップから切り離された、自己完結のデータ */
export type Subtree = MindMap;

/** 指定ノードとその子孫を、元のマップから切り離したサブツリーとして複製する */
export function copyNode(map: MindMap, nodeId: NodeId): Subtree {
  if (!map.nodes[nodeId]) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }

  const nodes: Record<NodeId, MindMapNode> = {};
  const stack: NodeId[] = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop() as NodeId;
    nodes[id] = structuredClone(map.nodes[id]);
    stack.push(...map.nodes[id].childIds);
  }
  nodes[nodeId].parentId = null;

  return { rootId: nodeId, nodes };
}

/**
 * 複数のノードを、それぞれ、サブツリーとしてコピーする（文書の順）。
 * 中心ノードと、祖先も選択されているノード（子孫）は、除く。コピーできるものがなければ、空の一覧
 */
export function copyNodes(map: MindMap, ids: readonly NodeId[]): Subtree[] {
  const top = new Set(topmostNodes(map, ids));
  return documentOrder(map)
    .filter((id) => top.has(id))
    .map((id) => copyNode(map, id));
}
