import type { MindMap, NodeId } from "./mindmap";
import { removeRelationsOf } from "./relations";
import { topmostNodes } from "./selection";

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

  const nodes = Object.fromEntries(Object.entries(map.nodes).filter(([id]) => !removed.has(id)));
  const parent = nodes[target.parentId];
  nodes[parent.id] = {
    ...parent,
    childIds: parent.childIds.filter((id) => id !== nodeId),
  };

  // 削除するノードにつながる関連線も、外す
  return removeRelationsOf({ ...map, nodes }, removed);
}

/**
 * 複数のノードを、それぞれ子孫ごと削除する（元のマップは変更しない）。中心ノードは、削除しない。
 * 親と子の両方を指定しても、1回だけ削除する。削除できるノードがなければ、同じマップを返す。
 */
export function deleteNodes(map: MindMap, ids: readonly NodeId[]): MindMap {
  return topmostNodes(map, ids).reduce((current, id) => deleteNode(current, id), map);
}
