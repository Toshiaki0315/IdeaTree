import { nextBranchColor } from "./branchColor";
import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** nodeId が ancestorId の子孫（または自分自身）か */
function isSelfOrDescendant(map: MindMap, nodeId: NodeId, ancestorId: NodeId): boolean {
  for (let id: NodeId | null = nodeId; id !== null; id = map.nodes[id].parentId) {
    if (id === ancestorId) return true;
  }
  return false;
}

/**
 * ノードを（子孫ごと）別の親へ移動する。同じ親を指定すると、並べ替えになる（元のマップは変更しない）。
 * index は、移動後の、新しい親の子の中での位置。省略すると末尾。範囲外は先頭か末尾に収める。
 * 位置が変わらないときは、同じマップを返す。移動先が折りたたまれていれば、展開する。
 */
export function moveNode(map: MindMap, nodeId: NodeId, newParentId: NodeId, index?: number): MindMap {
  const node = map.nodes[nodeId];
  if (!node) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }
  if (node.parentId === null) {
    throw new Error("ルートノードは移動できません");
  }
  const target = map.nodes[newParentId];
  if (!target) {
    throw new Error(`移動先のノードが存在しません: ${newParentId}`);
  }
  if (isSelfOrDescendant(map, newParentId, nodeId)) {
    throw new Error("自分自身や子孫の下には移動できません");
  }

  const oldParent = map.nodes[node.parentId];
  const sameParent = oldParent.id === target.id;
  const siblings = target.childIds.filter((id) => id !== nodeId);
  const position = Math.min(Math.max(index ?? siblings.length, 0), siblings.length);
  if (sameParent && oldParent.childIds.indexOf(nodeId) === position) return map;

  const moved: MindMapNode = { ...node, parentId: newParentId };
  if (target.parentId !== null) {
    delete moved.branchColor;
  } else if (!sameParent) {
    // 新しいメインブランチになるので、色を割り当てる
    moved.branchColor = nextBranchColor(map);
  }

  const updatedTarget: MindMapNode = {
    ...target,
    childIds: [...siblings.slice(0, position), nodeId, ...siblings.slice(position)],
  };
  if (target.collapsed) updatedTarget.collapsed = false;

  const nodes = { ...map.nodes, [nodeId]: moved };
  if (!sameParent) {
    nodes[oldParent.id] = {
      ...oldParent,
      childIds: oldParent.childIds.filter((id) => id !== nodeId),
    };
  }
  nodes[target.id] = updatedTarget;
  return { ...map, nodes };
}
