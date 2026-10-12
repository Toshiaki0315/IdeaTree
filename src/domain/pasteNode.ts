import type { Subtree } from "./copyNode";
import type { MindMap, MindMapNode, NodeId } from "./mindmap";

/**
 * コピーしたサブツリーを、指定ノードの子の末尾に貼り付ける（元のマップは変更しない）。
 * 全ノードに新しいIDを振り、貼り付けた根は常にブランチになる。
 */
export function pasteNode(
  map: MindMap,
  targetId: NodeId,
  subtree: Subtree,
): { map: MindMap; nodeId: NodeId } {
  const target = map.nodes[targetId];
  if (!target) {
    throw new Error(`貼り付け先のノードが存在しません: ${targetId}`);
  }

  const pasted: Record<NodeId, MindMapNode> = {};
  const clone = (oldId: NodeId, parentId: NodeId): NodeId => {
    const source = subtree.nodes[oldId];
    const id = crypto.randomUUID();
    pasted[id] = {
      ...structuredClone(source),
      id,
      kind: "branch",
      parentId,
      childIds: source.childIds.map((childId) => clone(childId, id)),
    };
    return id;
  };
  const nodeId = clone(subtree.rootId, targetId);

  return {
    nodeId,
    map: {
      ...map,
      nodes: {
        ...map.nodes,
        ...pasted,
        [targetId]: { ...target, childIds: [...target.childIds, nodeId] },
      },
    },
  };
}
