import { toggleCollapse } from "./collapse";
import type { MindMap, NodeId } from "./mindmap";

/**
 * テキストに検索語を含むノードを、深さ優先（子の順）で返す。
 * 大文字小文字は区別せず、前後の空白は無視する（正規表現ではなく、普通の文字として探す）。
 * 折りたたまれて見えないノードも、対象にする。
 */
export function searchNodes(map: MindMap, query: string): NodeId[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];

  return documentOrder(map).filter((id) => map.nodes[id].text.toLowerCase().includes(needle));
}

/**
 * ノードが見えるよう、折りたたまれた祖先を、すべて展開する（元のマップは変更しない）。
 * すでに見えていれば、同じマップを返す。
 */
export function revealNode(map: MindMap, nodeId: NodeId): MindMap {
  const node = map.nodes[nodeId];
  if (!node) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }

  let revealed = map;
  for (let id = node.parentId; id !== null; id = map.nodes[id].parentId) {
    if (map.nodes[id].collapsed) revealed = toggleCollapse(revealed, id);
  }
  return revealed;
}

/** 中心ノードから、子の順に、深さ優先で、全ノード（折りたたまれた子孫も含む）を並べた順序 */
export function documentOrder(map: MindMap): NodeId[] {
  const order: NodeId[] = [];
  const walk = (id: NodeId) => {
    order.push(id);
    map.nodes[id].childIds.forEach(walk);
  };
  walk(map.rootId);
  return order;
}
