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
 * ドラッグ移動で、指定したノードの子にできるか。
 * 中心ノード、自分自身・子孫の下、今の親の下（変化がない）、存在しないノードは、できない。
 */
export function canMoveTo(map: MindMap, nodeId: NodeId, targetId: NodeId): boolean {
  const node = map.nodes[nodeId];
  return (
    node !== undefined &&
    node.parentId !== null &&
    map.nodes[targetId] !== undefined &&
    node.parentId !== targetId &&
    !isSelfOrDescendant(map, targetId, nodeId)
  );
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

/**
 * ドラッグで、兄弟のノードの位置に入れ替えられるか。
 * 同じ親を持つ、別のノードの上だけ。中心ノード・自分自身・存在しないノードは、できない。
 */
export function canReorderTo(map: MindMap, nodeId: NodeId, targetId: NodeId): boolean {
  const node = map.nodes[nodeId];
  const target = map.nodes[targetId];
  return (
    node !== undefined &&
    target !== undefined &&
    node.parentId !== null &&
    node.parentId === target.parentId &&
    nodeId !== targetId
  );
}

/**
 * ドラッグで離したときの移動。
 * child: ドロップ先の子の末尾につなぎ替える。reorder: 兄弟の上で離し、そのノードがあった位置に入れる。
 */
export function dropNode(
  map: MindMap,
  nodeId: NodeId,
  targetId: NodeId,
  mode: "child" | "reorder",
): MindMap {
  if (mode === "child") return moveNode(map, nodeId, targetId);
  if (!canReorderTo(map, nodeId, targetId)) {
    throw new Error("兄弟のノードの上でのみ、入れ替えられます");
  }
  const parent = map.nodes[nodeId].parentId as NodeId;
  return moveNode(map, nodeId, parent, map.nodes[parent].childIds.indexOf(targetId));
}
