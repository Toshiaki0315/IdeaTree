import { nextBranchColor } from "./branchColor";
import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** 指定した親ノードの末尾に子ブランチを追加する（元のマップは変更しない） */
export function addChild(map: MindMap, parentId: NodeId, text: string): { map: MindMap; nodeId: NodeId } {
  const parent = map.nodes[parentId];
  if (!parent) {
    throw new Error(`親ノードが存在しません: ${parentId}`);
  }

  const nodeId = crypto.randomUUID();
  const child: MindMapNode = {
    id: nodeId,
    kind: "branch",
    text,
    parentId,
    childIds: [],
    position: { ...parent.position },
  };
  // 中心ノードの子（メインブランチ）には、色を割り当てて保存する
  if (parent.parentId === null) child.branchColor = nextBranchColor(map);

  return {
    nodeId,
    map: {
      ...map,
      nodes: {
        ...map.nodes,
        [parentId]: { ...parent, childIds: [...parent.childIds, nodeId] },
        [nodeId]: child,
      },
    },
  };
}
