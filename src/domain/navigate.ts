import type { MindMap, NodeId } from "./mindmap";

export type NavigateDirection = "parent" | "firstChild" | "prevSibling" | "nextSibling";

/** 木構造上の方向に隣接するノードのIDを返す。移動できない場合は自分自身を返す */
export function navigate(map: MindMap, nodeId: NodeId, direction: NavigateDirection): NodeId {
  const node = map.nodes[nodeId];
  if (!node) {
    throw new Error(`ノードが存在しません: ${nodeId}`);
  }

  switch (direction) {
    case "parent":
      return node.parentId ?? nodeId;
    case "firstChild":
      return node.childIds[0] ?? nodeId;
    case "prevSibling":
    case "nextSibling": {
      if (node.parentId === null) return nodeId;
      const siblings = map.nodes[node.parentId].childIds;
      const offset = direction === "prevSibling" ? -1 : 1;
      return siblings[siblings.indexOf(nodeId) + offset] ?? nodeId;
    }
  }
}
