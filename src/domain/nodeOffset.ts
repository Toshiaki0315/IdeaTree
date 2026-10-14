import type { MindMap, MindMapNode, NodeId, Position } from "./mindmap";

/** 値が、有限の数の x・y を持つ、位置のずれか */
export function isOffset(value: unknown): value is Position {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Number.isFinite((value as Position).x) &&
    Number.isFinite((value as Position).y)
  );
}

/**
 * ノードの手動配置（自動配置からの、位置のずれ）を設定する。ずれは、そのノードと子孫に効く。
 * ずれが 0 か undefined なら、外す。元のマップは変更しない。変化がなければ、同じマップを返す。
 * 中心ノードは、動かせない。
 */
export function setNodeOffset(map: MindMap, nodeId: NodeId, offset: Position | undefined): MindMap {
  const node = map.nodes[nodeId];
  if (!node) throw new Error(`ノードが存在しません: ${nodeId}`);
  if (node.parentId === null) throw new Error("中心ノードは、動かせません");
  if (offset !== undefined && !isOffset(offset)) throw new Error("位置のずれが不正です");

  const next =
    offset === undefined || (offset.x === 0 && offset.y === 0) ? undefined : { x: offset.x, y: offset.y };
  const current = node.offset;
  if (current === next || (current && next && current.x === next.x && current.y === next.y)) return map;

  const updated: MindMapNode = { ...node, offset: next };
  if (next === undefined) delete updated.offset;
  return { ...map, nodes: { ...map.nodes, [nodeId]: updated } };
}

/** ノードを、今のずれから、指定した量だけ、動かす（元に戻ったら、ずれを外す） */
export function nudgeNode(map: MindMap, nodeId: NodeId, dx: number, dy: number): MindMap {
  const current = map.nodes[nodeId]?.offset ?? { x: 0, y: 0 };
  return setNodeOffset(map, nodeId, { x: current.x + dx, y: current.y + dy });
}

/** ノードと子孫の手動配置を、すべて外す（自動配置に戻す）。中心ノードなら、すべて。変化がなければ、同じマップ */
export function resetOffsets(map: MindMap, nodeId: NodeId): MindMap {
  const nodes = { ...map.nodes };
  let changed = false;
  const stack: NodeId[] = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop() as NodeId;
    const node = nodes[id];
    if (node.offset !== undefined) {
      const rest = { ...node };
      delete rest.offset;
      nodes[id] = rest;
      changed = true;
    }
    stack.push(...node.childIds);
  }
  return changed ? { ...map, nodes } : map;
}
