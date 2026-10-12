import { nextBranchColor } from "./branchColor";
import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** 指定ノードの直後に兄弟ブランチを追加する（元のマップは変更しない） */
export function addSibling(
  map: MindMap,
  nodeId: NodeId,
  text: string,
): { map: MindMap; nodeId: NodeId } {
  const base = map.nodes[nodeId];
  if (!base) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }
  if (base.parentId === null) {
    throw new Error("ルートノードには兄弟ノードを追加できません");
  }

  const parent = map.nodes[base.parentId];
  const newId = crypto.randomUUID();
  const sibling: MindMapNode = {
    id: newId,
    kind: "branch",
    text,
    parentId: parent.id,
    childIds: [],
    position: { ...base.position },
  };
  // 新しいメインブランチ（中心ノードの子）には、色を割り当てて保存する
  if (parent.parentId === null) sibling.branchColor = nextBranchColor(map);

  const index = parent.childIds.indexOf(nodeId);
  const childIds = [...parent.childIds];
  childIds.splice(index + 1, 0, newId);

  return {
    nodeId: newId,
    map: {
      ...map,
      nodes: {
        ...map.nodes,
        [parent.id]: { ...parent, childIds },
        [newId]: sibling,
      },
    },
  };
}
