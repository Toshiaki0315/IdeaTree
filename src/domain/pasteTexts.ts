import type { MindMap, NodeId } from "./mindmap";

export function pasteTexts(
  _map: MindMap,
  _targetId: NodeId,
  _lines: string[],
): { map: MindMap; nodeIds: NodeId[] } {
  throw new Error("未実装");
}
