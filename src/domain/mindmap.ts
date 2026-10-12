export type NodeId = string;

export interface Position {
  x: number;
  y: number;
}

export interface MindMapNode {
  id: NodeId;
  kind: "central" | "branch";
  text: string;
  parentId: NodeId | null;
  childIds: NodeId[];
  position: Position;
}

export interface MindMap {
  rootId: NodeId;
  nodes: Record<NodeId, MindMapNode>;
}

/** セントラルイメージ（中央ノード）だけを持つマインドマップを作成する */
export function createMindMap(title: string): MindMap {
  const id = crypto.randomUUID();
  const root: MindMapNode = {
    id,
    kind: "central",
    text: title,
    parentId: null,
    childIds: [],
    position: { x: 0, y: 0 },
  };
  return { rootId: id, nodes: { [id]: root } };
}
