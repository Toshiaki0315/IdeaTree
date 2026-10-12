import type { MindMap, NodeId } from "./mindmap";

/** 指定ノードをサブツリーごと削除する（元のマップは変更しない） */
export function deleteNode(map: MindMap, nodeId: NodeId): MindMap {
  const target = map.nodes[nodeId];
  if (!target) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }
  if (target.parentId === null) {
    throw new Error("ルートノードは削除できません");
  }

  const removed = new Set<NodeId>();
  const stack: NodeId[] = [nodeId];
  while (stack.length > 0) {
    const id = stack.pop() as NodeId;
    removed.add(id);
    stack.push(...map.nodes[id].childIds);
  }

  const nodes = Object.fromEntries(
    Object.entries(map.nodes).filter(([id]) => !removed.has(id)),
  );
  const parent = nodes[target.parentId];
  nodes[parent.id] = {
    ...parent,
    childIds: parent.childIds.filter((id) => id !== nodeId),
  };

  return { ...map, nodes };
}
