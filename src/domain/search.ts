import type { MindMap, NodeId } from "./mindmap";

export function searchNodes(_map: MindMap, _query: string): NodeId[] {
  throw new Error("未実装");
}

export function revealNode(_map: MindMap, _nodeId: NodeId): MindMap {
  throw new Error("未実装");
}
