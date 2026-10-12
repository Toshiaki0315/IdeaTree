import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/** 指定した親ノードの末尾に子ブランチを追加する（元のマップは変更しない） */
export function addChild(
  map: MindMap,
  parentId: NodeId,
  text: string,
): { map: MindMap; nodeId: NodeId } {
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
