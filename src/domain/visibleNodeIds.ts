import type { MindMap, NodeId } from "./mindmap";

/**
 * 折りたたまれたノードの子孫を除いた、表示対象のノードIDを返す。
 * 順序は深さ優先（子の順）。折りたたまれたノード自身は含む。
 */
export function visibleNodeIds(map: MindMap): NodeId[] {
  const ids: NodeId[] = [];
  const walk = (id: NodeId) => {
    ids.push(id);
    const node = map.nodes[id];
    if (!node.collapsed) node.childIds.forEach(walk);
  };
  walk(map.rootId);
  return ids;
}
